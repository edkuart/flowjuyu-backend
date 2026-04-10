"use strict";

/**
 * Migration: create platform_faq_entries
 *
 * Stores controlled FAQ entries that the WhatsApp bot uses to answer
 * platform-policy questions without calling AI.
 *
 * Trigger matching is normalized (accent-insensitive, lowercase)
 * and uses substring includes() semantics — the first matching entry wins.
 *
 * category values: "comisiones", "envios", "pagos", "cuenta", "productos", "general"
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes("platform_faq_entries")) {
      console.log("platform_faq_entries already exists — skipping");
      return;
    }

    await queryInterface.createTable("platform_faq_entries", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      key: {
        type: Sequelize.TEXT,
        allowNull: false,
        unique: true,
      },
      triggers: {
        type: Sequelize.ARRAY(Sequelize.TEXT),
        allowNull: false,
        defaultValue: [],
      },
      answer: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      category: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
      "platform_faq_entries",
      ["key"],
      { unique: true, name: "uq_platform_faq_key" }
    );
    await queryInterface.addIndex(
      "platform_faq_entries",
      ["is_active"],
      { name: "idx_platform_faq_active" }
    );
    await queryInterface.addIndex(
      "platform_faq_entries",
      ["category"],
      { name: "idx_platform_faq_category" }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("platform_faq_entries");
  },
};
