const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "../../src");
const reportDir = path.join(__dirname, "../reports/daily");

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);

    if (fs.statSync(filePath).isDirectory()) {
      walk(filePath, fileList);
    } else {
      if (file.endsWith(".ts") || file.endsWith(".js")) {
        fileList.push(filePath);
      }
    }
  });

  return fileList;
}

function analyzeFile(file) {
  const content = fs.readFileSync(file, "utf8");

  const lines = content.split("\n").length;

  return {
    file,
    lines,
    largeFile: lines > 400
  };
}

function generateReport(results) {
  const date = new Date().toISOString().split("T")[0];

  const largeFiles = results.filter(r => r.largeFile);

  const report = `
# Flowjuyu Code Analysis Report

Generated: ${new Date().toISOString()}

Total files scanned: ${results.length}

Large files (>400 lines): ${largeFiles.length}

## Large Files
${largeFiles.map(f => `- ${f.file} (${f.lines} lines)`).join("\n")}
`;

  const file = path.join(reportDir, `code-analysis-${date}.md`);

  fs.writeFileSync(file, report);

  console.log("Code analysis report saved:", file);
}

function main() {
  console.log("\n=== FLOWJUYU CODE ANALYSIS AGENT ===\n");

  const files = walk(srcDir);

  const results = files.map(analyzeFile);

  generateReport(results);
}

main();