/**
 * flow-ai/runners/run-llm-analysis-agent.js
 *
 * Reads the latest telemetry artifact and produces a structured,
 * trend-aware analytical prompt for Claude Code.
 *
 * Output files:
 *   flow-ai/prompts/claude-analysis-YYYY-MM-DD.md  ← primary analysis prompt
 *   flow-ai/prompts/claude-dev-bridge.md            ← always updated to latest
 *
 * Guards:
 *   - Soft exits if no telemetry artifact exists (run-telemetry-collector.js first)
 *   - Skips prompt generation if today's prompt already exists (idempotent)
 *
 * This runner does NOT call any external API.
 * The prompt it generates is designed to be loaded into Claude Code by the developer.
 *
 * To upgrade to Option B (direct API call):
 *   Replace the fs.writeFileSync at the bottom with an Anthropic SDK call
 *   that sends this prompt and writes the structured JSON response to
 *   flow-ai/artifacts/analysis-response-YYYY-MM-DD.json
 *
 * Run order: LAST in daily cycle (after telemetry-collector)
 */

"use strict";
require("dotenv").config();

const fs   = require("fs");
const path = require("path");

// ── Path constants ────────────────────────────────────────

const BASE         = path.join(__dirname, "..");
const artifactsDir = path.join(BASE, "artifacts");
const promptsDir   = path.join(BASE, "prompts");
const reportsDir   = path.join(BASE, "reports", "daily");
const tasksInbox   = path.join(BASE, "tasks", "inbox");

// ── Helpers ───────────────────────────────────────────────

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.warn(`  [llm-agent] Could not read ${path.basename(filePath)}: ${err.message}`);
    return fallback;
  }
}

function getLatestTelemetry() {
  if (!fs.existsSync(artifactsDir)) return null;

  const files = fs
    .readdirSync(artifactsDir)
    .filter(f => f.startsWith("telemetry-") && f.endsWith(".json"))
    .sort()
    .reverse();

  if (!files.length) return null;
  return readJson(path.join(artifactsDir, files[0]), null);
}

function getLatestAnalyticsReportContent() {
  if (!fs.existsSync(reportsDir)) return null;

  const files = fs
    .readdirSync(reportsDir)
    .filter(f => f.startsWith("analytics-") && f.endsWith(".md"))
    .sort()
    .reverse();

  if (!files.length) return null;

  const content = fs.readFileSync(path.join(reportsDir, files[0]), "utf8");
  // Trim to stay within reasonable prompt bounds
  return { name: files[0], content: content.slice(0, 4000) };
}

// ── Trend formatters ──────────────────────────────────────

function formatTrend(trend, label) {
  if (!trend) return `  ${label}: — (no trend data)`;

  const arrow = trend.direction === "up"
    ? "↑ increasing"
    : trend.direction === "down"
    ? "↓ decreasing"
    : "→ stable";

  const sign = trend.delta >= 0 ? "+" : "";
  return `  ${label}: ${trend.first_value} → ${trend.last_value} (${sign}${trend.delta}) ${arrow} [${trend.first_date} to ${trend.last_date}]`;
}

// ── Prompt builder ────────────────────────────────────────

