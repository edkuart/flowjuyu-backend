'use strict';

/**
 * Creates the user_consents table — the immutable audit log of every consent
 * action a user has ever taken (accept or revoke).
 *
 * Design notes:
 *   - Append-only: rows are NEVER updated or deleted. New row = new action.
 *   - granted=true  → user accepted the policy version.
 *   - granted=false → user revoked/withdrew consent.
 *   - The current consent state per user × policy_type is derived by the
 *     current_consents VIEW created below (DISTINCT ON most-recent row).
 *   - source identifies which product surface triggered the consent event so
 *     that audit trails can distinguish registration vs. settings vs. import.
 *   - ip_address and user_agent are stored for legal evidence purposes.
 *
 * Performance:
 *   - idx on (user_id) for fetching all consents of a user
 *   - idx on (user_id, created_at DESC) for the VIEW and point lookups
 *   - idx on (policy_version_id) for counting acceptances per version
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_consents', {
      id: {
        type:          Sequelize.BIGINT,
        primaryKey:    true,
        autoIncrement: true,
        allowNull:     false,
      },
      user_id: {
        type:       Sequelize.INTEGER,
        allowNull:  false,
        references: { model: 'users', key: 'id' },
        onDelete:   'CASCADE',
        onUpdate:   'CASCADE',
      },
      policy_version_id: {
        type:       Sequelize.INTEGER,
        allowNull:  false,
        references: { model: 'policy_versions', key: 'id' },
        onDelete:   'RESTRICT',
        onUpdate:   'CASCADE',
      },
      granted: {
        type:      Sequelize.BOOLEAN,
        allowNull: false,
        comment:   'true = accepted, false = revoked',
      },
      ip_address: {
        type:      Sequelize.STRING(45),
        allowNull: true,
        comment:   'IPv4 or IPv6 address at time of consent',
      },
      user_agent: {
        type:      Sequelize.TEXT,
        allowNull: true,
      },
      source: {
        type:      Sequelize.STRING(50),
        allowNull: true,
        comment:   'registration_buyer | registration_seller | settings_page | import | admin',
      },
      created_at: {
        type:         Sequelize.DATE,
        allowNull:    false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // Indexes
    await queryInterface.addIndex('user_consents', ['user_id'], {
      name: 'user_consents_user_id_idx',
    });

    await queryInterface.addIndex('user_consents', ['policy_version_id'], {
      name: 'user_consents_policy_version_id_idx',
    });

    // Composite index used by the VIEW and current-state lookups
    await queryInterface.addIndex('user_consents', ['user_id', 'created_at'], {
      name: 'user_consents_user_id_created_at_idx',
    });

    // ── current_consents VIEW ─────────────────────────────────────────────────
    //
    // Returns the most-recent consent record per (user_id, policy_type).
    // Callers check the `granted` column to know the current acceptance state.
    //
    // Example query:
    //   SELECT * FROM current_consents
    //   WHERE user_id = 42 AND policy_type = 'terms';
    //
    await queryInterface.sequelize.query(`
      CREATE VIEW current_consents AS
      SELECT DISTINCT ON (uc.user_id, pv.policy_type)
        uc.id,
        uc.user_id,
        pv.policy_type,
        pv.version,
        pv.id           AS policy_version_id,
        uc.granted,
        uc.source,
        uc.ip_address,
        uc.created_at
      FROM user_consents uc
      JOIN policy_versions pv ON pv.id = uc.policy_version_id
      ORDER BY uc.user_id, pv.policy_type, uc.created_at DESC
    `);
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS current_consents');
    await queryInterface.dropTable('user_consents');
  },
};
