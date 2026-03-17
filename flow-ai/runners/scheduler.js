const cron = require("node-cron");
const { execSync } = require("child_process");

let running = false;

/* =====================================
   Run AI Daily Cycle
===================================== */

function runDailyCycle(trigger = "scheduler") {

  if (running) {
    console.log("AI cycle already running. Skipping...");
    return;
  }

  running = true;

  const now = new Date().toISOString();

  console.log("\n====================================");
  console.log("FLOWJUYU AI AUTOMATED DAILY CYCLE");
  console.log("Trigger:", trigger);
  console.log("Time:", now);
  console.log("====================================\n");

  try {

    execSync(
      "node flow-ai/runners/run-daily-cycle.js",
      { stdio: "inherit" }
    );

    console.log("\nAI cycle finished successfully.\n");

  } catch (err) {

    console.error("\nAI cycle failed:", err.message);

  } finally {

    running = false;

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
* * * * *
*/

/* =====================================
   Scheduled Runs
===================================== */

// 09:00 AM
cron.schedule("0 9 * * *", () => {
  runDailyCycle("09:00 schedule");
});

// 15:00 PM
cron.schedule("0 15 * * *", () => {
  runDailyCycle("15:00 schedule");
});

/* =====================================
   Optional Startup Run
===================================== */

if (process.argv.includes("--run-now")) {
  runDailyCycle("manual");
}

/* =====================================
   Logs
===================================== */

console.log("\nFlowjuyu AI Scheduler started");
console.log("Scheduled runs:");
console.log(" • 09:00 AM");
console.log(" • 15:00 PM");
console.log("\nUse '--run-now' to execute immediately.\n");