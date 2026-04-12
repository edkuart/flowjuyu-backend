/**
 * scripts/backfill-existing-user-consents.ts
 *
 * PURPOSE
 * -------
 * Retroactively records consent (terms + privacy) for users created before
 * the consent system existed. At registration, all users accepted a
 * "Términos y Política de Privacidad" checkbox — the record just wasn't
 * persisted to the DB until Block 2 was deployed.
 *
 * This script inserts the missing user_consents rows and sets terms_current
 * and privacy_current flags so the enforcement middleware (Block 3) passes.
 *
 * IDEMPOTENCY
 * -----------
 * Safe to re-run. Processes only users where terms_current = false.
 * After processing, terms_current = true → the user is skipped on re-run.
 *
 * USAGE
 * -----
 *   npx ts-node scripts/backfill-existing-user-consents.ts
 *   npx ts-node scripts/backfill-existing-user-consents.ts --dry-run
 *   npx ts-node scripts/backfill-existing-user-consents.ts --batch-size=100
 *   npx ts-node scripts/backfill-existing-user-consents.ts --role=buyer
 *
 * OPTIONS
 * -------
 *   --dry-run        Log what would happen, make zero DB writes
 *   --batch-size=N   Process N users per batch (default: 50)
 *   --role=R         Limit to users with this role (buyer|seller|admin|support)
 *   --user-id=N      Process a single specific user id (for testing)
 *
 * AUDIT TRAIL
 * -----------
 * All inserted consent rows have source='backfill_registration' so they are
 * distinguishable from real-time consent events in the audit log.
 */

import "dotenv/config";
import dns from "dns";
import { Sequelize, QueryTypes, Op } from "sequelize";
import { sequelize } from "../src/config/db";
import { User } from "../src/models/user.model";
import PolicyVersion from "../src/models/PolicyVersion.model";
import UserConsent from "../src/models/UserConsent.model";
// Import index to trigger association setup
import "../src/models/index";

dns.setDefaultResultOrder("ipv4first");

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN    = args.includes("--dry-run");
const BATCH_SIZE = parseInt(
  args.find((a) => a.startsWith("--batch-size="))?.split("=")[1] ?? "50",
  10,
);
const ROLE_FILTER = args.find((a) => a.startsWith("--role="))?.split("=")[1] ?? null;
const USER_ID     = args.find((a) => a.startsWith("--user-id="))?.split("=")[1]
  ? parseInt(args.find((a) => a.startsWith("--user-id="))!.split("=")[1], 10)
  : null;

// ── Stats ─────────────────────────────────────────────────────────────────────

