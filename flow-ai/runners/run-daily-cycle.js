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
  { name: "analytics-agent", file: "flow-ai/runners/run-analytics-agent.js" },
  { name: "supervisor",      file: "flow-ai/runners/run-supervisor.js" },
  { name: "dev-agent",       file: "flow-ai/runners/run-dev-agent.js" },
  { name: "code-analysis",   file: "flow-ai/runners/run-code-analysis-agent.js" },
  { name: "memory-agent",    file: "flow-ai/runners/run-memory-agent.js" },
  { name: "growth-agent",    file: "flow-ai/runners/run-growth-agent.js" },
  // AI Brain Cycle — runs DB-powered intelligence, scanner, growth,
  // seller analysis, and risk detection via the admin API.
  { name: "brain-cycle",     file: "flow-ai/runners/run-brain-cycle.js" },
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