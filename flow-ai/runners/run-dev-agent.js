require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const inboxDir = path.join(__dirname, "../tasks/inbox");
const progressDir = path.join(__dirname, "../tasks/in-progress");
const doneDir = path.join(__dirname, "../tasks/done");

function run(command) {
  try {
    console.log(`Running: ${command}`);
    return execSync(command, { encoding: "utf8" });
  } catch (err) {
    return `ERROR:\n${err.message}`;
  }
}

function moveTask(file, from, to) {
  fs.renameSync(
    path.join(from, file),
    path.join(to, file)
  );
}

function processTask(file) {
  const filePath = path.join(inboxDir, file);
  const task = JSON.parse(fs.readFileSync(filePath, "utf8"));

  console.log(`\nProcessing task: ${task.title}\n`);

  moveTask(file, inboxDir, progressDir);

  const title = task.title.toLowerCase();
  let result = "";

  if (title.includes("products without views")) {
    result = run("powershell -ExecutionPolicy Bypass -File scripts/flow.ps1 dead-products");
  }

  if (title.includes("inactive sellers")) {
    result = run("powershell -ExecutionPolicy Bypass -File scripts/flow.ps1 sellers");
  }

  if (title.includes("missing images")) {
    result = run("powershell -ExecutionPolicy Bypass -File scripts/flow.ps1 insights");
  }

  const report = `
# Dev Agent Task Result

Task: ${task.title}

Result:

${result}
`;

  const reportFile = path.join(
    __dirname,
    "../reports/daily",
    `dev-task-${Date.now()}.md`
  );

  fs.writeFileSync(reportFile, report);

  moveTask(file, progressDir, doneDir);

  console.log("Task completed:", task.title);
}

function main() {
  console.log("\n=== FLOWJUYU DEV AGENT ===\n");

  const tasks = fs.readdirSync(inboxDir);

  if (tasks.length === 0) {
    console.log("No tasks in inbox.");
    return;
  }

  tasks.forEach(processTask);
}

main();