/**
 * DEPRECATED — This file is a legacy prototype and is NOT used by the system.
 *
 * The active growth agent implementation is:
 *   flow-ai/runners/run-growth-agent.js
 *
 * That runner reads real analytics reports and memory, and is called by
 * run-daily-cycle.js. This file uses hardcoded simulated data and should
 * be deleted once you confirm no external code references it.
 */

const fs = require("fs");
const path = require("path");

const reportsDir = path.join(__dirname, "../reports/daily");

function generateGrowthReport() {

  console.log("\n=== FLOWJUYU GROWTH AGENT ===\n");

  const insights = [];

  // Simulación inicial
  // luego aquí consultaremos la DB real

  insights.push({
    type: "product_opportunity",
    title: "Products with views but low engagement",
    description:
      "Some products receive views but have low engagement. Improve descriptions or highlight them."
  });

  insights.push({
    type: "seller_opportunity",
    title: "New sellers with potential",
    description:
      "Recently approved sellers may benefit from additional visibility."
  });

  insights.push({
    type: "category_opportunity",
    title: "Emerging textile categories",
    description:
      "Some textile styles show increased activity and could be promoted."
  });

  const report = `
# Flowjuyu Growth Report

Generated: ${new Date().toISOString()}

## Opportunities

${insights
  .map(
    i => `
### ${i.title}

${i.description}
`
  )
  .join("\n")}

`;

  const file = path.join(
    reportsDir,
    `growth-${new Date().toISOString().split("T")[0]}.md`
  );

  fs.writeFileSync(file, report);

  console.log("Growth report saved:", file);
}

module.exports = generateGrowthReport;