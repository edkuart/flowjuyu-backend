/**
 * flow-ai/runners/run-llm-trigger.js
 *
 * Intelligent LLM activation gate.
 *
 * Reads the latest priority artifact and decides whether to generate an LLM
 * analysis prompt. The prompt is ONLY generated when high-priority signals
 * exist — avoiding unnecessary cost and noise on quiet cycles.
 *
 * Trigger condition (any one is sufficient):
 *   - any issue has priority_score >= 90
 *   - any issue has severity === "high"
 *
 * Output (when triggered):
 *   flow-ai/prompts/llm-trigger-YYYY-MM-DD.md
 *
 * Output (when skipped):
 *   No files written. Console log only.
 *
 * Guards:
 *   - Soft exits if priority artifact is missing (run-priority-generator.js first)
 *   - Skips if today's trigger prompt already exists (idempotent)
 *   - Does NOT call any external API
 *
 * Run order: AFTER priority-generator in daily cycle.
 *
 * --- CHANGES LOG ---
 * v1.0: Initial implementation.
 */

"use strict";
require("dotenv").config();

const fs   = require("fs");
const path = require("path");

// ── Paths ──────────────────────────────────────────────────────────────────

const BASE         = path.join(__dirname, "..");
const artifactsDir = path.join(BASE, "artifacts");
const promptsDir   = path.join(BASE, "prompts");

// ── Trigger threshold ──────────────────────────────────────────────────────

const TRIGGER_SCORE_MIN = 90;
const TRIGGER_SEVERITY  = "high";

// ── Helpers ────────────────────────────────────────────────────────────────

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.warn(`  [llm-trigger] Could not read ${path.basename(filePath)}: ${err.message}`);
    return fallback;
  }
}

/**
 * Returns the path to the most recent priority-*.json artifact, or null.
 */
function findLatestPriority() {
  if (!fs.existsSync(artifactsDir)) return null;
  const files = fs.readdirSync(artifactsDir)
    .filter(f => f.startsWith("priority-") && f.endsWith(".json"))
    .sort()
    .reverse();
  return files.length > 0 ? path.join(artifactsDir, files[0]) : null;
}

/**
 * Returns the path to the most recent telemetry-*.json artifact, or null.
 */
function findLatestTelemetry() {
  if (!fs.existsSync(artifactsDir)) return null;
  const files = fs.readdirSync(artifactsDir)
    .filter(f => f.startsWith("telemetry-") && f.endsWith(".json"))
    .sort()
    .reverse();
  return files.length > 0 ? path.join(artifactsDir, files[0]) : null;
}

// ── Trigger evaluation ─────────────────────────────────────────────────────

/**
 * Evaluates whether the priority artifact contains issues that warrant LLM analysis.
 *
 * Returns:
 *   { triggered: true,  triggeringIssues: [...], reason: string }
 *   { triggered: false, triggeringIssues: [],    reason: string }
 */
function evaluateTrigger(issues) {
  if (!Array.isArray(issues) || issues.length === 0) {
    return {
      triggered:        false,
      triggeringIssues: [],
      reason:           "Priority artifact contains no issues.",
    };
  }

  const triggering = issues.filter(
    issue =>
      issue.priority_score >= TRIGGER_SCORE_MIN ||
      issue.severity === TRIGGER_SEVERITY
  );

  if (triggering.length === 0) {
    const top = issues[0];
    return {
      triggered:        false,
      triggeringIssues: [],
      reason:
        `No issues meet trigger threshold (score >= ${TRIGGER_SCORE_MIN} or severity = "${TRIGGER_SEVERITY}"). ` +
        `Top issue: "${top.title}" (score=${top.priority_score}, severity=${top.severity}).`,
    };
  }

  return {
    triggered:        true,
    triggeringIssues: triggering,
    reason:
      `${triggering.length} issue(s) exceed trigger threshold ` +
      `(score >= ${TRIGGER_SCORE_MIN} or severity = "${TRIGGER_SEVERITY}").`,
  };
}

// ── Prompt builder ─────────────────────────────────────────────────────────

/**
 * Formats a single priority issue into a markdown block for the prompt.
 */
