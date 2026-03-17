const fs = require("fs");
const path = require("path");

// Tasks in inbox are all pending by definition.
// Status is confirmed by reading task.status from each JSON file.
const inboxDir = path.join(__dirname, "../tasks/inbox");

async function runClaudeWorker() {

  console.log("=== CLAUDE WORKER AGENT ===");

  if (!fs.existsSync(inboxDir)) {
    console.log("Inbox directory not found.");
    return;
  }

  const files = fs.readdirSync(inboxDir).filter(f => f.endsWith(".json"));

  const pendingTasks = [];

  for (const file of files) {
    try {
      const task = JSON.parse(
        fs.readFileSync(path.join(inboxDir, file), "utf8")
      );
      if (task.status === "pending") {
        pendingTasks.push({ file, task });
      }
    } catch (err) {
      console.warn("Skipping invalid task file:", file);
    }
  }

  if (pendingTasks.length === 0) {
    console.log("No pending tasks.");
    return;
  }

  for (const { task } of pendingTasks) {

    console.log("Processing task:", task.id);

    const promptFile = path.join(
      __dirname,
      "../prompts",
      `claude-${task.id}.md`
    );

    fs.writeFileSync(
      promptFile,
      `TASK: ${task.description}\n\nDATA:\n${JSON.stringify(task, null, 2)}\n`
    );

    console.log("Prompt exported:", promptFile);
  }

}

module.exports = runClaudeWorker;