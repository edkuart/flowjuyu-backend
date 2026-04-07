"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("seller_manual_payment_reports", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      // RESTRICT: manual reports are part of the financial audit trail and must
      // never disappear implicitly with a payment attempt.
      payment_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "seller_billing_payments", key: "id" },
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      },
      // Denormalized seller ownership to support direct seller/admin listing
      // without traversing payment -> invoice.
      seller_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      },
      invoice_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "seller_invoices", key: "id" },
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      },
      bank_name: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      // Boleta number / transfer code supplied by the seller.
      deposit_reference: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      depositor_name: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      // DATEONLY because the bank operation date is a calendar date, not a timestamp.
      deposit_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      reported_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
      },
      // File upload flow comes later; keep nullable now.
      receipt_file_url: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      // Workflow status owned by the manual review process.
      status: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: "submitted",
      },
      // Admin reviewer. SET NULL preserves the report if the admin account is deleted.
      reviewed_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },
      reviewed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      rejection_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    await queryInterface.addIndex("seller_manual_payment_reports", ["payment_id"], {
      name: "idx_smpr_payment_id",
    });
    await queryInterface.addIndex("seller_manual_payment_reports", ["seller_id", "status"], {
      name: "idx_smpr_seller_status",
    });
    await queryInterface.addIndex("seller_manual_payment_reports", ["invoice_id"], {
      name: "idx_smpr_invoice_id",
    });
    await queryInterface.addIndex("seller_manual_payment_reports", ["status", "created_at"], {
      name: "idx_smpr_status_created",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("seller_manual_payment_reports");
  },
};
