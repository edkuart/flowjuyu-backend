"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("orders", {
      id: {
        type:          Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey:    true,
        allowNull:     false,
      },
      buyer_id: {
        type:       Sequelize.INTEGER,
        allowNull:  false,
        references: { model: "users", key: "id" },
        onDelete:   "RESTRICT",
        onUpdate:   "CASCADE",
      },
      seller_id: {
        type:       Sequelize.INTEGER,
        allowNull:  false,
        references: { model: "users", key: "id" },
        onDelete:   "RESTRICT",
        onUpdate:   "CASCADE",
      },
      status: {
        type:         Sequelize.STRING(30),
        allowNull:    false,
        defaultValue: "draft",
      },
      currency: {
        type:      Sequelize.STRING(3),
        allowNull: false,
      },
      subtotal_amount: {
        type:      Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      fee_amount: {
        type:      Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      total_amount: {
        type:      Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      risk_level: {
        type:      Sequelize.STRING(20),
        allowNull: true,
      },
      review_status: {
        type:      Sequelize.STRING(20),
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

    await queryInterface.addIndex("orders", ["buyer_id"],   { name: "idx_orders_buyer_id" });
    await queryInterface.addIndex("orders", ["seller_id"],  { name: "idx_orders_seller_id" });
    await queryInterface.addIndex("orders", ["status"],     { name: "idx_orders_status" });
    await queryInterface.addIndex("orders", ["created_at"], { name: "idx_orders_created_at" });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("orders");
  },
};
