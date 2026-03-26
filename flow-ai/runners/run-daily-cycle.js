require("dotenv").config();
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const memoryFile = path.join(__dirname, "../memory/sessions.json");
const doneDir = path.join(__dirname, "../tasks/done");
const reportsDir = path.join(__dirname, "../reports/daily");
const agentsConfigFile = path.join(__dirname, "../config/agents.json");

/* =====================================
   Load agents config
   Default: all agents enabled if config
   is missing or unreadable.
===================================== */

function loadAgentsConfig() {
  try {
    if (!fs.existsSync(agentsConfigFile)) {
      console.warn("agents.json not found. Running all agents by default.");
      return null;
    }
    return JSON.parse(fs.readFileSync(agentsConfigFile, "utf8"));
  } catch (err) {
    console.error("Failed to read agents.json:", err.message);
    console.warn("Running all agents by default.");
    return null;
  }
}

/* =====================================
   Check if a named agent is enabled.
   If the agent is not listed in config,
   default to enabled (safe fallback).
===================================== */

function isEnabled(config, agentName) {
  if (!config || !Array.isArray(config.agents)) return true;
  const entry = config.agents.find(a => a.name === agentName);
  if (!entry) return true;
  return entry.enabled === true;
}

/* =====================================
   Runner definitions
   Maps agent name → runner file path.
   code-analysis and memory-agent are
   not in agents.json, so they always
   default to enabled.
===================================== */

const RUNNERS = [
  { name: "analytics-agent",    file: "flow-ai/runners/run-analytics-agent.js" },
  { name: "supervisor",         file: "flow-ai/runners/run-supervisor.js" },
  { name: "dev-agent",          file: "flow-ai/runners/run-dev-agent.js" },
  { name: "code-analysis",      file: "flow-ai/runners/run-code-analysis-agent.js" },
  { name: "memory-agent",       file: "flow-ai/runners/run-memory-agent.js" },
  { name: "growth-agent",       file: "flow-ai/runners/run-growth-agent.js" },
  // AI Brain Cycle — runs DB-powered intelligence, scanner, growth,
  // seller analysis, and risk detection via the admin API.
  { name: "brain-cycle",        file: "flow-ai/runners/run-brain-cycle.js" },
  // Telemetry collector — aggregates intelligence.json + 7-day marketplace trends
  // + task pipeline into a single normalized JSON artifact.
  // Runs AFTER brain-cycle (intelligence.json fresh) and memory-agent (marketplace.json fresh).
  { name: "telemetry-collector", file: "flow-ai/runners/run-telemetry-collector.js" },
  // Priority generator — converts telemetry signals into a sorted, machine-readable
  // priority-YYYY-MM-DD.json artifact. Deterministic (no LLM). Runs after telemetry.
  { name: "priority-generator",  file: "flow-ai/runners/run-priority-generator.js" },
  // LLM trigger — reads priority artifact and activates LLM prompt generation ONLY
  // when high-priority issues exist (score >= 90 or severity = high). Zero cost on quiet cycles.
  { name: "llm-trigger",         file: "flow-ai/runners/run-llm-trigger.js" },
  // LLM executor — calls Anthropic API with the trigger prompt and saves structured
  // analysis to flow-ai/artifacts/llm-response-YYYY-MM-DD.json.
  // Requires ANTHROPIC_API_KEY. Skips if no trigger prompt or response already exists.
  // Only runs when llm-trigger has written a prompt (controlled cost).
  { name: "llm-executor",        file: "flow-ai/runners/run-llm-executor.js" },
  // LLM analysis agent — reads telemetry artifact, builds a structured analytical
  // prompt for Claude Code. Idempotent (skips if today's prompt exists).
  // Soft-exits gracefully if telemetry artifact is missing.
  { name: "llm-analysis-agent",  file: "flow-ai/runners/run-llm-analysis-agent.js" },
  // Content performance rollup — aggregates yesterday's analytics events into
  // ai_content_performance_daily and writes a 7-day learning artifact + decisions map.
  // Requires pg + DATABASE_URL. Skips gracefully if no published items exist.
  { name: "content-performance-rollup", file: "flow-ai/runners/run-content-performance-rollup.js" },
  // Content optimizer — builds the prioritized generation queue using performance data
  // from the rollup above. Writes optimizer artifact + updates content-decisions.json.
  // Set OPTIMIZER_AUTO_GENERATE=true + OPTIMIZER_SERVICE_TOKEN to enable auto-triggering.
  // Runs AFTER performance rollup so decisions are based on fresh data.
  { name: "content-optimizer", file: "flow-ai/runners/run-content-optimizer.js" },
  // Content adaptation — refreshes template metrics, evaluates template health,
  // extracts edit patterns, and proposes evolved candidate templates.
  // Set ADAPTER_API_ENABLED=true + OPTIMIZER_SERVICE_TOKEN to run the full TypeScript pipeline.
  // Runs AFTER optimizer so generation data is as fresh as possible.
  { name: "content-adaptation", file: "flow-ai/runners/run-content-adaptation.js" },
];

function run(command) {
  try {
    console.log(`\nRunning: ${command}\n`);
    execSync(command, { stdio: "inherit" });
  } catch (err) {
    console.error(`Error running command: ${command}`);
    console.error(err.message);
  }
}

function countFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).length;
}

function updateMemory() {
  const memory = JSON.parse(fs.readFileSync(memoryFile, "utf8"));

  memory.cycles_run += 1;
  memory.last_run = new Date().toISOString();
  memory.tasks_completed = countFiles(doneDir);
  memory.reports_generated = countFiles(reportsDir);

  fs.writeFileSync(memoryFile, JSON.stringify(memory, null, 2));
  console.log("Memory updated:", memoryFile);
}

function main() {
  console.log("\n==============================");
  console.log("FLOWJUYU AI DAILY CYCLE START");
  console.log("==============================\n");

  const agentsConfig = loadAgentsConfig();

  for (const runner of RUNNERS) {
    if (isEnabled(agentsConfig, runner.name)) {
      run(`node ${runner.file}`);
    } else {
      console.log(`Skipping disabled agent: ${runner.name}`);
    }
  }

  updateMemory();

  console.log("\n==============================");
  console.log("FLOWJUYU AI DAILY CYCLE DONE");
  console.log("==============================\n");
}

main();