function formatIssueBlock(issue, index) {
  const trendArrow =
    issue.trend === "worsening" ? "↑ worsening" :
    issue.trend === "improving" ? "↓ improving" : "→ stable";

  const lines = [
    `### Issue ${index + 1}: ${issue.title}`,
    ``,
    `| Field          | Value |`,
    `|---|---|`,
    `| ID             | \`${issue.id}\` |`,
    `| Severity       | **${issue.severity.toUpperCase()}** |`,
    `| Priority Score | ${issue.priority_score} / 100 |`,
    `| Impact Area    | ${issue.impact_area} |`,
    `| Trend          | ${trendArrow} |`,
    `| Confidence     | ${Math.round(issue.confidence * 100)}% |`,
    ``,
    `**Reasoning:**`,
    issue.reasoning,
    ``,
    `**Recommended Action:**`,
    issue.recommended_action,
  ];

  // Append key data fields if present and not empty
  if (issue.data && Object.keys(issue.data).length > 0) {
    const safeData = { ...issue.data };
    // Truncate long arrays for readability
    if (Array.isArray(safeData.real_seller_names) && safeData.real_seller_names.length > 5) {
      safeData.real_seller_names = [...safeData.real_seller_names.slice(0, 5), `…+${safeData.real_seller_names.length - 5} more`];
    }
    if (Array.isArray(safeData.real_dead_product_names) && safeData.real_dead_product_names.length > 5) {
      safeData.real_dead_product_names = [...safeData.real_dead_product_names.slice(0, 5), `…+${safeData.real_dead_product_names.length - 5} more`];
    }
    lines.push(``, `**Signal Data:**`, `\`\`\`json`, JSON.stringify(safeData, null, 2), `\`\`\``);
  }

  return lines.join("\n");
}

/**
 * Builds a compact telemetry context block (state + trends only — no full artifact dump).
 */
function buildTelemetryContext(telemetry) {
  if (!telemetry) return "(telemetry not available)";

  const cs = telemetry.current_state ?? {};
  const tr = telemetry.trends ?? {};
  const dh = telemetry.daily_history ?? {};
  const fm = telemetry.filtered_metrics ?? {};

  function trendLine(label, t) {
    if (!t || t.insufficient_history) return `  ${label}: insufficient history`;
    const sign = t.delta >= 0 ? "+" : "";
    const arrow = t.direction === "up" ? "↑" : t.direction === "down" ? "↓" : "→";
    return `  ${label}: ${t.first_value} → ${t.last_value} (${sign}${t.delta}) ${arrow} [${t.first_date} → ${t.last_date}]`;
  }

  return [
    `**Current State** (snapshot: ${cs.state_generated_at ?? telemetry.date})`,
    `  Products total:          ${cs.products_total ?? "—"}`,
    `  Products without views:  ${cs.products_without_views ?? "—"}`,
    `  Products missing images: ${cs.products_missing_images ?? "—"}`,
    `  Inactive sellers:        ${cs.inactive_sellers ?? "—"}`,
    `  Trending products:       ${(cs.trending_products ?? []).length > 0 ? cs.trending_products.join(", ") : "none"}`,
    ``,
    `**7-Day Trends** (${dh.distinct_days ?? "?"} distinct days, ${dh.first_day ?? "?"} → ${dh.last_day ?? "?"})`,
    trendLine("Products total",         tr.products_total),
    trendLine("Products without views", tr.products_without_views),
    trendLine("Products missing images",tr.products_missing_images),
    trendLine("Inactive sellers",       tr.inactive_sellers),
    ``,
    `**Filtered Metrics** (real vs test)`,
    `  Real sellers:            ${fm.real_seller_count ?? "—"}`,
    `  Test accounts:           ${fm.test_seller_count ?? "—"}`,
    `  Real sellers w/ products:${fm.real_sellers_with_products ?? "—"}`,
    `  Real dead products:      ${fm.real_dead_products_count ?? "—"}`,
    ``,
    `**Metric Conflicts:** ${(telemetry.metric_conflicts ?? []).length === 0
      ? "none"
      : (telemetry.metric_conflicts ?? []).map(c =>
          `${c.metric} (analytics=${c.analytics_value} vs db=${c.intelligence_value}, Δ${c.delta})`
        ).join("; ")
    }`,
  ].join("\n");
}

/**
 * Builds the full trigger prompt markdown.
 */
