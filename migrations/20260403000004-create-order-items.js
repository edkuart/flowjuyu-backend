"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("order_items", {
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
        onDelete:   "CASCADE",
        onUpdate:   "CASCADE",
      },
      product_id: {
        type:      Sequelize.STRING(100),
        allowNull: true,  // nullable for soft-deleted products
      },
      product_name_snapshot: {
        type:      Sequelize.STRING(255),
        allowNull: false,
      },
      unit_price_snapshot: {
        type:      Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      quantity: {
        type:      Sequelize.INTEGER,
        allowNull: false,
      },
      line_total: {
        type:      Sequelize.DECIMAL(12, 2),
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

    await queryInterface.addIndex("order_items", ["order_id"],   { name: "idx_order_items_order_id" });
    await queryInterface.addIndex("order_items", ["product_id"], { name: "idx_order_items_product_id" });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("order_items");
  },
};
