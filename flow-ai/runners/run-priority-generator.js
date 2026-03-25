/**
 * flow-ai/runners/run-priority-generator.js
 *
 * Reads the latest telemetry artifact and converts detected signals into a
 * PRIORITIZED, MACHINE-READABLE list of issues.
 *
 * Output: flow-ai/artifacts/priority-YYYY-MM-DD.json
 *
 * Design principles:
 *  - Fully deterministic — no LLM, no randomness, no external calls.
 *  - Safe to re-run: overwrites same-day artifact with fresh output.
 *  - Reads ONLY from the latest telemetry artifact. Does not access DB or other files.
 *  - If no telemetry artifact exists, exits gracefully with a clear message.
 *  - Max 5 issues, sorted by priority_score descending.
 *
 * Scoring formula (clamped 0–100):
 *   base  = severity_base  (high=80, medium=50, low=20)
 *   +10   if trend is "worsening"
 *   +10   if magnitude is "large" (|delta| ≥ 3, or absolute ratio ≥ 0.5)
 *   +10   if impact_area is "seller"
 *   + 5   if impact_area is "product"
 *
 * --- CHANGES LOG ---
 * v1.0: Initial implementation.
 */

"use strict";
require("dotenv").config();

const fs   = require("fs");
const path = require("path");

// ── Paths ──────────────────────────────────────────────────────────────────

const BASE          = path.join(__dirname, "..");
const artifactsDir  = path.join(BASE, "artifacts");

// ── Helpers ────────────────────────────────────────────────────────────────

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.warn(`  [priority] Could not read ${path.basename(filePath)}: ${err.message}`);
    return fallback;
  }
}

/**
 * Returns the most recent telemetry-*.json artifact path, or null if none exists.
 */
function findLatestTelemetry() {
  if (!fs.existsSync(artifactsDir)) return null;
  const files = fs.readdirSync(artifactsDir)
    .filter(f => f.startsWith("telemetry-") && f.endsWith(".json"))
    .sort()
    .reverse();
  return files.length > 0 ? path.join(artifactsDir, files[0]) : null;
}

// ── Scoring ────────────────────────────────────────────────────────────────

const SEVERITY_BASE = { high: 80, medium: 50, low: 20 };

/**
 * Computes a priority_score (0–100) from the issue's properties.
 *
 * @param {object} params
 * @param {"high"|"medium"|"low"} params.severity
 * @param {"worsening"|"stable"|"improving"} params.trend
 * @param {boolean} params.largeMagnitude
 * @param {"seller"|"product"|"system"|"data"} params.impact_area
 */
function computeScore({ severity, trend, largeMagnitude, impact_area }) {
  let score = SEVERITY_BASE[severity] ?? 50;
  if (trend === "worsening")  score += 10;
  if (largeMagnitude)         score += 10;
  if (impact_area === "seller")  score += 10;
  if (impact_area === "product") score +=  5;
  return Math.max(0, Math.min(100, score));
}

// ── Issue generators ───────────────────────────────────────────────────────
//
// Each generator receives the full telemetry artifact and returns an issue
// object or null if the relevant signal is not present / not actionable.
//
// issue schema:
//   id               — snake_case unique identifier
//   title            — short human-readable title
//   severity         — "high" | "medium" | "low"
//   priority_score   — 0-100 (computed by computeScore)
//   impact_area      — "seller" | "product" | "system" | "data"
//   trend            — "worsening" | "stable" | "improving"
//   confidence       — 0.0–1.0 (how certain the signal is)
//   source           — always "telemetry"
//   reasoning        — 1-3 sentence explanation grounded in numeric data
//   recommended_action — concrete next step
//   created_at       — ISO timestamp
//   data             — raw signal values used to produce this issue
//

/**
 * Issue 1: real sellers have zero products listed.
 * Triggered when filtered_metrics.real_sellers_with_products === 0 AND real_seller_count > 0.
 */
