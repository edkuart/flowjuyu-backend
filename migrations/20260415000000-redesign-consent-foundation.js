'use strict';

async function tableExists(queryInterface, tableName) {
  try {
    await queryInterface.describeTable(tableName);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    const hasPolicyVersions = await tableExists(queryInterface, "policy_versions");
    const hasUserConsents = await tableExists(queryInterface, "user_consents");

    if (hasUserConsents) {
      await queryInterface.sequelize.query(`DROP VIEW IF EXISTS current_consents`);
      await queryInterface.renameTable("user_consents", "user_consents_legacy");
    }

    if (hasPolicyVersions) {
      await queryInterface.renameTable("policy_versions", "policy_versions_legacy");
    }

    await queryInterface.createTable("policy_versions", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      policy_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      version_code: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      version_label: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      url: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      content_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      effective_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_material: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      requires_reacceptance: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      change_summary_short: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      change_summary_full: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    await queryInterface.addIndex("policy_versions", ["policy_type"], {
      name: "policy_versions_policy_type_idx",
    });
    await queryInterface.addIndex("policy_versions", ["policy_type", "version_code"], {
      name: "policy_versions_policy_type_version_code_key",
      unique: true,
    });
    await queryInterface.addIndex("policy_versions", ["policy_type", "is_active", "effective_at"], {
      name: "policy_versions_policy_type_active_effective_idx",
    });
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX policy_versions_one_active_per_type
      ON policy_versions (policy_type)
      WHERE is_active = true
    `);

    if (hasPolicyVersions) {
      await queryInterface.sequelize.query(`
        CREATE TEMP TABLE tmp_policy_version_map (
          legacy_id INTEGER PRIMARY KEY,
          new_id UUID NOT NULL
        ) ON COMMIT DROP
      `);

      await queryInterface.sequelize.query(`
        WITH inserted AS (
          INSERT INTO policy_versions (
            policy_type,
            version_code,
            version_label,
            url,
            content_hash,
            effective_at,
            is_active,
            is_material,
            requires_reacceptance,
            change_summary_short,
            change_summary_full,
            created_at,
            updated_at
          )
          SELECT
            policy_type,
            COALESCE(version, 'legacy'),
            COALESCE(label, CONCAT(policy_type, ' ', COALESCE(version, 'legacy'))),
            url,
            COALESCE(content_hash, repeat('0', 64)),
            COALESCE(effective_from, NOW()),
            COALESCE(is_active, false),
            true,
            false,
            'Migrated legacy version',
            NULL,
            COALESCE(created_at, NOW()),
            NOW()
          FROM policy_versions_legacy
          RETURNING id, policy_type, version_code
        )
        INSERT INTO tmp_policy_version_map (legacy_id, new_id)
        SELECT legacy.id, inserted.id
        FROM policy_versions_legacy legacy
        JOIN inserted
          ON inserted.policy_type = legacy.policy_type
         AND inserted.version_code = COALESCE(legacy.version, 'legacy')
      `);
    } else {
      const now = new Date();
      await queryInterface.bulkInsert("policy_versions", [
        {
          id: Sequelize.literal("gen_random_uuid()"),
          policy_type: "terms",
          version_code: "2026.04.15",
          version_label: "Términos y Condiciones 2026.04.15",
          url: "/legal/terms",
          content_hash: "0000000000000000000000000000000000000000000000000000000000000000",
          effective_at: now,
          is_active: true,
          is_material: true,
          requires_reacceptance: true,
          change_summary_short: "Versión inicial del sistema versionado.",
          change_summary_full: "Baseline legal version for terms.",
          created_at: now,
          updated_at: now,
        },
        {
          id: Sequelize.literal("gen_random_uuid()"),
          policy_type: "privacy",
          version_code: "2026.04.15",
          version_label: "Política de Privacidad 2026.04.15",
          url: "/legal/privacy",
          content_hash: "1111111111111111111111111111111111111111111111111111111111111111",
          effective_at: now,
          is_active: true,
          is_material: true,
          requires_reacceptance: true,
          change_summary_short: "Versión inicial del sistema versionado.",
          change_summary_full: "Baseline legal version for privacy.",
          created_at: now,
          updated_at: now,
        },
      ]);
    }

    await queryInterface.createTable("user_consents", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      policy_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      policy_version_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "policy_versions", key: "id" },
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      },
      accepted: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
      },
      accepted_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      surface: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      locale: {
        type: Sequelize.STRING(16),
        allowNull: true,
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      ip_hash: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      evidence_json: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    await queryInterface.addIndex("user_consents", ["user_id"], {
      name: "user_consents_user_id_idx",
    });
    await queryInterface.addIndex("user_consents", ["policy_type", "accepted_at"], {
      name: "user_consents_policy_type_accepted_at_idx",
    });
    await queryInterface.addIndex("user_consents", ["user_id", "policy_type", "accepted_at"], {
      name: "user_consents_user_policy_accepted_at_idx",
    });
    await queryInterface.addIndex("user_consents", ["policy_version_id"], {
      name: "user_consents_policy_version_id_idx",
    });
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX user_consents_user_version_accept_once_idx
      ON user_consents (user_id, policy_version_id)
      WHERE accepted = true
    `);

    if (hasUserConsents && hasPolicyVersions) {
      await queryInterface.sequelize.query(`
        INSERT INTO user_consents (
          id,
          user_id,
          policy_type,
          policy_version_id,
          accepted,
          accepted_at,
          surface,
          locale,
          user_agent,
          ip_hash,
          evidence_json,
          created_at
        )
        SELECT
          gen_random_uuid(),
          legacy.user_id,
          pv.policy_type,
          map.new_id,
          legacy.granted,
          COALESCE(legacy.created_at, NOW()),
          legacy.source,
          NULL,
          legacy.user_agent,
          CASE WHEN legacy.ip_address IS NOT NULL THEN md5(legacy.ip_address) ELSE NULL END,
          jsonb_build_object(
            'migrated', true,
            'legacy_id', legacy.id,
            'legacy_ip_address_present', legacy.ip_address IS NOT NULL
          ),
          COALESCE(legacy.created_at, NOW())
        FROM user_consents_legacy legacy
        JOIN policy_versions_legacy pv
          ON pv.id = legacy.policy_version_id
        JOIN tmp_policy_version_map map
          ON map.legacy_id = legacy.policy_version_id
      `);
    }

    await queryInterface.createTable("current_consents", {
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      accepted_terms_version_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "policy_versions", key: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },
      accepted_privacy_version_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "policy_versions", key: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },
      needs_reacceptance_terms: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      needs_reacceptance_privacy: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    await queryInterface.addIndex("current_consents", ["accepted_terms_version_id"], {
      name: "current_consents_terms_version_idx",
    });
    await queryInterface.addIndex("current_consents", ["accepted_privacy_version_id"], {
      name: "current_consents_privacy_version_idx",
    });
    await queryInterface.addIndex("current_consents", ["needs_reacceptance_terms"], {
      name: "current_consents_needs_terms_idx",
    });
    await queryInterface.addIndex("current_consents", ["needs_reacceptance_privacy"], {
      name: "current_consents_needs_privacy_idx",
    });

    await queryInterface.sequelize.query(`
      INSERT INTO current_consents (
        user_id,
        accepted_terms_version_id,
        accepted_privacy_version_id,
        needs_reacceptance_terms,
        needs_reacceptance_privacy,
        updated_at
      )
      WITH latest AS (
        SELECT DISTINCT ON (user_id, policy_type)
          user_id,
          policy_type,
          policy_version_id,
          accepted
        FROM user_consents
        WHERE policy_type IN ('terms', 'privacy')
        ORDER BY user_id, policy_type, accepted_at DESC, created_at DESC, id DESC
      ),
      active AS (
        SELECT
          MAX(CASE WHEN policy_type = 'terms' THEN id END) AS active_terms_id,
          MAX(CASE WHEN policy_type = 'privacy' THEN id END) AS active_privacy_id,
          MAX(CASE WHEN policy_type = 'terms' THEN requires_reacceptance END) AS terms_requires,
          MAX(CASE WHEN policy_type = 'privacy' THEN requires_reacceptance END) AS privacy_requires
        FROM policy_versions
        WHERE is_active = true
          AND policy_type IN ('terms', 'privacy')
      )
      SELECT
        latest.user_id,
        MAX(CASE WHEN latest.policy_type = 'terms' AND latest.accepted THEN latest.policy_version_id END),
        MAX(CASE WHEN latest.policy_type = 'privacy' AND latest.accepted THEN latest.policy_version_id END),
        COALESCE(
          MAX(
            CASE
              WHEN latest.policy_type = 'terms'
              THEN (
                NOT latest.accepted OR
                (active.terms_requires = true AND latest.policy_version_id IS DISTINCT FROM active.active_terms_id)
              )
            END
          ),
          active.terms_requires
        ),
        COALESCE(
          MAX(
            CASE
              WHEN latest.policy_type = 'privacy'
              THEN (
                NOT latest.accepted OR
                (active.privacy_requires = true AND latest.policy_version_id IS DISTINCT FROM active.active_privacy_id)
              )
            END
          ),
          active.privacy_requires
        ),
        NOW()
      FROM latest
      CROSS JOIN active
      GROUP BY latest.user_id, active.active_terms_id, active.active_privacy_id, active.terms_requires, active.privacy_requires
      ON CONFLICT (user_id) DO UPDATE SET
        accepted_terms_version_id = EXCLUDED.accepted_terms_version_id,
        accepted_privacy_version_id = EXCLUDED.accepted_privacy_version_id,
        needs_reacceptance_terms = EXCLUDED.needs_reacceptance_terms,
        needs_reacceptance_privacy = EXCLUDED.needs_reacceptance_privacy,
        updated_at = EXCLUDED.updated_at
    `);
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.dropTable("current_consents");
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS user_consents_user_version_accept_once_idx`,
    );
    await queryInterface.dropTable("user_consents");
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS policy_versions_one_active_per_type`,
    );
    await queryInterface.dropTable("policy_versions");

    if (await tableExists(queryInterface, "policy_versions_legacy")) {
      await queryInterface.renameTable("policy_versions_legacy", "policy_versions");
    }

    if (await tableExists(queryInterface, "user_consents_legacy")) {
      await queryInterface.renameTable("user_consents_legacy", "user_consents");
      await queryInterface.sequelize.query(`
        CREATE VIEW current_consents AS
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
        ORDER BY uc.user_id, pv.policy_type, uc.created_at DESC, uc.id DESC
      `);
    }
  },
};
