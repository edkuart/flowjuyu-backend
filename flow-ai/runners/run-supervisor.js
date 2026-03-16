const fs = require("fs");
const path = require("path");

const reportsDir = path.join(__dirname, "../reports/daily");
const inboxDir = path.join(__dirname, "../tasks/inbox");
const doneDir = path.join(__dirname, "../tasks/done");

function getLatestReport() {
  const files = fs.readdirSync(reportsDir);

  if (files.length === 0) {
    console.log("No analytics reports found.");
    return null;
  }

  const latest = files.sort().reverse()[0];
  return fs.readFileSync(path.join(reportsDir, latest), "utf8");
}

function taskExists(title) {
  const doneTasks = fs.readdirSync(doneDir);

  for (const file of doneTasks) {
    const task = JSON.parse(
      fs.readFileSync(path.join(doneDir, file))
    );

    if (task.title === title) return true;
  }

  return false;
}

function createTask(title, description, priority) {
  if (taskExists(title)) {
    console.log("Task already completed:", title);
    return;
  }

  const task = {
    id: `task-${Date.now()}`,
    title,
    description,
    priority,
    status: "pending",
    created_at: new Date().toISOString()
  };

  const file = path.join(inboxDir, `${task.id}.json`);
  fs.writeFileSync(file, JSON.stringify(task, null, 2));

  console.log("Task created:", title);
}

function analyze(report) {
  console.log("\nSupervisor analyzing report...\n");

  if (!report) return;

  if (report.includes("Products without views")) {
    createTask(
      "Investigate products without views",
      "Several products have no views. Investigate catalog visibility and SEO.",
      "high"
    );
  }

  if (report.includes("Inactive sellers")) {
    createTask(
      "Review inactive sellers",
      "Several sellers appear inactive. Consider outreach campaign.",
      "medium"
    );
  }

  if (report.includes("Products without images")) {
    createTask(
      "Products missing images",
      "Some products lack images. This affects conversion.",
      "high"
    );
  }

  console.log("\nSupervisor finished analysis.\n");
}

function main() {
  console.log("\n=== FLOWJUYU SUPERVISOR AGENT ===");

  const report = getLatestReport();
  analyze(report);
}

main();