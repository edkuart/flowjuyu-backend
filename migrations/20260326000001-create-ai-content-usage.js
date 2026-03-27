"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    if ((await queryInterface.showAllTables()).includes("ai_content_usage")) return;

    await queryInterface.createTable("ai_content_usage", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      variant_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "ai_content_variants", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      platform: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: "e.g. instagram, facebook, whatsapp, web, email",
      },
      used_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      views: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      clicks: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      conversions: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    });

    await queryInterface.addIndex("ai_content_usage", ["variant_id"], {
      name: "idx_content_usage_variant_id",
    });
    await queryInterface.addIndex("ai_content_usage", ["platform"], {
      name: "idx_content_usage_platform",
    });
    await queryInterface.addIndex("ai_content_usage", ["used_at"], {
      name: "idx_content_usage_used_at",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ai_content_usage");
  },
};
