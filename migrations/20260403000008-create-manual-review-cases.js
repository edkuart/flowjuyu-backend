"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("manual_review_cases", {
      id: {
        type:          Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey:    true,
        allowNull:     false,
      },
      case_type: {
        type:      Sequelize.STRING(100),
        allowNull: false,
      },
      subject_type: {
        type:      Sequelize.STRING(20),
        allowNull: false,
      },
      subject_key: {
        type:      Sequelize.STRING(255),
        allowNull: false,
      },
      related_order_id: {
        type:       Sequelize.INTEGER,
        allowNull:  true,
        references: { model: "orders", key: "id" },
        onDelete:   "SET NULL",
        onUpdate:   "CASCADE",
      },
      related_payment_attempt_id: {
        type:       Sequelize.INTEGER,
        allowNull:  true,
        references: { model: "payment_attempts", key: "id" },
        onDelete:   "SET NULL",
        onUpdate:   "CASCADE",
      },
      priority: {
        type:         Sequelize.STRING(20),
        allowNull:    false,
        defaultValue: "medium",
      },
      status: {
        type:         Sequelize.STRING(20),
        allowNull:    false,
        defaultValue: "open",
      },
      reason: {
        type:      Sequelize.TEXT,
        allowNull: false,
      },
      metadata: {
        type:      Sequelize.JSONB,
        allowNull: true,
      },
      assigned_to: {
        type:      Sequelize.INTEGER,
        allowNull: true,
      },
      created_at: {
        type:         Sequelize.DATE,
        allowNull:    false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      resolved_at: {
        type:      Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addIndex("manual_review_cases", ["subject_type", "subject_key"], { name: "idx_mrc_subject" });
    await queryInterface.addIndex("manual_review_cases", ["status"],                       { name: "idx_mrc_status" });
    await queryInterface.addIndex("manual_review_cases", ["priority"],                     { name: "idx_mrc_priority" });
    await queryInterface.addIndex("manual_review_cases", ["case_type"],                    { name: "idx_mrc_case_type" });
    await queryInterface.addIndex("manual_review_cases", ["related_order_id"],             { name: "idx_mrc_order_id" });
    await queryInterface.addIndex("manual_review_cases", ["created_at"],                   { name: "idx_mrc_created_at" });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("manual_review_cases");
  },
};
