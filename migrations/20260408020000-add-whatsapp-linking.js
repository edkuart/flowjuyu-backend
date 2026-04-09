"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("whatsapp_linking_tokens", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        allowNull: false,
        primaryKey: true,
      },
      seller_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      token_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      token_hint: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      used_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      used_by_phone_e164: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      invalidated_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("now()"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("now()"),
      },
    });

    await queryInterface.addIndex("whatsapp_linking_tokens", ["seller_user_id"], {
      name: "idx_whatsapp_linking_tokens_seller",
    });
    await queryInterface.addIndex("whatsapp_linking_tokens", ["token_hash"], {
      name: "uq_whatsapp_linking_tokens_hash",
      unique: true,
    });
    await queryInterface.addIndex("whatsapp_linking_tokens", ["expires_at"], {
      name: "idx_whatsapp_linking_tokens_expires_at",
    });

    await queryInterface.createTable("whatsapp_linked_identities", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        allowNull: false,
        primaryKey: true,
      },
      seller_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      channel: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "whatsapp",
      },
      phone_e164: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "active",
      },
      linked_via_token_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "whatsapp_linking_tokens",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      linked_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("now()"),
      },
      revoked_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      revoked_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("now()"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("now()"),
      },
    });

    await queryInterface.addIndex("whatsapp_linked_identities", ["seller_user_id"], {
      name: "idx_whatsapp_linked_identities_seller",
    });
    await queryInterface.addIndex("whatsapp_linked_identities", ["phone_e164"], {
      name: "idx_whatsapp_linked_identities_phone",
    });
    await queryInterface.addIndex("whatsapp_linked_identities", ["status"], {
      name: "idx_whatsapp_linked_identities_status",
    });

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX uq_whatsapp_linked_identities_active_seller
      ON whatsapp_linked_identities (seller_user_id)
      WHERE status = 'active'
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX uq_whatsapp_linked_identities_active_phone
      ON whatsapp_linked_identities (phone_e164)
      WHERE status = 'active'
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP INDEX IF EXISTS uq_whatsapp_linked_identities_active_phone"
    );
    await queryInterface.sequelize.query(
      "DROP INDEX IF EXISTS uq_whatsapp_linked_identities_active_seller"
    );
    await queryInterface.dropTable("whatsapp_linked_identities");
    await queryInterface.dropTable("whatsapp_linking_tokens");
  },
};
