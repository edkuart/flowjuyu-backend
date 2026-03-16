const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function run(command) {
  try {
    console.log(`Running: ${command}`);
    return execSync(command, { encoding: "utf8" });
  } catch (err) {
    return `ERROR:\n${err.message}`;
  }
}

function flow(cmd) {
  return run(`powershell -ExecutionPolicy Bypass -File scripts/flow.ps1 ${cmd}`);
}

function saveReport(content) {
  const date = new Date().toISOString().split("T")[0];
  const file = path.join(__dirname, "../reports/daily", `analytics-${date}.md`);

  fs.writeFileSync(file, content, "utf8");
  console.log("Report saved:", file);
}

function main() {
  console.log("\n=== FLOWJUYU ANALYTICS AGENT ===\n");

  const insights = flow("insights");
  const health = flow("health");
  const trending = flow("trending");
  const sellers = flow("sellers");
  const deadProducts = flow("dead-products");

  const report = `
# Flowjuyu Analytics Report

Generated: ${new Date().toISOString()}

---

## Insights
\`\`\`
${insights}
\`\`\`

## Marketplace Health
\`\`\`
${health}
\`\`\`

## Trending Products
\`\`\`
${trending}
\`\`\`

## Sellers
\`\`\`
${sellers}
\`\`\`

## Dead Products
\`\`\`
${deadProducts}
\`\`\`
`;

  saveReport(report);
}

main();