/**
 * scripts/backfill-product-codes.ts
 *
 * Standalone backfill script for the product identification system.
 *
 * PURPOSE
 * -------
 * Assigns an `internal_code` to every product in `productos` that does not
 * already have one. Safe to run multiple times (idempotent) — products that
 * already have a code are skipped.
 *
 * WHEN TO USE
 * -----------
 * Run this AFTER the migration `20260320120000-add-product-identification-system`
 * has been applied. The migration already includes a PL/pgSQL backfill block,
 * so this script is the application-layer safety net — useful if:
 *   • The PL/pgSQL block failed partially and you need to resume.
 *   • You want to run the backfill in the same transaction guarantees as the
 *     application service (using the exact same generateProductCode() logic).
 *   • You prefer verbose progress logging in a maintenance window.
 *
 * USAGE
 * -----
 *   # From the backend root:
 *   npx ts-node --project tsconfig.json scripts/backfill-product-codes.ts
 *
 *   # Dry run (prints codes but makes no DB changes):
 *   DRY_RUN=true npx ts-node --project tsconfig.json scripts/backfill-product-codes.ts
 *
 * SAFETY GUARANTEES
 * -----------------
 *   • Each product is updated in its own statement — one failure does not
 *     affect others.
 *   • If internal_code generation fails for a product after all retries,
 *     the script logs the error and continues to the next product.
 *   • The DB UNIQUE constraint is always the authoritative guard.
 *   • Progress is printed every PROGRESS_INTERVAL products.
 */

// Load environment variables before any other import
import "dotenv/config";

import { QueryTypes } from "sequelize";
import { sequelize } from "../src/config/db";
import { generateProductCode } from "../src/services/productCode.service";

// ─── Config ───────────────────────────────────────────────────────────────────
const DRY_RUN = process.env.DRY_RUN === "true";
const PROGRESS_INTERVAL = 50;

// ─── Types ────────────────────────────────────────────────────────────────────
interface ProductRow {
  id: string;
  created_at: Date;
  departamento: string | null;
  categoria_id: number | null;
  categoria_custom: string | null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Flowjuyu — Product Code Backfill");
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Verify database connectivity
  await sequelize.authenticate();
  console.log("✔  Database connected\n");

  // Load all products without a code
  const products = await sequelize.query<ProductRow>(
    `SELECT
       id,
       created_at,
       departamento,
       categoria_id,
       categoria_custom
     FROM productos
     WHERE internal_code IS NULL
     ORDER BY created_at ASC, id ASC`,
    { type: QueryTypes.SELECT }
  );

  const total = products.length;

  if (total === 0) {
    console.log("✔  All products already have an internal_code. Nothing to do.");
    await sequelize.close();
    return;
  }

  console.log(`Found ${total} product(s) without internal_code.\n`);

  let succeeded = 0;
  let failed = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];

    try {
      const code = await generateProductCode({
        departamento: p.departamento,
        categoriaId: p.categoria_id,
        categoriaCustom: p.categoria_custom,
        createdAt: new Date(p.created_at),
      });

      if (!DRY_RUN) {
        // Use UPDATE ... WHERE internal_code IS NULL to prevent accidentally
        // overwriting a code that was assigned by a concurrent process.
        const [, affectedRows] = await sequelize.query(
          `UPDATE productos
              SET internal_code = :code,
                  updated_at    = NOW()
            WHERE id            = :id
              AND internal_code IS NULL`,
          {
            replacements: { code, id: p.id },
            type: QueryTypes.UPDATE,
          }
        );

        if ((affectedRows as number) === 0) {
          // Another process already assigned a code — skip silently.
          console.log(`  ⚡ [${i + 1}/${total}] ${p.id} — already assigned (race condition, safe)`);
          continue;
        }
      }

      succeeded++;

      if (DRY_RUN || (i + 1) % PROGRESS_INTERVAL === 0 || i + 1 === total) {
        console.log(`  ✔  [${i + 1}/${total}] ${p.id} → ${code}${DRY_RUN ? " (dry)" : ""}`);
      }
    } catch (err: any) {
      failed++;
      const msg = err?.message ?? String(err);
      failures.push({ id: p.id, error: msg });
      console.error(`  ✖  [${i + 1}/${total}] ${p.id} — FAILED: ${msg}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Succeeded : ${succeeded}`);
  console.log(`  Failed    : ${failed}`);
  if (DRY_RUN) console.log("  (Dry run — no changes written to database)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  if (failures.length > 0) {
    console.error("Failed product IDs:");
    failures.forEach((f) => console.error(`  ${f.id}: ${f.error}`));
    process.exitCode = 1;
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exitCode = 1;
});
