/**
 * scripts/sync-migrations.ts
 *
 * PURPOSE
 * -------
 * Detects migrations whose changes are already present in the database
 * but whose names are missing from `SequelizeMeta` (the Sequelize migration
 * tracking table). Inserts those names so that `npx sequelize-cli db:migrate`
 * can continue without re-running them and crashing on duplicate columns/tables.
 *
 * WHEN TO USE
 * -----------
 * Run this BEFORE `npx sequelize-cli db:migrate` when you see errors like:
 *   ERROR: column "reset_password_token" of relation "users" already exists
 *
 * This happens when migrations were applied directly (SQL, Supabase UI, or
 * schema dumps) without being recorded in SequelizeMeta.
 *
 * USAGE
 * -----
 *   npx ts-node scripts/sync-migrations.ts
 *   npx ts-node scripts/sync-migrations.ts --dry-run   # show what would change, no writes
 *
 * SAFETY
 * ------
 * - Never drops or modifies any data columns.
 * - Only inserts rows into SequelizeMeta.
 * - Dry-run mode (--dry-run) makes zero DB writes.
 * - Each check is independent — a failure on one does not abort others.
 */

import "dotenv/config";
import { Sequelize, QueryTypes } from "sequelize";
import dns from "dns";
import path from "path";
import fs from "fs";

dns.setDefaultResultOrder("ipv4first");

