require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const reportsDir = path.join(__dirname, "../reports/daily");
const inboxDir = path.join(__dirname, "../tasks/inbox");
const doneDir = path.join(__dirname, "../tasks/done");

/* =====================================
   Ensure directories exist
===================================== */

function ensureDirs() {

  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  if (!fs.existsSync(inboxDir)) fs.mkdirSync(inboxDir, { recursive: true });
  if (!fs.existsSync(doneDir)) fs.mkdirSync(doneDir, { recursive: true });

}

/* =====================================
   Get latest analytics report
===================================== */

function getLatestReport() {

  const files = fs.readdirSync(reportsDir);

  const analyticsFiles = files
    .filter(f => f.startsWith("analytics-") && f.endsWith(".md"))
    .sort()
    .reverse();

  if (analyticsFiles.length === 0) {
    console.log("No analytics report found. Skipping supervisor analysis.");
    return null;
  }

  const latest = analyticsFiles[0];
  const filePath = path.join(reportsDir, latest);

  console.log("Latest analytics report:", latest);

  return fs.readFileSync(filePath, "utf8");
}

/* =====================================
   Check if task already exists
===================================== */

const TASK_COOLDOWN_DAYS = 7;

function taskExists(title) {

  // Always block if task is already in inbox (same-cycle deduplication)
  const inboxFiles = fs.readdirSync(inboxDir);
  for (const file of inboxFiles) {
    try {
      const task = JSON.parse(fs.readFileSync(path.join(inboxDir, file)));
      if (task.title === title) return true;
    } catch (err) {
      console.warn("Invalid inbox task file skipped:", file);
    }
  }

  // For done tasks: only block if completed within the cooldown window
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - TASK_COOLDOWN_DAYS);

  const doneFiles = fs.readdirSync(doneDir);
  for (const file of doneFiles) {
    try {
      const task = JSON.parse(fs.readFileSync(path.join(doneDir, file)));
      if (task.title !== title) continue;

      const createdAt = task.created_at ? new Date(task.created_at) : null;
      if (createdAt && createdAt > cutoff) {
        // Task was completed recently — still within cooldown
        return true;
      }
      // Task is older than cooldown — allow recreation
    } catch (err) {
      console.warn("Invalid done task file skipped:", file);
    }
  }

  return false;
}

/* =====================================
   Create task
===================================== */

function createTask(title, description, priority = "medium") {

  if (taskExists(title)) {
    console.log("Task already exists:", title);
    return;
  }

  const task = {
    id: `task-${Date.now()}`,
    title,
    description,
    priority,
    status: "pending",
    source: "ai-supervisor",
    created_at: new Date().toISOString()
  };

  const filePath = path.join(inboxDir, `${task.id}.json`);

  fs.writeFileSync(
    filePath,
    JSON.stringify(task, null, 2)
  );

  console.log("Task created:", title);

  /* ================================
     Export to Claude if HIGH
  ================================= */

  if (priority === "high") {

    try {

      execSync(
        `node flow-ai/runners/run-claude-task-exporter.js "${title}"`,
        { stdio: "inherit" }
      );

      console.log("Claude task exported:", title);

    } catch (err) {

      console.error(
        "Claude export failed:",
        err.message
      );

    }

  }

}

/* =====================================
   Analyze report
===================================== */

function analyze(report) {

  console.log("\nSupervisor analyzing report...\n");

  if (!report) {
    console.log("No report available.");
    return;
  }

  /* ================================
     Products without views
  ================================= */

  if (report.includes("Products without views")) {

    createTask(
      "Investigate products without views",
      "Several products have no views. Investigate catalog visibility, search indexing, and SEO.",
      "high"
    );

  }

  /* ================================
     Inactive sellers
  ================================= */

  if (report.includes("Inactive sellers")) {

    createTask(
      "Review inactive sellers",
      "Several sellers appear inactive. Evaluate outreach campaign or store optimization.",
      "medium"
    );

  }

  /* ================================
     Products without images
  ================================= */

  if (report.includes("Products without images")) {

    createTask(
      "Products missing images",
      "Some products lack images which impacts marketplace conversion rate.",
      "high"
    );

  }

  console.log("\nSupervisor finished analysis.\n");

}

/* =====================================
   Main runner
===================================== */

function main() {

  console.log("\n=== FLOWJUYU SUPERVISOR AGENT ===");

  ensureDirs();

  const report = getLatestReport();

  analyze(report);

}

main();