"use strict";

/**
 * Corrective migration — ai_content_variants schema drift
 *
 * Problem: the ai_content_variants table pre-existed migration 000000, so its
 * idempotency guard skipped table creation. The real DB therefore has:
 *
 *   1. A legacy `text TEXT NOT NULL` column (old schema name for generated content)
 *   2. No `content_body TEXT` column (the current code's name for the same field)
 *   3. `template_id UUID` that was receiving slug strings from the application,
 *      causing invalid UUID cast errors on every insert
 *
 * Fixes applied here:
 *   1. ADD COLUMN IF NOT EXISTS content_body TEXT
 *   2. Backfill content_body from text where null
 *   3. DROP NOT NULL from the legacy text column (keep it; don't delete history)
 *   4. Make template_id nullable (UUID | null) — null is stored when the
 *      ai_content_templates table is empty at generation time
 *   5. If template_id is currently VARCHAR (not UUID), zero out any non-UUID
 *      slug values and cast the column type to UUID
 */

module.exports = {
  async up(queryInterface) {
    // ── 1. Add content_body column if missing ─────────────────────────────
    await queryInterface.sequelize.query(
      `ALTER TABLE ai_content_variants ADD COLUMN IF NOT EXISTS content_body TEXT`
    );

    // ── 2. Backfill content_body from legacy text column ──────────────────
    // Wrapped in DO block so it silently skips if "text" column doesn't exist
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ai_content_variants' AND column_name = 'text'
        ) THEN
          UPDATE ai_content_variants
          SET content_body = "text"
          WHERE content_body IS NULL AND "text" IS NOT NULL;
        END IF;
      END $$
    `);

    // ── 3. Drop NOT NULL from legacy text column ──────────────────────────
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ai_content_variants' AND column_name = 'text'
            AND is_nullable = 'NO'
        ) THEN
          ALTER TABLE ai_content_variants ALTER COLUMN "text" DROP NOT NULL;
        END IF;
      END $$
    `);

    // ── 4 & 5. Fix template_id: nullable UUID ─────────────────────────────
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE col_type text;
      BEGIN
        SELECT data_type INTO col_type
        FROM information_schema.columns
        WHERE table_name = 'ai_content_variants' AND column_name = 'template_id';

        IF col_type IS NOT NULL AND col_type != 'uuid' THEN
          -- Zero out any non-UUID slug values before type cast
          UPDATE ai_content_variants
          SET template_id = NULL
          WHERE template_id IS NOT NULL
            AND template_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

          ALTER TABLE ai_content_variants
            ALTER COLUMN template_id TYPE UUID USING template_id::uuid;
        END IF;

        -- Make nullable regardless of original type
        ALTER TABLE ai_content_variants ALTER COLUMN template_id DROP NOT NULL;
      END $$
    `);
  },

  async down(queryInterface) {
    // Partial reversal — for dev use only; data loss possible
    await queryInterface.sequelize.query(`
      ALTER TABLE ai_content_variants ALTER COLUMN template_id SET NOT NULL
    `).catch(() => {});
  },
};