function buildAnalysisPrompt(telemetry, latestReport) {
  const {
    generated_at,
    date,
    current_state,
    trends,
    task_pipeline,
    cycle_state,
    recent_improvements,
    data_points_available,
  } = telemetry;

  // ── Format sections ──────────────────────────────────

  const trendSection = [
    formatTrend(trends.products_total,          "Products total"),
    formatTrend(trends.products_without_views,  "Without views"),
    formatTrend(trends.products_missing_images, "Missing images"),
    formatTrend(trends.inactive_sellers,        "Inactive sellers"),
  ].join("\n");

  const pendingTasksSection = task_pipeline.pending_tasks.length
    ? task_pipeline.pending_tasks
        .map(t => `  - [${t.priority}] ${t.title}`)
        .join("\n")
    : "  (no pending tasks)";

  const improvementsSection = recent_improvements.length
    ? recent_improvements
        .map(i => `  - ${i.date}: ${(i.improvements || []).join("; ")}`)
        .join("\n")
    : "  (no improvements recorded yet)";

  const trendingProducts = current_state.trending_products.length
    ? current_state.trending_products.join(", ")
    : "none";

  const reportSection = latestReport
    ? `### ${latestReport.name}\n\`\`\`\n${latestReport.content}\n\`\`\``
    : "(no analytics report available for this cycle)";

  // ── Build prompt ─────────────────────────────────────

  return `# FLOWJUYU AI ANALYSIS REQUEST
Generated: ${generated_at}
Date: ${date}
Marketplace data points available: ${data_points_available}

---

You are acting as the Flowjuyu AI Analyst.

Your job is to analyze real marketplace data, identify patterns and root causes,
and produce concrete, actionable recommendations for the development team.

This is NOT a generic exercise. The data below is real. The platform is live.
Every insight must be grounded in what the numbers actually show.

---

## SECTION 1 — Current Marketplace State

| Metric | Value |
|---|---|
| Products total | ${current_state.products_total ?? "—"} |
| Products without views | ${current_state.products_without_views ?? "—"} |
| Products missing images | ${current_state.products_missing_images ?? "—"} |
| Inactive sellers | ${current_state.inactive_sellers ?? "—"} |
| Trending products | ${trendingProducts} |
| State snapshot taken | ${current_state.state_generated_at ?? "—"} |

---

## SECTION 2 — 7-Day Trends

${trendSection}

Note: "up" means the number increased (which may be good or bad depending on the metric).
For "products without views" and "inactive sellers", up = deteriorating.

---

## SECTION 3 — Task Pipeline

Tasks in inbox: ${task_pipeline.inbox_count}
Tasks completed (all time): ${task_pipeline.done_count}
Cycle runs completed: ${cycle_state.cycles_run}
Last cycle: ${cycle_state.last_run ?? "unknown"}

Pending tasks:
${pendingTasksSection}

---

## SECTION 4 — Recent Improvement History

${improvementsSection}

---

## SECTION 5 — Latest Analytics Report

${reportSection}

---

## YOUR ANALYSIS TASKS

Answer each section carefully. Be specific. Reference actual numbers from the data above.

---

### A. Marketplace Health Diagnosis

- What is the overall health state of this marketplace right now?
- What are the 2–3 most critical problems visible in the data?
- Are conditions improving, stable, or deteriorating based on the trends?
- What does "0 trending products" tell you about the platform's current state?

---

### B. Root Cause Analysis

For each of these problems, identify the most likely root cause:

1. **Products without views** (${current_state.products_without_views ?? "?"} of ${current_state.products_total ?? "?"})
   - Is this a discovery problem (no traffic), a catalog problem (bad product data), or an SEO/indexing problem?
   - Which backend files or routes are most likely involved?

2. **Inactive sellers** (${current_state.inactive_sellers ?? "?"})
   - Is this an onboarding/activation problem or a retention problem?
   - What signals in the data point you toward one or the other?

3. **Missing images** (${current_state.products_missing_images ?? "?"})
   - Is this a seller education issue, an upload pipeline issue, or both?

---

### C. Priority Recommendations

Provide exactly **3 prioritized recommendations**.

For each recommendation use this format:

**Recommendation N**
- What: [specific action]
- Why: [which metric it improves and by how much, estimated]
- Where: [specific file paths or API routes to inspect first]
- Risk: low / medium / high
- Dependencies: [what must be true for this to work]

---

### D. Anomalies or Concerns

- Is anything in this data unexpected or alarming?
- Are there any structural signals (not just surface metrics) that suggest a deeper problem?
- Is the AI system itself behaving correctly based on cycles_run vs reports generated?

---

### E. Proposed New Tasks

Propose **1–2 tasks** to add to the task inbox based on this analysis.

For each task use this exact format (it will be parsed):

**PROPOSED TASK**
Title: [task title]
Priority: high | medium | low
Description: [1–2 sentence description of what needs to be investigated or done]

---

### F. Information Gaps

- What data is NOT available here that would significantly improve this analysis?
- What telemetry or logging should be added to the platform to close those gaps?

---

## CONSTRAINTS

- Do not propose: deployment actions, .env changes, or any destructive operations
- Do not invent files that may not exist — qualify uncertainty when referencing code
- Keep all recommendations compatible with a local-first, human-in-the-loop architecture
- Prefer backend/product improvements over infrastructure changes

---
`;
}

// ── Main ──────────────────────────────────────────────────

function main() {
  console.log("\n=== FLOWJUYU LLM ANALYSIS AGENT ===\n");

  // Ensure prompts directory exists
  if (!fs.existsSync(promptsDir)) {
    fs.mkdirSync(promptsDir, { recursive: true });
  }

  // Load telemetry
  const telemetry = getLatestTelemetry();

  if (!telemetry) {
    console.warn("  No telemetry artifact found.");
    console.warn("  Run: node flow-ai/runners/run-telemetry-collector.js");
    console.warn("  Exiting gracefully — this is not a fatal error.\n");
    process.exit(0);
  }

  const date = telemetry.date;

  // Guard: skip if today's prompt already exists
  const outFile    = path.join(promptsDir, `claude-analysis-${date}.md`);
  const bridgeFile = path.join(promptsDir, "claude-dev-bridge.md");

  if (fs.existsSync(outFile)) {
    console.log(`  Analysis prompt for ${date} already exists — skipping generation.`);
    console.log(`  File: ${outFile}\n`);
    process.exit(0);
  }

  // Load supplementary data
  const latestReport = getLatestAnalyticsReportContent();

  // Build prompt
  const prompt = buildAnalysisPrompt(telemetry, latestReport);

  // Write dated analysis prompt
  fs.writeFileSync(outFile, prompt, "utf8");
  console.log(`  Analysis prompt: ${outFile}`);

  // Update dev bridge to point to latest analysis
  const bridge = `# FLOWJUYU DEV BRIDGE — ${date}

The AI analysis prompt for today has been generated.

**Load this file into Claude Code to run the analysis:**

  ${outFile}

The prompt includes:
  - Current marketplace state (${telemetry.current_state.products_total ?? "?"} products, ${telemetry.current_state.inactive_sellers ?? "?"} inactive sellers)
  - 7-day trend data (${telemetry.data_points_available} historical data points)
  - Task pipeline state (${telemetry.task_pipeline.inbox_count} pending, ${telemetry.task_pipeline.done_count} done)
  - Latest analytics report
  - Structured questions to guide analysis

---

${prompt}
`;

  fs.writeFileSync(bridgeFile, bridge, "utf8");
  console.log(`  Dev bridge:       ${bridgeFile}`);
  console.log("\nNext step: open the analysis prompt in Claude Code.\n");
}

main();
