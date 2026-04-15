'use strict';

/**
 * Creates the policy_versions table — the canonical registry of every legal
 * document version the platform has ever published.
 *
 * Production-safety goals:
 *   - Idempotent on PostgreSQL.
 *   - Safe when a previous run created the table and/or some indexes.
 *   - No destructive resets when production is partially migrated.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS policy_versions (
          id SERIAL PRIMARY KEY,
          policy_type VARCHAR(50) NOT NULL,
          version VARCHAR(20) NOT NULL,
          label VARCHAR(200) NOT NULL,
          url VARCHAR(500) NOT NULL,
          content_hash VARCHAR(64) NULL,
          effective_from TIMESTAMPTZ NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = current_schema()
              AND indexname = 'policy_versions_policy_type_idx'
          ) THEN
            CREATE INDEX policy_versions_policy_type_idx
            ON policy_versions (policy_type);
          END IF;
        END
        $$;
        `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = current_schema()
              AND indexname = 'policy_versions_policy_type_version_key'
          ) THEN
            CREATE UNIQUE INDEX policy_versions_policy_type_version_key
            ON policy_versions (policy_type, version);
          END IF;
        END
        $$;
        `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = current_schema()
              AND indexname = 'policy_versions_one_active_per_type'
          ) THEN
            CREATE UNIQUE INDEX policy_versions_one_active_per_type
            ON policy_versions (policy_type)
            WHERE is_active = true;
          END IF;
        END
        $$;
        `,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS policy_versions_one_active_per_type`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS policy_versions_policy_type_version_key`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS policy_versions_policy_type_idx`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS policy_versions`,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
