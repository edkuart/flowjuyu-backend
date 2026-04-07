// src/services/billing.cron.ts
//
// Schedules the billing renewal cron (runRenewalCron) using node-cron.
//
// Default schedule: daily at 02:00 UTC.
// Override via env: BILLING_CRON_SCHEDULE (standard cron expression, 5-field).
//
// Concurrency guard: a simple in-memory flag prevents overlapping runs.
// This is sufficient for single-process deployments. For multi-process
// (e.g., PM2 cluster) use a distributed lock (e.g., pg advisory lock).

import cron from "node-cron";
import { logger } from "../config/logger";
import { runRenewalCron } from "./billing.service";

// ─── Config ───────────────────────────────────────────────────────────────────

/** Cron expression — default: every day at 02:00 UTC */
const SCHEDULE = process.env.BILLING_CRON_SCHEDULE ?? "0 2 * * *";

// ─── Concurrency guard ────────────────────────────────────────────────────────

let running = false;

async function tick(): Promise<void> {
  if (running) {
    logger.warn("[billing.cron] Previous run still in progress — skipping tick");
    return;
  }

  running = true;
  const startedAt = Date.now();
  logger.info("[billing.cron] Renewal cron started");

  try {
    const result = await runRenewalCron();

    const elapsed = Date.now() - startedAt;
    logger.info(
      {
        durationMs: elapsed,
        runAt: result.runAt,
        pass1: result.pass1,
        pass2: result.pass2,
      },
      "[billing.cron] Renewal cron completed"
    );
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    logger.error(
      { err, durationMs: elapsed },
      "[billing.cron] Renewal cron threw an unexpected error"
    );
  } finally {
    running = false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

let task: ReturnType<typeof cron.schedule> | null = null;

/**
 * Start the billing renewal cron scheduler.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function startBillingCron(): void {
  if (task) return;

  if (!cron.validate(SCHEDULE)) {
    logger.error(
      { schedule: SCHEDULE },
      "[billing.cron] Invalid BILLING_CRON_SCHEDULE — cron NOT started"
    );
    return;
  }

  task = cron.schedule(SCHEDULE, () => {
    tick().catch((err) => {
      // tick() catches its own errors, but guard against any unexpected throw
      logger.error({ err }, "[billing.cron] Unhandled error in tick()");
    });
  });

  logger.info({ schedule: SCHEDULE }, "[billing.cron] Billing renewal cron scheduled");
}

/**
 * Stop the billing cron scheduler (useful for graceful shutdown / tests).
 */
export function stopBillingCron(): void {
  if (!task) return;
  task.stop();
  task = null;
  logger.info("[billing.cron] Billing renewal cron stopped");
}
