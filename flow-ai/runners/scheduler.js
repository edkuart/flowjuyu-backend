const cron = require("node-cron");
const { execSync } = require("child_process");

function runDailyCycle() {
  console.log("\n====================================");
  console.log("FLOWJUYU AI AUTOMATED DAILY CYCLE");
  console.log("====================================\n");

  try {
    execSync("node flow-ai/runners/run-daily-cycle.js", {
      stdio: "inherit"
    });
  } catch (err) {
    console.error("Error running AI cycle:", err.message);
  }
}

/*
CRON FORMAT
┌───────────── minute
│ ┌───────────── hour
│ │ ┌───────────── day of month
│ │ │ ┌───────────── month
│ │ │ │ ┌───────────── day of week
│ │ │ │ │
│ │ │ │ │
* * * * *
*/

// Ejecutar todos los días a las 9:00 AM
cron.schedule("0 9 * * *", () => {
  runDailyCycle();
});

// También ejecutar a las 3:00 PM
cron.schedule("0 15 * * *", () => {
  runDailyCycle();
});

console.log("Flowjuyu AI Scheduler started...");
console.log("Daily cycles scheduled at 09:00 and 15:00");