"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("video_credit_transactions", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      package_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      gtq_cents: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      amount_usd_cents: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      stripe_checkout_session_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
        unique: true,
      },
      stripe_payment_intent_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
        unique: true,
      },
      status: {
        type: Sequelize.ENUM("pending", "completed", "failed", "refunded"),
        allowNull: false,
        defaultValue: "pending",
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex("video_credit_transactions", ["user_id"]);
    await queryInterface.addIndex("video_credit_transactions", ["stripe_checkout_session_id"]);
    await queryInterface.addIndex("video_credit_transactions", ["stripe_payment_intent_id"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("video_credit_transactions");
  },
};
