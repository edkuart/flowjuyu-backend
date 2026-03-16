const fs = require("fs");
const path = require("path");

const inboxDir = path.join(__dirname, "../tasks/inbox");
const doneDir = path.join(__dirname, "../tasks/done");
const reportsDir = path.join(__dirname, "../reports/daily");
const memoryDir = path.join(__dirname, "../memory");
const promptsDir = path.join(__dirname, "../prompts");

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

function getJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function buildPrompt() {
  const pendingTasks = fs.existsSync(inboxDir)
    ? fs.readdirSync(inboxDir).map(file => {
        const task = JSON.parse(fs.readFileSync(path.join(inboxDir, file), "utf8"));
        return `- ${task.title} [priority: ${task.priority}]`;
      })
    : [];

  const latestReports = getLatestFiles(reportsDir, 3);
  const improvements = getJson(path.join(memoryDir, "improvements.json"), []);
  const marketplace = getJson(path.join(memoryDir, "marketplace.json"), []);
  const sessions = getJson(path.join(memoryDir, "sessions.json"), {});

  const latestImprovements = improvements.slice(-3);
  const latestMarketplace = marketplace.slice(-3);

  return `# FLOWJUYU CLAUDE DEV BRIDGE

You are acting as the Claude Dev Agent for Flowjuyu.

Project context:
- Backend project: Flowjuyu marketplace
- Stack: Express + TypeScript + Sequelize + PostgreSQL
- System includes internal CLI commands through PowerShell script: scripts/flow.ps1
- There is an AI operating system in /flow-ai with reports, tasks, memory, and runners

Your role:
- Review the technical state of the project
- Propose safe, concrete engineering improvements
- Prioritize backend stability, maintainability, and marketplace impact
- Do NOT invent files or commands
- Do NOT propose deployment actions
- Do NOT modify .env or production secrets

## Pending tasks
${pendingTasks.length ? pendingTasks.join("\n") : "- No pending tasks"}

## Latest reports
${latestReports.length
  ? latestReports
      .map(
        r => `### ${r.name}\n\`\`\`\n${r.content.slice(0, 3000)}\n\`\`\``
      )
      .join("\n\n")
  : "No reports available"}

## Latest improvement memory
${latestImprovements.length ? JSON.stringify(latestImprovements, null, 2) : "[]"}

## Latest marketplace memory
${latestMarketplace.length ? JSON.stringify(latestMarketplace, null, 2) : "[]"}

## Session memory
${JSON.stringify(sessions, null, 2)}

## Your tasks
1. Summarize the most important backend risks
2. Identify the highest-impact next engineering improvement
3. Suggest a safe implementation plan
4. If appropriate, propose exact files to inspect first
5. Keep recommendations practical for local-first development

Respond in this format:

### Technical Summary
...

### Top Priority
...

### Recommended Plan
...

### Files To Review First
- ...
- ...
- ...

### Safe Next Step
...
`;
}

function main() {
  console.log("\n=== FLOWJUYU CLAUDE DEV BRIDGE ===\n");

  const prompt = buildPrompt();
  const outputFile = path.join(promptsDir, "claude-dev-bridge.md");

  fs.writeFileSync(outputFile, prompt, "utf8");

  console.log("Claude bridge prompt generated:");
  console.log(outputFile);
  console.log("\nUse this file as input for Claude Code / Claude Pro.\n");
}

main();