"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes("conversation_sessions")) {
      await queryInterface.createTable("conversation_sessions", {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal("gen_random_uuid()"),
          primaryKey: true,
        },
        phone_e164: {
          type: Sequelize.STRING(20),
          allowNull: false,
        },
        channel: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: "whatsapp",
        },
        linked_seller_user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "users", key: "id" },
          onDelete: "SET NULL",
          onUpdate: "CASCADE",
        },
        current_step: {
          type: Sequelize.STRING(50),
          allowNull: false,
          defaultValue: "awaiting_image",
        },
        status: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: "active",
        },
        last_activity_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("NOW()"),
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

      await queryInterface.addIndex(
        "conversation_sessions",
        ["channel", "phone_e164"],
        { unique: true, name: "uq_conversation_sessions_channel_phone" }
      );
      await queryInterface.addIndex("conversation_sessions", ["status"], {
        name: "idx_conversation_sessions_status",
      });
      await queryInterface.addIndex(
        "conversation_sessions",
        ["linked_seller_user_id"],
        { name: "idx_conversation_sessions_seller" }
      );
    }

    if (!tables.includes("conversation_messages")) {
      await queryInterface.createTable("conversation_messages", {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal("gen_random_uuid()"),
          primaryKey: true,
        },
        session_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "conversation_sessions", key: "id" },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
        channel: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: "whatsapp",
        },
        direction: {
          type: Sequelize.STRING(20),
          allowNull: false,
        },
        message_type: {
          type: Sequelize.STRING(20),
          allowNull: false,
        },
        content_text: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        media_id: {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
        mime_type: {
          type: Sequelize.STRING(100),
          allowNull: true,
        },
        wa_message_id: {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
        status: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: "received",
        },
        raw_payload: {
          type: Sequelize.JSONB,
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

      await queryInterface.addIndex("conversation_messages", ["session_id"], {
        name: "idx_conversation_messages_session",
      });
      await queryInterface.addIndex(
        "conversation_messages",
        ["channel", "wa_message_id"],
        { unique: true, name: "uq_conversation_messages_channel_wa" }
      );
      await queryInterface.addIndex(
        "conversation_messages",
        ["direction", "status"],
        { name: "idx_conversation_messages_direction_status" }
      );
    }

    if (!tables.includes("listing_drafts")) {
      await queryInterface.createTable("listing_drafts", {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal("gen_random_uuid()"),
          primaryKey: true,
        },
        session_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "conversation_sessions", key: "id" },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
        seller_user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "users", key: "id" },
          onDelete: "SET NULL",
          onUpdate: "CASCADE",
        },
        images_json: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: Sequelize.literal("'[]'::jsonb"),
        },
        suggested_title: {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
        suggested_description: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        price: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true,
        },
        stock: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        measures_text: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        clase_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        categoria_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        categoria_custom: {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
        status: {
          type: Sequelize.STRING(30),
          allowNull: false,
          defaultValue: "collecting",
        },
        published_product_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "productos", key: "id" },
          onDelete: "SET NULL",
          onUpdate: "CASCADE",
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

      await queryInterface.addIndex("listing_drafts", ["session_id"], {
        unique: true,
        name: "uq_listing_drafts_session",
      });
      await queryInterface.addIndex("listing_drafts", ["status"], {
        name: "idx_listing_drafts_status",
      });
      await queryInterface.addIndex("listing_drafts", ["seller_user_id"], {
        name: "idx_listing_drafts_seller",
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("listing_drafts");
    await queryInterface.dropTable("conversation_messages");
    await queryInterface.dropTable("conversation_sessions");
  },
};
