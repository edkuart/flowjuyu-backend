// src/services/email.cron.ts
//
// Lifecycle email cron — runs every 2 hours.
// Two batches per tick:
//   1. activation — sellers with no product after 24 h
//   2. week1      — all sellers after 7 days
//
// Idempotency: SellerEmailLog prevents any email being sent twice.
// Pattern mirrors billing.cron.ts exactly.

import cron from 'node-cron';
import { Op } from 'sequelize';
import { logger } from '../config/logger';
import { VendedorPerfil } from '../models/VendedorPerfil';
import { SellerEmailLog } from '../models/SellerEmailLog.model';
import { sendEmail } from './email.service';
import {
  activationEmailSubject,
  activationEmailHtml,
} from './emailTemplates/activation';
import {
  week1EmailSubject,
  week1EmailHtml,
} from './emailTemplates/week1';

// ─── Config ───────────────────────────────────────────────────────────────────

/** Override via env — 5-field cron. Default: every 2 hours. */
const SCHEDULE = process.env.EMAIL_CRON_SCHEDULE ?? '0 */2 * * *';

const BATCH_LIMIT = 50; // max sellers processed per type per tick

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3600 * 1000);
}

function daysAgo(d: number): Date {
  return hoursAgo(d * 24);
}

// ─── Batch: activation email ──────────────────────────────────────────────────
// Targets: SELLER_REGISTERED state, no product, registered > 24 h ago.

async function runActivationBatch(): Promise<number> {
  const candidates = await VendedorPerfil.findAll({
    where: {
      first_product_id: null,
      onboarding_state: 'SELLER_REGISTERED',
      createdAt: { [Op.lt]: hoursAgo(24) },
    },
    attributes: ['id', 'email', 'nombre', 'nombre_comercio'],
    limit: BATCH_LIMIT,
  });

  if (candidates.length === 0) return 0;

  // Find which ones already received this email
  const alreadySent = await SellerEmailLog.findAll({
    where: {
      email_type: 'activation',
      vendedor_perfil_id: candidates.map((c) => c.id),
    },
    attributes: ['vendedor_perfil_id'],
  });

  const sentIds = new Set(alreadySent.map((l) => l.vendedor_perfil_id));
  const toSend  = candidates.filter((c) => !sentIds.has(c.id));

  let sent = 0;
  for (const seller of toSend) {
    try {
      await sendEmail(
        seller.email,
        activationEmailSubject(),
        activationEmailHtml(seller.nombre, seller.nombre_comercio),
      );

      // Log before marking — if sendEmail throws the row won't be inserted,
      // so we retry on the next tick. Acceptable for V1.
      await SellerEmailLog.create({
        vendedor_perfil_id: seller.id,
        email_type: 'activation',
      });

      sent++;
    } catch (err) {
      logger.error(
        { err, vendedorPerfilId: seller.id },
        '[email.cron] activation email failed — will retry next tick',
      );
    }
  }

  return sent;
}

// ─── Batch: week1 email ───────────────────────────────────────────────────────
// Targets: any seller registered > 7 days ago.

async function runWeek1Batch(): Promise<number> {
  const candidates = await VendedorPerfil.findAll({
    where: {
      createdAt: { [Op.lt]: daysAgo(7) },
    },
    attributes: ['id', 'email', 'nombre', 'nombre_comercio', 'first_product_id'],
    limit: BATCH_LIMIT,
  });

  if (candidates.length === 0) return 0;

  const alreadySent = await SellerEmailLog.findAll({
    where: {
      email_type: 'week1',
      vendedor_perfil_id: candidates.map((c) => c.id),
    },
    attributes: ['vendedor_perfil_id'],
  });

  const sentIds = new Set(alreadySent.map((l) => l.vendedor_perfil_id));
  const toSend  = candidates.filter((c) => !sentIds.has(c.id));

  let sent = 0;
  for (const seller of toSend) {
    try {
      const hasProduct = !!seller.first_product_id;

      await sendEmail(
        seller.email,
        week1EmailSubject(hasProduct),
        week1EmailHtml(seller.nombre, seller.nombre_comercio, hasProduct),
      );

      await SellerEmailLog.create({
        vendedor_perfil_id: seller.id,
        email_type: 'week1',
      });

      sent++;
    } catch (err) {
      logger.error(
        { err, vendedorPerfilId: seller.id },
        '[email.cron] week1 email failed — will retry next tick',
      );
    }
  }

  return sent;
}

// ─── Tick ─────────────────────────────────────────────────────────────────────

let running = false;

async function tick(): Promise<void> {
  if (running) {
    logger.warn('[email.cron] Previous run still in progress — skipping tick');
    return;
  }

  running = true;
  const startedAt = Date.now();
  logger.info('[email.cron] Lifecycle email cron started');

  try {
    const [activation, week1] = await Promise.all([
      runActivationBatch(),
      runWeek1Batch(),
    ]);

    logger.info(
      { durationMs: Date.now() - startedAt, activation, week1 },
      '[email.cron] Lifecycle email cron completed',
    );
  } catch (err) {
    logger.error(
      { err, durationMs: Date.now() - startedAt },
      '[email.cron] Lifecycle email cron threw an unexpected error',
    );
  } finally {
    running = false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

let task: ReturnType<typeof cron.schedule> | null = null;

/**
 * Start the lifecycle email cron.
 * Also syncs the seller_email_log table (create if not exists).
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function startEmailCron(): Promise<void> {
  if (task) return;

  // Ensure the log table exists before the first tick runs.
  await SellerEmailLog.sync({ force: false });

  if (!cron.validate(SCHEDULE)) {
    logger.error(
      { schedule: SCHEDULE },
      '[email.cron] Invalid EMAIL_CRON_SCHEDULE — cron NOT started',
    );
    return;
  }

  task = cron.schedule(SCHEDULE, () => {
    tick().catch((err) => {
      logger.error({ err }, '[email.cron] Unhandled error in tick()');
    });
  });

  logger.info({ schedule: SCHEDULE }, '[email.cron] Lifecycle email cron scheduled');
}

/**
 * Stop the lifecycle email cron (graceful shutdown).
 */
export function stopEmailCron(): void {
  if (!task) return;
  task.stop();
  task = null;
  logger.info('[email.cron] Lifecycle email cron stopped');
}
