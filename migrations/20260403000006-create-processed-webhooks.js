"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("processed_webhooks", {
      id: {
        type:          Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey:    true,
        allowNull:     false,
      },
      provider: {
        type:      Sequelize.STRING(50),
        allowNull: false,
      },
      webhook_event_id: {
        type:      Sequelize.STRING(255),
        allowNull: false,
      },
      event_type: {
        type:      Sequelize.STRING(100),
        allowNull: false,
      },
      payload_hash: {
        type:      Sequelize.STRING(64),
        allowNull: false,
      },
      status: {
        type:      Sequelize.STRING(20),
        allowNull: false,
      },
      processed_at: {
        type:      Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type:         Sequelize.DATE,
        allowNull:    false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    // Primary deduplication index — must be unique
    await queryInterface.addIndex(
      "processed_webhooks",
      ["provider", "webhook_event_id"],
      { unique: true, name: "idx_pwh_provider_event_id" },
    );
    await queryInterface.addIndex("processed_webhooks", ["event_type"], { name: "idx_pwh_event_type" });
    await queryInterface.addIndex("processed_webhooks", ["status"],     { name: "idx_pwh_status" });
    await queryInterface.addIndex("processed_webhooks", ["created_at"], { name: "idx_pwh_created_at" });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("processed_webhooks");
  },
};
