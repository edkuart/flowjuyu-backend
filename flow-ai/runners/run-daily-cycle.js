const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const memoryFile = path.join(__dirname, "../memory/sessions.json");
const doneDir = path.join(__dirname, "../tasks/done");
const reportsDir = path.join(__dirname, "../reports/daily");

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

  run("node flow-ai/runners/run-analytics-agent.js");
  run("node flow-ai/runners/run-supervisor.js");
  run("node flow-ai/runners/run-dev-agent.js");
  run("node flow-ai/runners/run-code-analysis-agent.js");
  run("node flow-ai/runners/run-memory-agent.js");

  updateMemory();

  console.log("\n==============================");
  console.log("FLOWJUYU AI DAILY CYCLE DONE");
  console.log("==============================\n");
}

main();