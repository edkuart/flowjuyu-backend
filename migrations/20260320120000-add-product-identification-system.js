"use strict";

/**
 * Migration: add-product-identification-system
 *
 * Adds two columns to `productos`:
 *   - internal_code  VARCHAR(30)  UNIQUE NOT NULL  — platform-generated reference
 *   - seller_sku     VARCHAR(100) NULL             — optional seller inventory code
 *
 * Execution order:
 *   1. Add both columns as NULLABLE (safe for live table with existing rows).
 *   2. Backfill internal_code for every existing product via PL/pgSQL:
 *        format  → FJ-{REG}-{CAT}-{YYMMDD}-{RAND6}
 *        REG     ← LEFT 3 of regiones.nombre matched by product's departamento  (fallback "INT")
 *        CAT     ← LEFT 3 of categorias.nombre matched by product's categoria_id (fallback "GEN")
 *        YYMMDD  ← product's created_at
 *        RAND6   ← first 6 uppercase chars of MD5(product_id || attempt)
 *                  The loop retries on the astronomically-rare collision.
 *   3. Set internal_code NOT NULL.
 *   4. Add UNIQUE index on internal_code.
 *   5. Add partial UNIQUE index on (vendedor_id, seller_sku) WHERE seller_sku IS NOT NULL.
 *
 * Rollback:
 *   Drops both columns and their indexes (idempotent).
 *
 * Idempotency:
 *   All steps are guarded — safe to re-run if a previous run was partial.
 */

