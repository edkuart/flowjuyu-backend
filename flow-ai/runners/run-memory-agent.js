const fs = require("fs");
const path = require("path");

const reportsDir = path.join(__dirname, "../reports/daily");
const marketplaceMemoryFile = path.join(__dirname, "../memory/marketplace.json");
const improvementsMemoryFile = path.join(__dirname, "../memory/improvements.json");

function getLatestFile(prefix) {
  const files = fs
    .readdirSync(reportsDir)
    .filter(file => file.startsWith(prefix))
    .sort()
    .reverse();

  return files.length ? path.join(reportsDir, files[0]) : null;
}

function appendJson(filePath, item) {
  const current = JSON.parse(fs.readFileSync(filePath, "utf8"));
  current.push(item);
  fs.writeFileSync(filePath, JSON.stringify(current, null, 2));
}

function analyzeAnalyticsReport(content) {
  const insights = [];

  if (content.includes("Products without views")) {
    insights.push("Catalog visibility problem detected");
  }

  if (content.includes("Inactive sellers")) {
    insights.push("Seller inactivity detected");
  }

  if (content.includes("Products without images")) {
    insights.push("Catalog image quality issue detected");
  }

  return insights;
}

function analyzeCodeReport(content) {
  const improvements = [];

  if (content.includes("Large files")) {
    improvements.push("Refactor large files detected by code analysis");
  }

  return improvements;
}

function main() {
  console.log("\n=== FLOWJUYU MEMORY AGENT ===\n");

  const analyticsFile = getLatestFile("analytics-");
  const codeFile = getLatestFile("code-analysis-");

  if (analyticsFile) {
    const analyticsContent = fs.readFileSync(analyticsFile, "utf8");
    const insights = analyzeAnalyticsReport(analyticsContent);

    if (insights.length > 0) {
      appendJson(marketplaceMemoryFile, {
        date: new Date().toISOString(),
        insights
      });
      console.log("Marketplace memory updated.");
    }
  }

  if (codeFile) {
    const codeContent = fs.readFileSync(codeFile, "utf8");
    const improvements = analyzeCodeReport(codeContent);

    if (improvements.length > 0) {
      appendJson(improvementsMemoryFile, {
        date: new Date().toISOString(),
        improvements
      });
      console.log("Improvements memory updated.");
    }
  }

  console.log("\nMemory agent finished.\n");
}

main();