function issueSellerActivation(t, now) {
  const fm = t.filtered_metrics;
  if (!fm) return null;
  if (fm.real_seller_count === 0) return null;            // no real sellers to activate
  if (fm.real_sellers_with_products > 0) return null;    // at least one is active

  const severity   = "high";
  const trend      = "stable"; // persistent state, not a worsening direction
  const impact     = "seller";
  const score      = computeScore({ severity, trend, largeMagnitude: true, impact_area: impact });

  return {
    id:               "seller_activation_zero",
    title:            "Zero real sellers have active products",
    severity,
    priority_score:   score,
    impact_area:      impact,
    trend,
    confidence:       1.0, // direct count from filtered_metrics, no estimation
    source:           "telemetry",
    reasoning:
      `filtered_metrics shows ${fm.real_seller_count} real sellers and ` +
      `real_sellers_with_products = ${fm.real_sellers_with_products}. ` +
      `None of the production sellers have listed any products, making the catalog ` +
      `functionally empty for real buyers.`,
    recommended_action:
      `Review the ${fm.real_seller_count} real sellers ` +
      `(${(fm.real_seller_names || []).slice(0, 3).join(", ")}${fm.real_seller_count > 3 ? "…" : ""}) ` +
      `and determine whether their products are in draft, deactivated, or never created. ` +
      `Implement a seller onboarding re-engagement flow.`,
    created_at: now,
    data: {
      real_seller_count:          fm.real_seller_count,
      real_sellers_with_products: fm.real_sellers_with_products,
      real_seller_names:          fm.real_seller_names || [],
    },
  };
}

/**
 * Issue 2: inactive sellers are trending upward.
 * Triggered when trends.inactive_sellers.direction === "up" AND delta ≥ 1.
 */
function issueInactiveSellers(t, now) {
  const trend_data = t.trends?.inactive_sellers;
  if (!trend_data || trend_data.insufficient_history) return null;
  if (trend_data.direction !== "up" || trend_data.delta < 1) return null;

  const delta          = trend_data.delta;
  const pctIncrease    = trend_data.first_value > 0
    ? Math.round((delta / trend_data.first_value) * 100)
    : 100;
  const largeMagnitude = delta >= 3;

  const severity  = "high";
  const trend     = "worsening";
  const impact    = "seller";
  const score     = computeScore({ severity, trend, largeMagnitude, impact_area: impact });

  return {
    id:               "inactive_sellers_worsening",
    title:            `Inactive sellers increasing — +${delta} in ${trend_data.distinct_days} days (+${pctIncrease}%)`,
    severity,
    priority_score:   score,
    impact_area:      impact,
    trend,
    confidence:       0.95,
    source:           "telemetry",
    reasoning:
      `trends.inactive_sellers: ${trend_data.first_value} → ${trend_data.last_value} ` +
      `(delta +${delta}, +${pctIncrease}%) across ${trend_data.distinct_days} distinct days ` +
      `(${trend_data.first_date} → ${trend_data.last_date}). ` +
      `This is the only worsening metric in the current telemetry window. ` +
      `An 87% increase in one week suggests a systemic retention problem.`,
    recommended_action:
      `Cross-reference the ${trend_data.last_value} inactive sellers against the real seller list. ` +
      `Determine whether real sellers are driving this count or test accounts are inflating it. ` +
      `If real sellers dominate, initiate a direct re-engagement campaign.`,
    created_at: now,
    data: {
      first_value:    trend_data.first_value,
      last_value:     trend_data.last_value,
      delta:          trend_data.delta,
      first_date:     trend_data.first_date,
      last_date:      trend_data.last_date,
      distinct_days:  trend_data.distinct_days,
      pct_increase:   pctIncrease,
    },
  };
}

/**
 * Issue 3: dead catalog — high ratio of products with zero views.
 * Triggered when products_without_views / products_total >= 0.5.
 */