module.exports = {
  // ─── UP ──────────────────────────────────────────────────────────────────────
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("productos");

    // ── Step 1: Add nullable columns ─────────────────────────────────────────
    if (!columns.internal_code) {
      await queryInterface.addColumn("productos", "internal_code", {
        type: Sequelize.STRING(30),
        allowNull: true,       // will become NOT NULL after backfill
        defaultValue: null,
      });
      console.log("[migration] added internal_code to productos");
    } else {
      console.log("[migration] internal_code already exists on productos — skipping addColumn");
    }

    if (!columns.seller_sku) {
      await queryInterface.addColumn("productos", "seller_sku", {
        type: Sequelize.STRING(100),
        allowNull: true,
        defaultValue: null,
      });
      console.log("[migration] added seller_sku to productos");
    } else {
      console.log("[migration] seller_sku already exists on productos — skipping addColumn");
    }

    // ── Step 2: Backfill existing products ────────────────────────────────────
    //
    // Pure PL/pgSQL — no application code dependencies.
    // Uses MD5(id::text || attempt) as entropy source.
    // Since UUIDs are unique, MD5(uuid || "0") gives effectively unique 6-char
    // hex suffixes. The retry loop handles the <1-in-16M collision case.
    //
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE
        rec         RECORD;
        cat_code    TEXT;
        reg_code    TEXT;
        date_str    TEXT;
        candidate   TEXT;
        attempt     INT;
        dupe_count  INT;
      BEGIN
        FOR rec IN
          SELECT
            p.id,
            p.created_at,
            p.departamento,
            p.categoria_id,
            p.categoria_custom,
            c.nombre  AS cat_nombre,
            r.nombre  AS reg_nombre
          FROM productos p
          LEFT JOIN categorias c
                 ON c.id = p.categoria_id
          LEFT JOIN regiones r
                 ON LOWER(TRIM(r.nombre)) = LOWER(TRIM(COALESCE(p.departamento, '')))
          WHERE p.internal_code IS NULL
          ORDER BY p.created_at ASC, p.id ASC
        LOOP

          /* ── Category prefix (CAT) ──────────────────────────────────────── */
          IF rec.cat_nombre IS NOT NULL AND rec.cat_nombre <> '' THEN
            cat_code := UPPER(
              LEFT(REGEXP_REPLACE(rec.cat_nombre, '[^A-Za-z0-9]', '', 'g'), 3)
            );
          ELSIF rec.categoria_custom IS NOT NULL AND rec.categoria_custom <> '' THEN
            cat_code := UPPER(
              LEFT(REGEXP_REPLACE(rec.categoria_custom, '[^A-Za-z0-9]', '', 'g'), 3)
            );
          ELSE
            cat_code := 'GEN';
          END IF;
          IF LENGTH(cat_code) < 3 THEN
            cat_code := RPAD(cat_code, 3, 'X');
          END IF;

          /* ── Region prefix (REG) ────────────────────────────────────────── */
          IF rec.reg_nombre IS NOT NULL AND rec.reg_nombre <> '' THEN
            reg_code := UPPER(
              LEFT(REGEXP_REPLACE(rec.reg_nombre, '[^A-Za-z0-9]', '', 'g'), 3)
            );
          ELSIF rec.departamento IS NOT NULL AND rec.departamento <> '' THEN
            reg_code := UPPER(
              LEFT(REGEXP_REPLACE(rec.departamento, '[^A-Za-z0-9]', '', 'g'), 3)
            );
          ELSE
            reg_code := 'INT';
          END IF;
          IF LENGTH(reg_code) < 3 THEN
            reg_code := RPAD(reg_code, 3, 'X');
          END IF;

          date_str := TO_CHAR(rec.created_at AT TIME ZONE 'UTC', 'YYMMDD');

          /* ── Collision-safe code assignment ────────────────────────────── */
          attempt := 0;
          LOOP
            candidate :=
              'FJ-' || reg_code || '-' || cat_code || '-' || date_str || '-' ||
              UPPER(LEFT(MD5(rec.id::TEXT || attempt::TEXT), 6));

            SELECT COUNT(*) INTO dupe_count
            FROM productos
            WHERE internal_code = candidate;

            IF dupe_count = 0 THEN
              UPDATE productos SET internal_code = candidate WHERE id = rec.id;
              EXIT;
            END IF;

            attempt := attempt + 1;
            IF attempt >= 50 THEN
              RAISE EXCEPTION
                'backfill: could not generate unique code for product % after 50 attempts',
                rec.id;
            END IF;
          END LOOP;

        END LOOP;
      END $$;
    `);

    // ── Step 3: Enforce NOT NULL now that every row has a code ───────────────
    // Re-describe to check current nullability; skip if already NOT NULL.
    const columnsNow = await queryInterface.describeTable("productos");
    if (columnsNow.internal_code && columnsNow.internal_code.allowNull !== false) {
      await queryInterface.changeColumn("productos", "internal_code", {
        type: Sequelize.STRING(30),
        allowNull: false,
      });
      console.log("[migration] set internal_code NOT NULL");
    }

    // ── Step 4: Unique index — internal_code ──────────────────────────────────
    const [indexes] = await queryInterface.sequelize.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'productos' AND indexname = 'idx_productos_internal_code';
    `);
    if (indexes.length === 0) {
      await queryInterface.addIndex("productos", ["internal_code"], {
        unique: true,
        name: "idx_productos_internal_code",
      });
      console.log("[migration] created idx_productos_internal_code");
    } else {
      console.log("[migration] idx_productos_internal_code already exists — skipping");
    }

    // ── Step 5: Partial unique index — (vendedor_id, seller_sku) ─────────────
    // Sequelize's addIndex does not support WHERE clauses; use raw SQL.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_vendedor_seller_sku
        ON productos (vendedor_id, seller_sku)
        WHERE seller_sku IS NOT NULL;
    `);
    console.log("[migration] ensured idx_productos_vendedor_seller_sku");
  },

  // ─── DOWN ─────────────────────────────────────────────────────────────────
  async down(queryInterface, _Sequelize) {
    // Drop indexes before columns (PG requires this for named indexes)
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS idx_productos_vendedor_seller_sku;`
    );

    await queryInterface.removeIndex(
      "productos",
      "idx_productos_internal_code"
    ).catch(() => {
      // Index may not exist if migration was partially applied
    });

    await queryInterface.removeColumn("productos", "internal_code");
    await queryInterface.removeColumn("productos", "seller_sku");
  },
};
