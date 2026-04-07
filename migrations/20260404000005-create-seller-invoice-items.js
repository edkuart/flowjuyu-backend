"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("seller_invoice_items", {
      id: {
        type:          Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey:    true,
        allowNull:     false,
      },
      // RESTRICT: invoice items are financial records — never silently deleted.
      // Invoices are voided (status change), never hard-deleted.
      invoice_id: {
        type:       Sequelize.INTEGER,
        allowNull:  false,
        references: { model: "seller_invoices", key: "id" },
        onDelete:   "RESTRICT",
        onUpdate:   "CASCADE",
      },
      description: {
        type:      Sequelize.STRING(255),
        allowNull: false,
      },
      quantity: {
        type:         Sequelize.INTEGER,
        allowNull:    false,
        defaultValue: 1,
      },
      unit_amount: {
        type:      Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      // Denormalized snapshot: quantity × unit_amount, computed at creation time.
      // Never recalculated — the invoice is a historical record.
      total_amount: {
        type:      Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      // DATEONLY: billing period covered by this line item.
      period_start: {
        type:      Sequelize.DATEONLY,
        allowNull: true,
      },
      period_end: {
        type:      Sequelize.DATEONLY,
        allowNull: true,
      },
      // Non-null for extra feature purchases (e.g. "boost_monthly_credits").
      feature_key: {
        type:      Sequelize.STRING(100),
        allowNull: true,
      },
      metadata: {
        type:      Sequelize.JSONB,
        allowNull: true,
      },
      // Append-only table — no updated_at.
      // defaultValue ensures the field is always populated even if not passed explicitly.
      created_at: {
        type:         Sequelize.DATE,
        allowNull:    false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    await queryInterface.addIndex("seller_invoice_items", ["invoice_id"], {
      name: "idx_sii_invoice_id",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("seller_invoice_items");
  },
};
