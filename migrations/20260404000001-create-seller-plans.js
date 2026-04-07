"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("seller_plans", {
      id: {
        type:          Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey:    true,
        allowNull:     false,
      },
      name: {
        type:      Sequelize.STRING(100),
        allowNull: false,
      },
      slug: {
        type:      Sequelize.STRING(50),
        allowNull: false,
        unique:    true,
      },
      description: {
        type:      Sequelize.TEXT,
        allowNull: true,
      },
      price_monthly: {
        type:      Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      price_yearly: {
        type:      Sequelize.DECIMAL(12, 2),
        allowNull: true,
      },
      currency: {
        type:         Sequelize.STRING(3),
        allowNull:    false,
        defaultValue: "GTQ",
      },
      // Enforcement columns — source of truth for business rules.
      // Also present in seller_plan_features for display only (label/UI).
      max_products: {
        type:      Sequelize.INTEGER,
        allowNull: false,
      },
      max_photos_per_product: {
        type:      Sequelize.INTEGER,
        allowNull: false,
      },
      is_active: {
        type:         Sequelize.BOOLEAN,
        allowNull:    false,
        defaultValue: true,
      },
      is_public: {
        type:         Sequelize.BOOLEAN,
        allowNull:    false,
        defaultValue: true,
      },
      sort_order: {
        type:         Sequelize.INTEGER,
        allowNull:    false,
        defaultValue: 0,
      },
      created_at: {
        type:         Sequelize.DATE,
        allowNull:    false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      updated_at: {
        type:         Sequelize.DATE,
        allowNull:    false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    // slug is already unique via the column definition above.
    // Additional indexes for common runtime queries.
    await queryInterface.addIndex("seller_plans", ["is_active", "is_public"], {
      name: "idx_sp_active_public",
    });
    await queryInterface.addIndex("seller_plans", ["sort_order"], {
      name: "idx_sp_sort_order",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("seller_plans");
  },
};