const stats = {
  total:     0,
  processed: 0,
  skipped:   0,
  failed:    0,
  startedAt: new Date(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function warn(msg: string) {
  console.warn(`[${new Date().toISOString()}] ⚠  ${msg}`);
}

async function processUser(
  userId: number,
  termsVersion: PolicyVersion,
  privacyVersion: PolicyVersion,
): Promise<"processed" | "skipped" | "failed"> {
  try {
    // Re-check inside the loop in case a previous partial run updated the flag
    const user = await User.findByPk(userId, {
      attributes: ["id", "terms_current"],
    });

    if (!user) {
      warn(`user ${userId} not found — skipping`);
      return "skipped";
    }

    if (user.terms_current) {
      return "skipped"; // Already compliant
    }

    if (DRY_RUN) {
      log(`[DRY RUN] Would backfill user ${userId}`);
      return "processed";
    }

    const now = new Date();
    const t   = await sequelize.transaction();

    try {
      // Insert terms consent
      await UserConsent.create(
        {
          user_id:           userId,
          policy_version_id: termsVersion.id,
          granted:           true,
          ip_address:        null,
          user_agent:        null,
          source:            "backfill_registration",
        },
        { transaction: t },
      );

      // Insert privacy consent
      await UserConsent.create(
        {
          user_id:           userId,
          policy_version_id: privacyVersion.id,
          granted:           true,
          ip_address:        null,
          user_agent:        null,
          source:            "backfill_registration",
        },
        { transaction: t },
      );

      // Update fast-access flags
      await User.update(
        {
          terms_current:    true,
          terms_version:    termsVersion.version,
          terms_accepted_at: now,
          privacy_current:    true,
          privacy_version:    privacyVersion.version,
          privacy_accepted_at: now,
        },
        { where: { id: userId }, transaction: t },
      );

      await t.commit();
      return "processed";
    } catch (err) {
      if ((t as any).finished !== "commit") {
        try { await t.rollback(); } catch { /* already finished */ }
      }
      throw err;
    }
  } catch (err) {
    warn(`user ${userId} failed: ${(err as Error).message}`);
    return "failed";
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("─".repeat(64));
  console.log("  Flowjuyu Consent Backfill");
  if (DRY_RUN)      console.log("  MODE: DRY RUN — zero DB writes");
  if (ROLE_FILTER)  console.log(`  ROLE FILTER: ${ROLE_FILTER}`);
  if (USER_ID)      console.log(`  SINGLE USER: ${USER_ID}`);
  console.log(`  BATCH SIZE: ${BATCH_SIZE}`);
  console.log("─".repeat(64));

  await sequelize.authenticate();
  log("✅ DB connection established");

  // Resolve active policy versions once — fail fast if seed hasn't run
  const [termsVersion, privacyVersion] = await Promise.all([
    PolicyVersion.findOne({ where: { policy_type: "terms",   is_active: true } }),
    PolicyVersion.findOne({ where: { policy_type: "privacy", is_active: true } }),
  ]);

  if (!termsVersion || !privacyVersion) {
    console.error(
      "❌ Active policy versions not found. Run the seed migration first:\n" +
      "   npx sequelize-cli db:migrate",
    );
    process.exit(1);
  }

  log(`Using terms   v${termsVersion.version}  (id=${termsVersion.id})`);
  log(`Using privacy v${privacyVersion.version} (id=${privacyVersion.id})`);

  // ── Build WHERE clause ─────────────────────────────────────────────────────

  const whereClause: Record<string, unknown> = {
    terms_current: false,
  };

  if (USER_ID) {
    whereClause.id = USER_ID;
  } else if (ROLE_FILTER) {
    whereClause.rol = ROLE_FILTER;
  }

  // ── Count ──────────────────────────────────────────────────────────────────

  stats.total = await User.count({ where: whereClause as any });
  log(`\nUsers to process: ${stats.total}`);

  if (stats.total === 0) {
    log("Nothing to do — all users are compliant.");
    await sequelize.close();
    return;
  }

  // ── Batch processing ───────────────────────────────────────────────────────

  let offset = 0;

  while (offset < stats.total) {
    const batch = await User.findAll({
      where:      whereClause as any,
      attributes: ["id"],
      limit:      BATCH_SIZE,
      offset,
      order:      [["id", "ASC"]],
    });

    if (batch.length === 0) break;

    log(`\nBatch ${Math.floor(offset / BATCH_SIZE) + 1}: processing users ${offset + 1}–${offset + batch.length}`);

    for (const { id } of batch) {
      const result = await processUser(id, termsVersion, privacyVersion);
      stats[result === "processed" ? "processed" : result === "skipped" ? "skipped" : "failed"]++;
    }

    offset += batch.length;
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  const elapsed = Math.round((Date.now() - stats.startedAt.getTime()) / 1000);

  console.log("\n" + "─".repeat(64));
  console.log("  Summary");
  console.log(`  Total users found : ${stats.total}`);
  console.log(`  Processed         : ${stats.processed}${DRY_RUN ? " (dry run)" : ""}`);
  console.log(`  Skipped (already) : ${stats.skipped}`);
  console.log(`  Failed            : ${stats.failed}`);
  console.log(`  Elapsed           : ${elapsed}s`);
  console.log("─".repeat(64));

  if (stats.failed > 0) {
    console.warn(`\n⚠  ${stats.failed} users failed — check logs above.`);
    process.exit(1);
  }

  if (!DRY_RUN) {
    console.log(`\n✅ Backfill complete. Processed ${stats.processed} users.`);
  } else {
    console.log("\nRe-run without --dry-run to apply changes.");
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error("\n❌ Backfill failed:", err);
  sequelize.close().finally(() => process.exit(1));
});