// ── Config ───────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");
const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();

  const host = process.env.DB_HOST || "localhost";
  const port = process.env.DB_PORT || "5432";
  const name = process.env.DB_NAME || "flowjuyu";
  const user = process.env.DB_USER || "postgres";
  const pass = process.env.DB_PASSWORD || "postgres";
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${name}`;
}

const sequelize = new Sequelize(resolveDatabaseUrl(), {
  dialect: "postgres",
  logging: false,
  dialectOptions: { ssl: process.env.NODE_ENV === "production" ? { require: true, rejectUnauthorized: false } : undefined, family: 4 },
});

// ── Types ────────────────────────────────────────────────────────────────────

type ColumnMap = Record<string, { type: string; allowNull: boolean; defaultValue: unknown }>;

interface MigrationCheck {
  /** Migration filename (including .js) */
  migration: string;
  /** Human-readable description */
  description: string;
  /** Returns true if the migration's changes are already in the DB */
  alreadyApplied: (seq: Sequelize) => Promise<boolean>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function describeTable(seq: Sequelize, table: string): Promise<ColumnMap | null> {
  try {
    return await (seq.getQueryInterface() as any).describeTable(table) as ColumnMap;
  } catch {
    return null; // table does not exist
  }
}

async function tableExists(seq: Sequelize, table: string): Promise<boolean> {
  const tables = await seq.getQueryInterface().showAllTables() as string[];
  return tables.includes(table);
}

async function indexExists(seq: Sequelize, indexName: string): Promise<boolean> {
  const [rows] = await seq.query(
    `SELECT 1 FROM pg_indexes WHERE indexname = :name`,
    { replacements: { name: indexName }, type: QueryTypes.SELECT }
  );
  return rows != null;
}

// ── Migration checks ─────────────────────────────────────────────────────────
//
// Each entry maps one migration file to a predicate that returns true when the
// migration's changes are already in the database.
//
// Rules:
//  - Check the most specific signal (column / table / index) that the migration adds.
//  - Return true  → mark as applied (skip re-run).
//  - Return false → do NOT mark; let sequelize-cli run it normally.

const CHECKS: MigrationCheck[] = [
  // ── Users table additions ──────────────────────────────────────────────────
  {
    migration: "20260215235451-add-token-version-to-users.js",
    description: "users.token_version column",
    async alreadyApplied(seq) {
      const cols = await describeTable(seq, "users");
      return cols != null && "token_version" in cols;
    },
  },
  {
    migration: "20260216010801-add-reset-password-fields-to-users.js",
    description: "users.reset_password_token + reset_password_expires columns",
    async alreadyApplied(seq) {
      const cols = await describeTable(seq, "users");
      return cols != null && "reset_password_token" in cols && "reset_password_expires" in cols;
    },
  },

  // ── Product identification system ─────────────────────────────────────────
  {
    migration: "20260320120000-add-product-identification-system.js",
    description: "productos.internal_code + seller_sku columns",
    async alreadyApplied(seq) {
      const cols = await describeTable(seq, "productos");
      return cols != null && "internal_code" in cols && "seller_sku" in cols;
    },
  },

  // ── Social links on vendedor_perfiles ─────────────────────────────────────
  {
    migration: "20260323000000-add-social-links-vendedor-perfil.js",
    description: "vendedor_perfiles social link columns",
    async alreadyApplied(seq) {
      const cols = await describeTable(seq, "vendedor_perfiles");
      return cols != null && "whatsapp" in cols;
    },
  },

  // ── Header style on vendedor_perfiles ─────────────────────────────────────
  {
    migration: "20260323100000-add-header-style-vendedor-perfil.js",
    description: "vendedor_perfiles.header_style column",
    async alreadyApplied(seq) {
      const cols = await describeTable(seq, "vendedor_perfiles");
      return cols != null && "header_style" in cols;
    },
  },

  // ── AI content tables ─────────────────────────────────────────────────────
  {
    migration: "20260325000000-create-ai-content-tables.js",
    description: "ai_content_items + ai_content_variants tables",
    async alreadyApplied(seq) {
      return (
        (await tableExists(seq, "ai_content_items")) &&
        (await tableExists(seq, "ai_content_variants"))
      );
    },
  },
  {
    migration: "20260325000001-create-ai-content-performance-daily.js",
    description: "ai_content_performance_daily table",
    async alreadyApplied(seq) {
      return tableExists(seq, "ai_content_performance_daily");
    },
  },
  {
    migration: "20260325000002-create-ai-content-templates.js",
    description: "ai_content_templates table",
    async alreadyApplied(seq) {
      return tableExists(seq, "ai_content_templates");
    },
  },

  // ── Failure Intelligence Layer ─────────────────────────────────────────────
  {
    migration: "20260409000000-create-conversation-failure-events.js",
    description: "conversation_failure_events table",
    async alreadyApplied(seq) {
      return tableExists(seq, "conversation_failure_events");
    },
  },
  {
    migration: "20260409000001-create-platform-faq-entries.js",
    description: "platform_faq_entries table",
    async alreadyApplied(seq) {
      return tableExists(seq, "platform_faq_entries");
    },
  },
];

// ── SequelizeMeta helpers ────────────────────────────────────────────────────

async function ensureSequelizeMeta(seq: Sequelize): Promise<void> {
  await seq.query(`
    CREATE TABLE IF NOT EXISTS "SequelizeMeta" (
      name VARCHAR(255) NOT NULL PRIMARY KEY
    );
  `);
}

async function getAppliedMigrations(seq: Sequelize): Promise<Set<string>> {
  const rows = await seq.query<{ name: string }>(
    `SELECT name FROM "SequelizeMeta" ORDER BY name`,
    { type: QueryTypes.SELECT }
  );
  return new Set(rows.map((r) => r.name));
}

async function markApplied(seq: Sequelize, migration: string): Promise<void> {
  await seq.query(
    `INSERT INTO "SequelizeMeta" (name) VALUES (:name) ON CONFLICT (name) DO NOTHING`,
    { replacements: { name: migration } }
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("─".repeat(60));
  console.log("  Flowjuyu Migration Sync Utility");
  if (DRY_RUN) console.log("  MODE: DRY RUN — no writes will be made");
  console.log("─".repeat(60));

  await sequelize.authenticate();
  console.log("✅ DB connection established\n");

  await ensureSequelizeMeta(sequelize);
  const applied = await getAppliedMigrations(sequelize);

  // List migration files on disk
  const onDisk = new Set(
    fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".js"))
  );

  console.log(`📂 Migration files on disk:  ${onDisk.size}`);
  console.log(`📋 Recorded in SequelizeMeta: ${applied.size}\n`);

  let synced = 0;
  let skipped = 0;
  let alreadyTracked = 0;
  let notOnDisk = 0;

  for (const check of CHECKS) {
    const { migration, description } = check;

    // Skip if not on disk (nothing to register)
    if (!onDisk.has(migration)) {
      console.log(`⚪ ${migration}\n   File not found on disk — skipping`);
      notOnDisk++;
      continue;
    }

    // Already tracked — nothing to do
    if (applied.has(migration)) {
      console.log(`✓  ${migration}\n   Already in SequelizeMeta`);
      alreadyTracked++;
      continue;
    }

    // Check if changes are present in DB
    let inDb: boolean;
    try {
      inDb = await check.alreadyApplied(sequelize);
    } catch (err) {
      console.error(`❌ ${migration}\n   Check failed: ${(err as Error).message}`);
      skipped++;
      continue;
    }

    if (!inDb) {
      console.log(`⏳ ${migration}\n   Not yet applied — will be run by sequelize-cli normally`);
      skipped++;
      continue;
    }

    // Changes are in DB but not tracked — register it
    if (DRY_RUN) {
      console.log(`🔵 [DRY RUN] Would register: ${migration}\n   Detected: ${description}`);
    } else {
      await markApplied(sequelize, migration);
      console.log(`✅ Registered: ${migration}\n   Detected: ${description}`);
    }
    synced++;
  }

  console.log("\n" + "─".repeat(60));
  console.log(`  Summary`);
  console.log(`  Already tracked : ${alreadyTracked}`);
  console.log(`  Newly registered: ${synced}${DRY_RUN ? " (dry run — not written)" : ""}`);
  console.log(`  Will run normally: ${skipped}`);
  if (notOnDisk > 0) console.log(`  Not on disk     : ${notOnDisk}`);
  console.log("─".repeat(60));

  if (!DRY_RUN && synced > 0) {
    console.log("\n✅ Done. You can now run: npx sequelize-cli db:migrate");
  } else if (DRY_RUN) {
    console.log("\nRe-run without --dry-run to apply changes.");
  } else {
    console.log("\n✅ No sync needed. Run: npx sequelize-cli db:migrate");
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error("\n❌ Sync failed:", err);
  sequelize.close().finally(() => process.exit(1));
});
