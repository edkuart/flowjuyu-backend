"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("payment_attempts", {
      id: {
        type:          Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey:    true,
        allowNull:     false,
      },
      order_id: {
        type:       Sequelize.INTEGER,
        allowNull:  false,
        references: { model: "orders", key: "id" },
        onDelete:   "RESTRICT",
        onUpdate:   "CASCADE",
      },
      provider: {
        type:      Sequelize.STRING(50),
        allowNull: false,
      },
      provider_intent_id: {
        type:      Sequelize.STRING(255),
        allowNull: true,
      },
      provider_session_id: {
        type:      Sequelize.STRING(255),
        allowNull: true,
      },
      idempotency_key: {
        type:      Sequelize.STRING(255),
        allowNull: false,
        unique:    true,
      },
      amount_expected: {
        type:      Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      currency: {
        type:      Sequelize.STRING(3),
        allowNull: false,
      },
      status: {
        type:         Sequelize.STRING(30),
        allowNull:    false,
        defaultValue: "created",
      },
      failure_reason: {
        type:      Sequelize.TEXT,
        allowNull: true,
      },
      metadata: {
        type:      Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type:      Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      updated_at: {
        type:      Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    await queryInterface.addIndex("payment_attempts", ["order_id"],                          { name: "idx_pa_order_id" });
    await queryInterface.addIndex("payment_attempts", ["idempotency_key"], { unique: true,   name: "idx_pa_idempotency_key" });
    await queryInterface.addIndex("payment_attempts", ["provider", "provider_intent_id"],    { name: "idx_pa_provider_intent" });
    await queryInterface.addIndex("payment_attempts", ["status"],                             { name: "idx_pa_status" });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("payment_attempts");
  },
};
