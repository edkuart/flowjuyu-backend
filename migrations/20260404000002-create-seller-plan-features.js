"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("seller_plan_features", {
      id: {
        type:          Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey:    true,
        allowNull:     false,
      },
      plan_id: {
        type:       Sequelize.INTEGER,
        allowNull:  false,
        references: { model: "seller_plans", key: "id" },
        onDelete:   "RESTRICT",
        onUpdate:   "CASCADE",
      },
      // Feature key: e.g. "boost_monthly_credits", "featured_badge", "analytics_level"
      // Business enforcement (max_products, max_photos_per_product) is handled via
      // columns in seller_plans. This table is for display and extra capabilities only.
      feature_key: {
        type:      Sequelize.STRING(100),
        allowNull: false,
      },
      // Always stored as string. Service layer casts to appropriate type.
      // e.g. "5" for credits, "true" for boolean features, "advanced" for levels.
      feature_value: {
        type:      Sequelize.STRING(255),
        allowNull: false,
      },
      display_label: {
        type:      Sequelize.STRING(255),
        allowNull: false,
      },
      // Append-only table — no updated_at.
      created_at: {
        type:         Sequelize.DATE,
        allowNull:    false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    // Primary deduplication and lookup constraint.
    await queryInterface.addIndex("seller_plan_features", ["plan_id", "feature_key"], {
      unique: true,
      name:   "idx_spf_plan_feature_unique",
    });
    // Cross-plan feature queries: "which plans offer featured_badge?"
    await queryInterface.addIndex("seller_plan_features", ["feature_key"], {
      name: "idx_spf_feature_key",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("seller_plan_features");
  },
};