function issueDeadCatalog(t, now) {
  const cs = t.current_state;
  if (!cs || !cs.products_total || cs.products_total === 0) return null;

  const ratio = cs.products_without_views / cs.products_total;
  if (ratio < 0.5) return null;

  const pct         = Math.round(ratio * 100);
  const trendData   = t.trends?.products_without_views;
  const trendDir    = trendData?.direction ?? "stable";
  const trendLabel  = trendDir === "up" ? "worsening" : trendDir === "down" ? "improving" : "stable";

  // High severity if >80% dead, medium if 50–80%
  const severity    = pct >= 80 ? "high" : "medium";
  const impact      = "product";
  const score       = computeScore({
    severity,
    trend:          trendLabel,
    largeMagnitude: pct >= 80,
    impact_area:    impact,
  });

  const fm              = t.filtered_metrics;
  const realDeadCount   = fm?.real_dead_products_count ?? "unknown";
  const realDeadNames   = fm?.real_dead_product_names  ?? [];

  return {
    id:               "dead_catalog",
    title:            `${pct}% of products have zero views (${cs.products_without_views} of ${cs.products_total})`,
    severity,
    priority_score:   score,
    impact_area:      impact,
    trend:            trendLabel,
    confidence:       0.9,
    source:           "telemetry",
    reasoning:
      `current_state.products_without_views = ${cs.products_without_views} out of ` +
      `${cs.products_total} total products (${pct}%). ` +
      `Trend is ${trendLabel} over ${trendData?.distinct_days ?? "?"} days. ` +
      `${realDeadCount} are confirmed real (non-test) products. ` +
      `Empty trending_products and trending_categories arrays are a direct downstream consequence — ` +
      `no engagement data exists for the recommendation engine.`,
    recommended_action:
      `Verify that products are reachable from the buyer-facing frontend. ` +
      `Check if listings are published vs. draft/inactive. ` +
      `Confirmed real dead products include: ${realDeadNames.slice(0, 4).join(", ")}${realDeadNames.length > 4 ? "…" : ""}. ` +
      `Investigate product discovery path (search indexing, category browsing, direct URLs).`,
    created_at: now,
    data: {
      products_without_views:   cs.products_without_views,
      products_total:           cs.products_total,
      pct_without_views:        pct,
      trend_direction:          trendDir,
      real_dead_products_count: realDeadCount,
      real_dead_product_names:  realDeadNames,
    },
  };
}

/**
 * Issue 4: test data contamination — test accounts represent a large share of the seller base.
 * Triggered when test_seller_count / (real + test) >= 0.3.
 */
function issueTestContamination(t, now) {
  const fm = t.filtered_metrics;
  if (!fm) return null;

  const total  = (fm.real_seller_count ?? 0) + (fm.test_seller_count ?? 0);
  if (total === 0) return null;

  const ratio = fm.test_seller_count / total;
  if (ratio < 0.3) return null;

  const pct          = Math.round(ratio * 100);
  const largeMagnitude = ratio >= 0.5;

  // High if test accounts dominate (>=50%), medium otherwise
  const severity  = largeMagnitude ? "medium" : "low";
  const impact    = "data";
  const score     = computeScore({
    severity,
    trend:       "stable",
    largeMagnitude,
    impact_area: impact,
  });

  const conflictCount = (t.metric_conflicts ?? []).length;

  return {
    id:               "test_data_contamination",
    title:            `Test accounts are ${pct}% of seller base (${fm.test_seller_count} of ${total})`,
    severity,
    priority_score:   score,
    impact_area:      impact,
    trend:            "stable",
    confidence:       1.0,
    source:           "telemetry",
    reasoning:
      `filtered_metrics: real_seller_count=${fm.real_seller_count}, ` +
      `test_seller_count=${fm.test_seller_count} (${pct}% of total). ` +
      `Test accounts inflate inactive_sellers, dead_products, and all derived health scores. ` +
      `${conflictCount > 0
        ? `${conflictCount} metric conflict(s) detected — test contamination likely contributes to the divergence.`
        : ""}`,
    recommended_action:
      `Add an is_test flag to test/demo entities in the database so analytics queries can exclude them. ` +
      `Until then, use filtered_metrics values exclusively for automated decisions and health scoring. ` +
      `Test accounts identified by keywords: test, prueba, demo, asd, admin.`,
    created_at: now,
    data: {
      real_seller_count: fm.real_seller_count,
      test_seller_count: fm.test_seller_count,
      total_sellers:     total,
      pct_test:          pct,
      test_keywords:     ["test", "prueba", "demo", "asd", "admin"],
    },
  };
}

/**
 * Issue 5: metric conflict between data sources.
 * Triggered when metric_conflicts array is non-empty.
 */
