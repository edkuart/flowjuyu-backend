require("dotenv").config();
const fs = require("fs");
const path = require("path");

const inboxDir = path.join(__dirname, "../tasks/inbox");
const promptsDir = path.join(__dirname, "../prompts");
const reportsDir = path.join(__dirname, "../reports/daily");
const memoryDir = path.join(__dirname, "../memory");

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function getLatestFiles(dir, limit = 3) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .sort()
    .reverse()
    .slice(0, limit)
    .map(file => ({
      name: file,
      content: fs.readFileSync(path.join(dir, file), "utf8")
    }));
}

function findTask(taskIdOrTitle) {
  if (!fs.existsSync(inboxDir)) return null;

  const files = fs.readdirSync(inboxDir);

  for (const file of files) {
    const filePath = path.join(inboxDir, file);
    const task = readJson(filePath, null);

    if (!task) continue;

    if (task.id === taskIdOrTitle) {
      return task;
    }

    if (
      task.title &&
      task.title.toLowerCase().includes(taskIdOrTitle.toLowerCase())
    ) {
      return task;
    }
  }

  return null;
}

function buildPrompt(task) {
  const latestReports = getLatestFiles(reportsDir, 3);
  const improvements = readJson(path.join(memoryDir, "improvements.json"), []);
  const marketplace = readJson(path.join(memoryDir, "marketplace.json"), []);
  const sessions = readJson(path.join(memoryDir, "sessions.json"), {});

  const latestImprovements = improvements.slice(-3);
  const latestMarketplace = marketplace.slice(-3);

  return `# FLOWJUYU CLAUDE TASK EXPORT

You are acting as the Claude Dev Agent for Flowjuyu.

## Project Context
- Project: Flowjuyu backend
- Stack: Express + TypeScript + Sequelize + PostgreSQL
- Local-first development
- Internal AI OS exists in /flow-ai
- Internal diagnostic tools are executed through PowerShell script: scripts/flow.ps1

## Task To Work On
Task ID: ${task.id}
Title: ${task.title}
Priority: ${task.priority}
Status: ${task.status}
Description: ${task.description}

## Recent Reports
${latestReports.length
  ? latestReports
      .map(
        r => `### ${r.name}\n\`\`\`\n${r.content.slice(0, 2500)}\n\`\`\``
      )
      .join("\n\n")
  : "No reports available"}

## Recent Improvement Memory
${latestImprovements.length ? JSON.stringify(latestImprovements, null, 2) : "[]"}

## Recent Marketplace Memory
${latestMarketplace.length ? JSON.stringify(latestMarketplace, null, 2) : "[]"}

## Session Memory
${JSON.stringify(sessions, null, 2)}

## Instructions
1. Focus only on this task
2. Do not propose deployment actions
3. Do not modify secrets or .env files
4. Prefer safe local-first improvements
5. Be concrete and practical
6. If code changes are needed, identify the most likely files to inspect first
7. If the task is more product/business than code, explain the best operational next step

## Response Format
### Task Understanding
...

### Technical or Operational Diagnosis
...

### Best Next Action
...

### Files To Inspect First
- ...
- ...
- ...

### Safe Implementation Plan
1. ...
2. ...
3. ...

### Risks
- ...
`;
}

function main() {
  console.log("\n=== FLOWJUYU CLAUDE TASK EXPORTER ===\n");

  const taskIdOrTitle = process.argv[2];

  if (!taskIdOrTitle) {
    console.log("Usage:");
    console.log("node flow-ai/runners/run-claude-task-exporter.js \"task title or id\"");
    process.exit(1);
  }

  const task = findTask(taskIdOrTitle);

  if (!task) {
    console.log("Task not found in inbox.");
    process.exit(1);
  }

  const prompt = buildPrompt(task);
  const safeTitle = task.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const outputFile = path.join(
    promptsDir,
    `claude-task-${safeTitle}.md`
  );

  fs.writeFileSync(outputFile, prompt, "utf8");

  console.log("Task prompt generated:");
  console.log(outputFile);
  console.log("\nUse this file in Claude Code / Claude Pro.\n");
}

main();