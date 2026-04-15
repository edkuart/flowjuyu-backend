'use strict';

/**
 * Creates the user_consents table — the immutable audit log of every consent
 * action a user has ever taken (accept or revoke).
 *
 * Production-safety goals:
 *   - Idempotent on PostgreSQL.
 *   - Safe when a previous run created the table, indexes, or view.
 *   - No destructive resets when production is partially migrated.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS user_consents (
          id BIGSERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
          policy_version_id INTEGER NOT NULL REFERENCES policy_versions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
          granted BOOLEAN NOT NULL,
          ip_address VARCHAR(45) NULL,
          user_agent TEXT NULL,
          source VARCHAR(50) NULL,
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
              AND indexname = 'user_consents_user_id_idx'
          ) THEN
            CREATE INDEX user_consents_user_id_idx
            ON user_consents (user_id);
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
              AND indexname = 'user_consents_policy_version_id_idx'
          ) THEN
            CREATE INDEX user_consents_policy_version_id_idx
            ON user_consents (policy_version_id);
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
              AND indexname = 'user_consents_user_id_created_at_idx'
          ) THEN
            CREATE INDEX user_consents_user_id_created_at_idx
            ON user_consents (user_id, created_at);
          END IF;
        END
        $$;
        `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        CREATE OR REPLACE VIEW current_consents AS
        SELECT DISTINCT ON (uc.user_id, pv.policy_type)
          uc.id,
          uc.user_id,
          pv.policy_type,
          pv.version,
          pv.id AS policy_version_id,
          uc.granted,
          uc.source,
          uc.ip_address,
          uc.created_at
        FROM user_consents uc
        JOIN policy_versions pv ON pv.id = uc.policy_version_id
        ORDER BY uc.user_id, pv.policy_type, uc.created_at DESC
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
        `DROP VIEW IF EXISTS current_consents`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS user_consents_user_id_created_at_idx`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS user_consents_policy_version_id_idx`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS user_consents_user_id_idx`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS user_consents`,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