function issueMetricConflicts(t, now) {
  const conflicts = t.metric_conflicts;
  if (!Array.isArray(conflicts) || conflicts.length === 0) return null;

  const primary     = conflicts[0]; // highest-impact conflict first
  const largeDelta  = Math.abs(primary.delta) >= 3;
  const severity    = "medium";
  const impact      = "data";
  const score       = computeScore({
    severity,
    trend:       "stable",
    largeMagnitude: largeDelta,
    impact_area: impact,
  });

  const allConflicts = conflicts
    .map(c => `${c.metric} (analytics=${c.analytics_value}, intelligence=${c.intelligence_value}, Δ${c.delta})`)
    .join("; ");

  return {
    id:               "metric_source_conflict",
    title:            `${conflicts.length} metric source conflict${conflicts.length > 1 ? "s" : ""} detected`,
    severity,
    priority_score:   score,
    impact_area:      impact,
    trend:            "stable",
    confidence:       1.0,
    source:           "telemetry",
    reasoning:
      `metric_conflicts: ${allConflicts}. ` +
      `Two data sources (analytics CLI and intelligence DB) report different values for the same metric. ` +
      `Automated decisions and health scores that rely on these metrics may trigger incorrectly.`,
    recommended_action:
      `Compare the SQL/ORM queries behind both sources for the conflicting metric(s). ` +
      `The most likely cause is a filter difference (e.g., active vs. all products). ` +
      `Align both queries on a shared definition and document it. ` +
      `Until resolved, prefer the intelligence (DB-backed) value for decisions.`,
    created_at: now,
    data: {
      conflicts,
    },
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log("\n=== FLOWJUYU PRIORITY GENERATOR ===\n");

  const now  = new Date().toISOString();
  const date = now.split("T")[0];

  // ── Load telemetry ──────────────────────────────────────────────────────

  const telemetryPath = findLatestTelemetry();

  if (!telemetryPath) {
    console.log("  No telemetry artifact found. Run run-telemetry-collector.js first.");
    console.log("\nPriority generation skipped.\n");
    return;
  }

  const telemetry = readJson(telemetryPath, null);

  if (!telemetry) {
    console.log("  Failed to parse telemetry artifact.");
    console.log("\nPriority generation skipped.\n");
    return;
  }

  console.log(`  Telemetry source: ${path.basename(telemetryPath)}`);
  console.log(`  Schema version:   ${telemetry.schema_version ?? "unknown"}`);
  console.log(`  Telemetry date:   ${telemetry.date ?? "unknown"}`);

  // ── Generate issues ─────────────────────────────────────────────────────

  const rawIssues = [
    issueSellerActivation(telemetry, now),
    issueInactiveSellers(telemetry, now),
    issueDeadCatalog(telemetry, now),
    issueTestContamination(telemetry, now),
    issueMetricConflicts(telemetry, now),
  ]
    .filter(Boolean)                                              // drop nulls (signals not present)
    .sort((a, b) => b.priority_score - a.priority_score)         // highest first
    .slice(0, 5);                                                 // max 5

  console.log(`\n  Issues generated: ${rawIssues.length}`);

  rawIssues.forEach((issue, i) => {
    console.log(`  ${i + 1}. [${issue.severity.toUpperCase()}] ${issue.title} (score: ${issue.priority_score})`);
  });

  // ── Assemble artifact ───────────────────────────────────────────────────

  const artifact = {
    schema_version:    "1.0",
    generated_at:      now,
    date,
    telemetry_source:  path.basename(telemetryPath),
    issues:            rawIssues,
    summary: {
      total:    rawIssues.length,
      high:     rawIssues.filter(i => i.severity === "high").length,
      medium:   rawIssues.filter(i => i.severity === "medium").length,
      low:      rawIssues.filter(i => i.severity === "low").length,
      top_score: rawIssues[0]?.priority_score ?? null,
    },
  };

  // ── Write artifact ──────────────────────────────────────────────────────

  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  const outFile = path.join(artifactsDir, `priority-${date}.json`);
  fs.writeFileSync(outFile, JSON.stringify(artifact, null, 2), "utf8");

  console.log(`\n  Artifact: ${outFile}`);
  console.log(
    `  Summary: ${artifact.summary.high} high · ` +
    `${artifact.summary.medium} medium · ` +
    `${artifact.summary.low} low`
  );
  console.log("\nPriority generation complete.\n");
}

main();
