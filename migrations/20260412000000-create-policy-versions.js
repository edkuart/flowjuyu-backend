'use strict';

/**
 * Creates the policy_versions table — the canonical registry of every legal
 * document version the platform has ever published.
 *
 * Design notes:
 *   - Append-only: rows are never updated or deleted.
 *   - UNIQUE(policy_type, version) prevents duplicate version strings per type.
 *   - The partial unique index enforces at most one active version per type
 *     (Postgres only — compatible with the project's Supabase/Postgres stack).
 *   - content_hash (SHA-256) is populated by the ops script that publishes a
 *     new version; NULL during the seed phase is intentional and expected.
 *
 * policy_type values:
 *   'terms'          — Términos y Condiciones de Uso
 *   'privacy'        — Política de Privacidad
 *   'communications' — Comunicaciones de Marketing
 *   'kyc_data'       — Tratamiento de Datos KYC (vendedores)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('policy_versions', {
      id: {
        type:          Sequelize.INTEGER,
        primaryKey:    true,
        autoIncrement: true,
        allowNull:     false,
      },
      policy_type: {
        type:      Sequelize.STRING(50),
        allowNull: false,
        comment:   'terms | privacy | communications | kyc_data',
      },
      version: {
        type:      Sequelize.STRING(20),
        allowNull: false,
        comment:   'Human-readable version string, e.g. v1, v2',
      },
      label: {
        type:      Sequelize.STRING(200),
        allowNull: false,
        comment:   'Short human-readable title shown in consent dialogs',
      },
      url: {
        type:      Sequelize.STRING(500),
        allowNull: false,
        comment:   'Canonical public URL for the document',
      },
      content_hash: {
        type:      Sequelize.STRING(64),
        allowNull: true,
        comment:   'SHA-256 hex digest of the published document — set by ops',
      },
      effective_from: {
        type:      Sequelize.DATE,
        allowNull: false,
        comment:   'Timestamp from which this version is (or becomes) binding',
      },
      is_active: {
        type:         Sequelize.BOOLEAN,
        allowNull:    false,
        defaultValue: false,
        comment:      'True for the currently active version of each type',
      },
      created_at: {
        type:         Sequelize.DATE,
        allowNull:    false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // Standard lookup indexes
    await queryInterface.addIndex('policy_versions', ['policy_type'], {
      name: 'policy_versions_policy_type_idx',
    });

    await queryInterface.addIndex('policy_versions', ['policy_type', 'version'], {
      name:   'policy_versions_policy_type_version_key',
      unique: true,
    });

    // Partial unique index: at most one active version per policy_type.
    // queryInterface.addIndex does not support WHERE clauses — raw SQL required.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX policy_versions_one_active_per_type
      ON policy_versions (policy_type)
      WHERE is_active = true
    `);
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS policy_versions_one_active_per_type'
    );
    await queryInterface.dropTable('policy_versions');
  },
};