function buildTriggerPrompt({
  date,
  priorityArtifact,
  telemetry,
  triggeringIssues,
  triggerReason,
  priorityFilename,
  telemetryFilename,
}) {
  const highCount   = triggeringIssues.filter(i => i.severity === "high").length;
  const topScore    = triggeringIssues[0]?.priority_score ?? 0;
  const issueBlocks = triggeringIssues.map((issue, i) => formatIssueBlock(issue, i)).join("\n\n---\n\n");
  const telemetryCtx = buildTelemetryContext(telemetry);

  return `# FLOWJUYU LLM TRIGGER ANALYSIS
Generated: ${new Date().toISOString()}
Date: ${date}
Trigger: ACTIVATED — ${triggerReason}

---

## WHY THIS PROMPT WAS GENERATED

The priority generator detected ${triggeringIssues.length} high-priority issue(s) requiring analysis:
- ${highCount} HIGH severity
- Top priority score: ${topScore}/100

Sources:
- Priority artifact:  ${priorityFilename}
- Telemetry artifact: ${telemetryFilename}

---

## INSTRUCTIONS

You are the Flowjuyu AI Analyst.

${triggeringIssues.length} issue(s) exceeded the trigger threshold (score ≥ ${TRIGGER_SCORE_MIN} or severity = HIGH).
These issues are **not hypothetical** — they are derived deterministically from telemetry data.

For each issue below:
1. Confirm whether the issue is real or a false positive based on the telemetry context.
2. Identify the most likely root cause.
3. Propose one concrete, minimal action the development team can take within 24 hours.
4. Flag any dependency or blocker that would prevent the action.

---

## MARKETPLACE CONTEXT

${telemetryCtx}

---

## HIGH-PRIORITY ISSUES

${issueBlocks}

---

## YOUR RESPONSE FORMAT

For each issue, respond in this exact structure:

**ISSUE: [issue_id]**
- Confirmed: yes / no / uncertain
- Root cause: [1 sentence]
- 24h action: [specific, concrete step]
- Blocker: [if any, otherwise "none"]
- Confidence in diagnosis: high / medium / low

---

## CONSTRAINTS

- Do not propose deployment actions, .env changes, or destructive operations
- Do not invent files — qualify uncertainty when referencing code
- Stay grounded in the telemetry numbers shown above
- Prefer minimal, reversible actions

---
`;
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log("\n=== FLOWJUYU LLM TRIGGER ===\n");

  const now  = new Date().toISOString();
  const date = now.split("T")[0];

  // ── Ensure prompts directory ────────────────────────────────────────────

  if (!fs.existsSync(promptsDir)) {
    fs.mkdirSync(promptsDir, { recursive: true });
  }

  // ── Load priority artifact ──────────────────────────────────────────────

  const priorityPath = findLatestPriority();

  if (!priorityPath) {
    console.log("  No priority artifact found.");
    console.log("  Run: node flow-ai/runners/run-priority-generator.js");
    console.log("\nLLM trigger skipped — no priority artifact.\n");
    process.exit(0);
  }

  const priority = readJson(priorityPath, null);

  if (!priority || !Array.isArray(priority.issues)) {
    console.log("  Priority artifact is malformed or empty.");
    console.log("\nLLM trigger skipped.\n");
    process.exit(0);
  }

  console.log(`  Priority source:  ${path.basename(priorityPath)}`);
  console.log(`  Issues loaded:    ${priority.issues.length} (${priority.summary?.high ?? "?"} high, ${priority.summary?.medium ?? "?"} medium)`);

  // ── Evaluate trigger ────────────────────────────────────────────────────

  const { triggered, triggeringIssues, reason } = evaluateTrigger(priority.issues);

  if (!triggered) {
    console.log(`\n  LLM skipped — no critical issues.`);
    console.log(`  Reason: ${reason}`);
    console.log("\nNo prompt generated. Pipeline continues normally.\n");
    process.exit(0);
  }

  console.log(`\n  Trigger: ACTIVATED`);
  console.log(`  Reason:  ${reason}`);
  triggeringIssues.forEach((issue, i) => {
    console.log(`  ${i + 1}. [score=${issue.priority_score}] ${issue.title}`);
  });

  // ── Idempotency guard ───────────────────────────────────────────────────

  const outFile = path.join(promptsDir, `llm-trigger-${date}.md`);

  if (fs.existsSync(outFile)) {
    console.log(`\n  Trigger prompt for ${date} already exists — skipping.`);
    console.log(`  File: ${outFile}\n`);
    process.exit(0);
  }

  // ── Load telemetry for context ──────────────────────────────────────────

  const telemetryPath = findLatestTelemetry();
  const telemetry     = telemetryPath ? readJson(telemetryPath, null) : null;

  if (!telemetry) {
    console.warn("  Warning: telemetry artifact not found — prompt will have reduced context.");
  }

  // ── Build and write prompt ──────────────────────────────────────────────

  const prompt = buildTriggerPrompt({
    date,
    priorityArtifact:  priority,
    telemetry,
    triggeringIssues,
    triggerReason:     reason,
    priorityFilename:  path.basename(priorityPath),
    telemetryFilename: telemetryPath ? path.basename(telemetryPath) : "unavailable",
  });

  fs.writeFileSync(outFile, prompt, "utf8");

  console.log(`\n  Prompt written: ${outFile}`);
  console.log(`  Issues included: ${triggeringIssues.length}`);
  console.log(`  Top score: ${triggeringIssues[0]?.priority_score ?? "—"}`);
  console.log("\nNext step: open the trigger prompt in Claude Code.\n");
}

main();
