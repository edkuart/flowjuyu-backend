"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("audit_events", {
      id: {
        type:          Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey:    true,
        allowNull:     false,
      },
      actor_user_id: {
        type:      Sequelize.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete:  "SET NULL",
        onUpdate:  "CASCADE",
      },
      actor_role: {
        type:      Sequelize.STRING(50),
        allowNull: false,
      },
      action: {
        type:      Sequelize.STRING(100),
        allowNull: false,
      },
      entity_type: {
        type:      Sequelize.STRING(50),
        allowNull: true,
      },
      entity_id: {
        type:      Sequelize.STRING(100),
        allowNull: true,
      },
      target_user_id: {
        type:      Sequelize.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete:  "SET NULL",
        onUpdate:  "CASCADE",
      },
      ip_address: {
        type:         Sequelize.STRING(45),
        allowNull:    false,
        defaultValue: "unknown",
      },
      user_agent: {
        type:         Sequelize.TEXT,
        allowNull:    false,
        defaultValue: "",
      },
      http_method: {
        type:         Sequelize.STRING(10),
        allowNull:    false,
        defaultValue: "",
      },
      route: {
        type:         Sequelize.STRING(255),
        allowNull:    false,
        defaultValue: "",
      },
      status: {
        type:      Sequelize.STRING(20),
        allowNull: false,
      },
      severity: {
        type:      Sequelize.STRING(20),
        allowNull: false,
      },
      metadata: {
        type:      Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type:         Sequelize.DATE,
        allowNull:    false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    // Indexes for the most common filter combinations in getAuditEvents
    await queryInterface.addIndex("audit_events", ["actor_user_id"],  { name: "idx_audit_actor_user_id" });
    await queryInterface.addIndex("audit_events", ["action"],         { name: "idx_audit_action" });
    await queryInterface.addIndex("audit_events", ["status"],         { name: "idx_audit_status" });
    await queryInterface.addIndex("audit_events", ["severity"],       { name: "idx_audit_severity" });
    await queryInterface.addIndex("audit_events", ["created_at"],     { name: "idx_audit_created_at" });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("audit_events");
  },
};
