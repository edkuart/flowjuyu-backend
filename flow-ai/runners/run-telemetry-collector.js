/**
 * flow-ai/runners/run-telemetry-collector.js
 *
 * Aggregates all available data sources into a single normalized
 * telemetry artifact: flow-ai/artifacts/telemetry-YYYY-MM-DD.json
 *
 * This file is the boundary between raw data collection and analysis.
 * Downstream consumers (run-llm-analysis-agent.js) read only this artifact —
 * they never read memory files directly.
 *
 * Safe to re-run: overwrites same-day artifact with fresh data.
 * Does NOT call any external service or API.
 * Does NOT write to any path outside flow-ai/artifacts/.
 *
 * Run order in daily cycle: AFTER brain-cycle (so intelligence.json is fresh)
 *                           AFTER memory-agent (so marketplace.json is fresh)
 *
 * --- CHANGES LOG ---
 * Phase 1: Fixed trend computation — marketplace.json is reverse-chronological,
 *           so entries must be sorted ascending before windowing.
 * Phase 2: Added isTestEntity() filter and filtered_metrics section.
 * Phase 4: Added data_changed flag comparing against previous artifact.
 * Phase 5: Added metric_conflicts section surfacing analytics vs intelligence divergence.
 * Phase 6: Fixed day-level consolidation — multiple same-day snapshots were collapsing
 *           trends to a single-day window (e.g. "2026-03-24 → 2026-03-24 (+0)").
 *           computeTrend() now groups entries by calendar day first, picks one
 *           representative record per day, then windows across DISTINCT DAYS.
 *           Trends with fewer than 2 distinct days are reported as insufficient_history.
 */

"use strict";
require("dotenv").config();

const fs   = require("fs");
const path = require("path");

// ── Path constants ────────────────────────────────────────

const BASE         = path.join(__dirname, "..");
const memoryDir    = path.join(BASE, "memory");
const artifactsDir = path.join(BASE, "artifacts");
const tasksInbox   = path.join(BASE, "tasks", "inbox");
const tasksDone    = path.join(BASE, "tasks", "done");
const reportsDir   = path.join(BASE, "reports", "daily");

// ── Helpers ───────────────────────────────────────────────

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.warn(`  [telemetry] Could not read ${path.basename(filePath)}: ${err.message}`);
    return fallback;
  }
}

function countJsonFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(f => f.endsWith(".json")).length;
}

function listJsonFiles(dir, limit = 5) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit);
}

function listReportFiles(limit = 10) {
  if (!fs.existsSync(reportsDir)) return [];
  return fs.readdirSync(reportsDir)
    .filter(f => f.endsWith(".md"))
    .sort()
    .reverse()
    .slice(0, limit);
}

// ── Phase 2: Test entity detection ───────────────────────
//
// Names matching any of these keywords (case-insensitive) are
// classified as test/demo accounts and excluded from filtered metrics.
// Add new keywords here to extend the list without touching logic.

const TEST_KEYWORDS = ["test", "prueba", "demo", "asd", "admin"];

function isTestEntity(name) {
  if (!name || typeof name !== "string") return false;
  const lower = name.toLowerCase();
  return TEST_KEYWORDS.some(k => lower.includes(k));
}

// ── Phase 5: Analytics report reader and parser ──────────

function readLatestAnalyticsReport() {
  if (!fs.existsSync(reportsDir)) return null;
  const files = fs.readdirSync(reportsDir)
    .filter(f => f.startsWith("analytics-") && f.endsWith(".md"))
    .sort()
    .reverse();
  if (!files.length) return null;
  try {
    return fs.readFileSync(path.join(reportsDir, files[0]), "utf8");
  } catch {
    return null;
  }
}

/**
 * Extracts key numeric metrics from the PowerShell analytics report.
 * The report embeds CLI output in markdown code blocks.
 * Uses simple regex against the full text — tolerant of whitespace variation.
 *
 * Returns null for any metric that cannot be parsed.
 */
function parseAnalyticsMetrics(text) {
  if (!text) return null;
  const extract = (pattern) => {
    const m = text.match(pattern);
    return m ? parseInt(m[1], 10) : null;
  };
  return {
    products_total:         extract(/Products total\s+(\d+)/),
    products_without_views: extract(/Products without views\s+(\d+)/),
    inactive_sellers:       extract(/Inactive sellers\s+(\d+)/),
    products_total_sellers: extract(/Total sellers\s+(\d+)/),
  };
}

/**
 * Extracts seller names from the Seller Productivity section.
 * Format: "Seller Name                     N"
 * Returns array of { name, products } objects.
 */
function parseSellerProductivity(text) {
  if (!text) return [];
  // Find the productivity block by its header
  const blockMatch = text.match(/Seller productivity\s*[-]+\s*([\s\S]*?)(?:```|$)/);
  if (!blockMatch) return [];

  const sellers = [];
  const lines = blockMatch[1].split("\n");
  for (const line of lines) {
    // Match: "Name with spaces       <number>"
    const m = line.match(/^([A-Za-záéíóúüñÁÉÍÓÚÜÑ][\w\s'áéíóúüñ.-]+?)\s{3,}(\d+)\s*$/);
    if (m) {
      sellers.push({ name: m[1].trim(), products: parseInt(m[2], 10) });
    }
  }
  return sellers;
}

/**
 * Extracts dead product names from the Dead Products section.
 * Format: one name per line between the dashes and "Total:".
 */
function parseDeadProductNames(text) {
  if (!text) return [];
  const blockMatch = text.match(/Products with zero views\s*[-]+\s*([\s\S]*?)Total:/);
  if (!blockMatch) return [];
  return blockMatch[1]
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith("-"));
}

/**
 * Phase 5: Build metric conflict report.
 * Compares analytics-report values with intelligence.json values.
 * Returns array of conflict objects; empty array if no conflicts.
 */
function buildMetricConflicts(analyticsMetrics, intelligence) {
  if (!analyticsMetrics) return [];

  const conflicts = [];

  const pairs = [
    {
      metric: "products_without_views",
      analytics_value: analyticsMetrics.products_without_views,
      intelligence_value: intelligence.products_without_views ?? null,
    },
    {
      metric: "inactive_sellers",
      analytics_value: analyticsMetrics.inactive_sellers,
      intelligence_value: intelligence.inactive_sellers ?? null,
    },
    {
      metric: "products_total",
      analytics_value: analyticsMetrics.products_total,
      intelligence_value: intelligence.products_total ?? null,
    },
  ];

  for (const p of pairs) {
    if (
      p.analytics_value !== null &&
      p.intelligence_value !== null &&
      p.analytics_value !== p.intelligence_value
    ) {
      conflicts.push({
        metric:              p.metric,
        analytics_value:     p.analytics_value,
        intelligence_value:  p.intelligence_value,
        delta:               p.intelligence_value - p.analytics_value,
        // Note: do NOT resolve automatically — surface for human review
        warning: true,
      });
    }
  }

  return conflicts;
}

// ── Phase 1: Date normalization and sorting ───────────────

/**
 * Normalizes a date string to "YYYY-MM-DD" for safe string comparison.
 * Handles both "YYYY-MM-DD" and full ISO timestamps.
 * Returns empty string for unparseable input (sorts to front, safely).
 */
function normalizeDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return "";
  return dateStr.split("T")[0]; // "2026-03-17T18:..." → "2026-03-17"
}

/**
 * Extract a numeric value from an array of insight strings.
 * Each string is like "16 products total" or "14 without views".
 */
function extractNumber(insights, keyword) {
  if (!Array.isArray(insights)) return null;
  const line = insights.find(s =>
    typeof s === "string" && s.toLowerCase().includes(keyword.toLowerCase())
  );
  if (!line) return null;
  const match = line.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

/**
 * Compute a trend for a given metric keyword across marketplace.json entries.
 *
 * PHASE 6 FIX: marketplace.json accumulates many snapshots per day (the pipeline
 * can run multiple times). The previous sort+slice approach windowed across raw
 * entries, not days — so with 9 entries on 2026-03-24 and slice(-7), all 7
 * selected entries came from the same day, producing "2026-03-24 → 2026-03-24 (+0)".
 *
 * New approach — day-level consolidation:
 *   1. Filter entries to those with a numeric value for the keyword.
 *   2. Group by calendar day ("YYYY-MM-DD").
 *   3. For each day, pick one representative record (last entry in original array
 *      order; within a day entries are usually identical so choice is arbitrary).
 *   4. Sort consolidated daily records ascending by day.
 *   5. Window across the last `days` DISTINCT DAYS.
 *   6. If fewer than 2 distinct days exist, return an insufficient_history marker
 *      instead of a fake stable trend.
 *
 * Returns:
 *   { first_date, last_date, first_value, last_value, delta, direction, distinct_days }
 *   { insufficient_history: true, distinct_days, note }   ← when not enough history
 *   null  ← when no numeric data exists at all
 */
function computeTrend(entries, keyword, days = 7) {
  if (!Array.isArray(entries) || entries.length === 0) return null;

  // Step 1: group by calendar day, keeping only numeric entries for this keyword
  const byDay = {};
  for (const entry of entries) {
    const day = normalizeDate(entry.date);
    if (!day) continue;
    if (extractNumber(entry.insights, keyword) === null) continue;
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(entry);
  }

  const distinctDays = Object.keys(byDay).sort(); // ascending YYYY-MM-DD sort is lexicographic

  // Step 2: need at least 2 distinct days for a meaningful trend
  if (distinctDays.length < 2) {
    if (distinctDays.length === 0) return null;
    return {
      insufficient_history: true,
      distinct_days: 1,
      note: `Only 1 distinct day of data (${distinctDays[0]}) — cannot compute trend`,
    };
  }

  // Step 3: build one representative record per day (last entry in array order)
  // marketplace.json is reverse-chronological, so "last" in original order = oldest
  // within the day, but entries within the same day are typically identical.
  const dailyRecords = distinctDays.map(day => ({
    day,
    entry: byDay[day][byDay[day].length - 1],
  }));

  // Step 4: window across the last `days` distinct day records
  const window = dailyRecords.slice(-days);
  // (window always has ≥2 entries because distinctDays.length ≥ 2 and days ≥ 2)

  const first    = window[0];
  const last     = window[window.length - 1];
  const firstVal = extractNumber(first.entry.insights, keyword);
  const lastVal  = extractNumber(last.entry.insights, keyword);

  if (firstVal === null || lastVal === null) return null;

  const delta = lastVal - firstVal;
  return {
    first_date:    first.day,
    last_date:     last.day,
    first_value:   firstVal,
    last_value:    lastVal,
    delta,
    direction:     delta > 0 ? "up" : delta < 0 ? "down" : "stable",
    distinct_days: distinctDays.length,
  };
}

// ── Phase 4: Previous artifact loader ────────────────────

/**
 * Loads the most recent existing telemetry artifact (from a previous run).
 * Used to detect whether metrics have changed since the last cycle.
 * Returns null if no prior artifact exists.
 */
function loadPreviousArtifact(currentDate) {
  if (!fs.existsSync(artifactsDir)) return null;

  const files = fs.readdirSync(artifactsDir)
    .filter(f => f.startsWith("telemetry-") && f.endsWith(".json") && !f.includes(currentDate))
    .sort()
    .reverse();

  if (!files.length) return null;
  return readJson(path.join(artifactsDir, files[0]), null);
}

/**
 * Phase 4: Compares current_state values with a previous artifact.
 * Returns true if any tracked metric changed.
 * Returns null if no previous artifact is available.
 */
function hasMetricChange(current, previous) {
  if (!previous || !previous.current_state) return null;

  const prev = previous.current_state;
  const tracked = [
    "products_total",
    "products_without_views",
    "products_missing_images",
    "inactive_sellers",
  ];

  return tracked.some(k => current[k] !== prev[k]);
}

// ── Main ──────────────────────────────────────────────────

function main() {
  console.log("\n=== FLOWJUYU TELEMETRY COLLECTOR ===\n");

  // Ensure output directory exists
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  const now  = new Date().toISOString();
  const date = now.split("T")[0];

  // ── Load data sources ──────────────────────────────────

  const intelligence = readJson(path.join(memoryDir, "intelligence.json"), {});
  const marketplace  = readJson(path.join(memoryDir, "marketplace.json"),  []);
  const sessions     = readJson(path.join(memoryDir, "sessions.json"),     {});
  const improvements = readJson(path.join(memoryDir, "improvements.json"), []);

  // ── Phase 5: Load and parse analytics report ───────────

  const analyticsReportText = readLatestAnalyticsReport();
  const analyticsMetrics    = parseAnalyticsMetrics(analyticsReportText);
  const sellerProductivity  = parseSellerProductivity(analyticsReportText);
  const deadProductNames    = parseDeadProductNames(analyticsReportText);

  // ── Phase 6: Compute day-level trends ─────────────────
  // computeTrend() now consolidates to one record per distinct calendar day,
  // then windows across DISTINCT DAYS (not raw entries).

  const trends = {
    products_total:          computeTrend(marketplace, "products total"),
    products_without_views:  computeTrend(marketplace, "without views"),
    products_missing_images: computeTrend(marketplace, "missing images"),
    inactive_sellers:        computeTrend(marketplace, "inactive sellers"),
  };

  // Derive daily history metadata for logging and artifact
  const distinctDaysSet = new Set(
    marketplace
      .map(e => normalizeDate(e.date))
      .filter(d => d.length > 0)
  );
  const distinctDaysSorted = [...distinctDaysSet].sort();
  const dailyHistory = {
    distinct_days:  distinctDaysSorted.length,
    first_day:      distinctDaysSorted[0]  ?? null,
    last_day:       distinctDaysSorted[distinctDaysSorted.length - 1] ?? null,
    history_sufficient: distinctDaysSorted.length >= 2,
  };

  // ── Task pipeline snapshot ─────────────────────────────

  const inboxTasks = listJsonFiles(tasksInbox, 10)
    .map(f => readJson(path.join(tasksInbox, f), null))
    .filter(Boolean)
    .map(t => ({ id: t.id, title: t.title, priority: t.priority, status: t.status }));

  const taskPipeline = {
    inbox_count:   countJsonFiles(tasksInbox),
    done_count:    countJsonFiles(tasksDone),
    pending_tasks: inboxTasks,
  };

  // ── Recent improvements (last 5, deduplicated) ─────────

  const recentImprovements = improvements
    .slice(-10)
    .filter((entry, idx, arr) => {
      const text = (entry.improvements || []).join(" ");
      return text.length > 0 && arr.findIndex(e =>
        (e.improvements || []).join(" ") === text
      ) === idx;
    })
    .slice(-5)
    .map(i => ({ date: i.date, improvements: i.improvements }));

  // ── Current state (intelligence.json) ─────────────────

  const currentState = {
    products_total:          intelligence.products_total          ?? null,
    products_without_views:  intelligence.products_without_views  ?? null,
    products_missing_images: intelligence.products_without_images ?? null,
    inactive_sellers:        intelligence.inactive_sellers        ?? null,
    trending_products:       intelligence.trending_products       ?? [],
    trending_categories:     intelligence.trending_categories     ?? [],
    state_generated_at:      intelligence.generated_at            ?? null,
  };

  // ── Phase 2: Raw vs filtered metrics ───────────────────
  //
  // raw_metrics: values as reported by intelligence.json (may include test accounts)
  // filtered_metrics: values after excluding entities matching TEST_KEYWORDS
  //
  // Both are preserved so downstream analysis can choose which to use.

  const realSellers = sellerProductivity.filter(s => !isTestEntity(s.name));
  const testSellers = sellerProductivity.filter(s => isTestEntity(s.name));
  const realDeadProducts  = deadProductNames.filter(n => !isTestEntity(n));
  const testDeadProducts  = deadProductNames.filter(n => isTestEntity(n));

  const rawMetrics = {
    // From intelligence.json (DB-backed, point-in-time)
    products_total:          currentState.products_total,
    products_without_views:  currentState.products_without_views,
    products_missing_images: currentState.products_missing_images,
    inactive_sellers:        currentState.inactive_sellers,
    // From analytics report (PowerShell CLI)
    analytics_dead_products_count: deadProductNames.length || null,
    analytics_seller_count:        sellerProductivity.length || null,
  };

  const filteredMetrics = {
    // Sellers with no test keywords in their name
    real_seller_count:       realSellers.length,
    test_seller_count:       testSellers.length,
    real_sellers_with_products: realSellers.filter(s => s.products > 0).length,
    // Dead products with no test keywords in their name
    real_dead_products_count: realDeadProducts.length,
    test_dead_products_count: testDeadProducts.length,
    // Named lists for reference
    real_seller_names:        realSellers.map(s => s.name),
    real_dead_product_names:  realDeadProducts,
    note: "filtered_metrics excludes entities matching: " + TEST_KEYWORDS.join(", "),
  };

  // ── Phase 5: Metric conflicts ──────────────────────────

  const metricConflicts = buildMetricConflicts(analyticsMetrics, intelligence);

  // ── Phase 4: Change detection ──────────────────────────

  const previousArtifact = loadPreviousArtifact(date);
  const dataChanged      = hasMetricChange(currentState, previousArtifact);

  // ── Assemble artifact ──────────────────────────────────

  const artifact = {
    schema_version: "1.1",
    generated_at:   now,
    date,

    // Phase 4: whether any tracked metric changed since the previous artifact
    // null = first run (no comparison available)
    // false = no change detected (potential data staleness)
    // true  = at least one metric changed
    data_changed: dataChanged,

    // Current DB-backed state (from brain-cycle / intelligence service)
    current_state: currentState,

    // Phase 2: raw vs test-filtered metrics
    raw_metrics:      rawMetrics,
    filtered_metrics: filteredMetrics,

    // Phase 5: conflicts between analytics agent and intelligence service
    // Empty array = no conflicts detected
    metric_conflicts: metricConflicts,

    // Phase 6 (fixed): trends computed across distinct calendar days
    // trends with insufficient_history:true mean only 1 day of data exists
    daily_history: dailyHistory,
    trends,

    // Task pipeline state
    task_pipeline: taskPipeline,

    // Cycle health
    cycle_state: {
      cycles_run:        sessions.cycles_run        ?? 0,
      last_run:          sessions.last_run          ?? null,
      tasks_completed:   sessions.tasks_completed   ?? 0,
      reports_generated: sessions.reports_generated ?? 0,
    },

    // Recent non-duplicate improvements
    recent_improvements: recentImprovements,

    // Metadata
    data_points_available: marketplace.length,
    recent_reports:        listReportFiles(10),
  };

  // ── Write artifact ─────────────────────────────────────

  const outFile = path.join(artifactsDir, `telemetry-${date}.json`);
  fs.writeFileSync(outFile, JSON.stringify(artifact, null, 2), "utf8");

  // ── Summary log ───────────────────────────────────────

  console.log(`  Artifact: ${outFile}`);
  console.log(`  data_changed: ${dataChanged === null ? "n/a (first run)" : dataChanged}`);
  console.log(`  Products total:          ${currentState.products_total ?? "—"}`);
  console.log(`  Products without views:  ${currentState.products_without_views ?? "—"}`);
  console.log(`  Products missing images: ${currentState.products_missing_images ?? "—"}`);
  console.log(`  Inactive sellers:        ${currentState.inactive_sellers ?? "—"}`);
  console.log(`  Marketplace data points: ${marketplace.length}`);
  console.log(`  Distinct daily records:  ${dailyHistory.distinct_days} (${dailyHistory.first_day} → ${dailyHistory.last_day})`);
  console.log(`  History sufficient:      ${dailyHistory.history_sufficient}`);
  console.log(`  Tasks in inbox:          ${taskPipeline.inbox_count}`);

  // Phase 6: print day-level trends (or insufficient history notice)
  function printTrend(label, trend) {
    if (!trend) {
      console.log(`  ${label}: no numeric data`);
    } else if (trend.insufficient_history) {
      console.log(`  ${label}: insufficient daily history (${trend.note})`);
    } else {
      const sign = trend.delta >= 0 ? "+" : "";
      console.log(`  ${label} (${trend.first_date} → ${trend.last_date}): ${trend.first_value} → ${trend.last_value} (${sign}${trend.delta}) [${trend.direction}] across ${trend.distinct_days} days`);
    }
  }

  printTrend("Views trend", trends.products_without_views);
  printTrend("Sellers trend", trends.inactive_sellers);

  // Phase 2: filtered summary
  console.log(`  Real sellers: ${filteredMetrics.real_seller_count} / test sellers: ${filteredMetrics.test_seller_count}`);
  console.log(`  Real dead products: ${filteredMetrics.real_dead_products_count} / test: ${filteredMetrics.test_dead_products_count}`);

  // Phase 5: conflicts summary
  if (metricConflicts.length > 0) {
    console.log(`  ⚠ Metric conflicts (${metricConflicts.length}):`);
    metricConflicts.forEach(c => {
      console.log(`    ${c.metric}: analytics=${c.analytics_value} vs intelligence=${c.intelligence_value} (Δ${c.delta})`);
    });
  } else {
    console.log(`  Metric conflicts: none`);
  }

  console.log("\nTelemetry collection complete.\n");
}

main();
