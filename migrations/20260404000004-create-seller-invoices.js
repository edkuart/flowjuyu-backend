"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create the global sequence for invoice numbers.
    // The year prefix in FLW-YYYY-NNNNN is visual only — the counter never resets.
    // Usage in service: SELECT 'FLW-' || ... || lpad(nextval('seller_invoice_number_seq')::text, 5, '0')
    await queryInterface.sequelize.query(`
      CREATE SEQUENCE IF NOT EXISTS seller_invoice_number_seq START 1
    `);

    await queryInterface.createTable("seller_invoices", {
      id: {
        type:          Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey:    true,
        allowNull:     false,
      },
      seller_id: {
        type:       Sequelize.INTEGER,
        allowNull:  false,
        references: { model: "users", key: "id" },
        onDelete:   "RESTRICT",
        onUpdate:   "CASCADE",
      },
      // Nullable: extras can exist without a subscription.
      subscription_id: {
        type:       Sequelize.INTEGER,
        allowNull:  true,
        references: { model: "seller_subscriptions", key: "id" },
        onDelete:   "RESTRICT",
        onUpdate:   "CASCADE",
      },
      // Generated via seller_invoice_number_seq in the service layer.
      // Format: FLW-2026-00001
      invoice_number: {
        type:      Sequelize.STRING(50),
        allowNull: false,
        unique:    true,
      },
      // "subscription" | "extra" | "manual"
      type: {
        type:      Sequelize.STRING(30),
        allowNull: false,
      },
      // "draft" | "open" | "paid" | "void" | "uncollectible"
      status: {
        type:         Sequelize.STRING(30),
        allowNull:    false,
        defaultValue: "draft",
      },
      subtotal_amount: {
        type:      Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      // IVA 12% Guatemala — stored as 0 in V1, reserved for future tax handling.
      tax_amount: {
        type:         Sequelize.DECIMAL(12, 2),
        allowNull:    false,
        defaultValue: 0,
      },
      total_amount: {
        type:      Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      currency: {
        type:         Sequelize.STRING(3),
        allowNull:    false,
        defaultValue: "GTQ",
      },
      // DATEONLY: date-only field, no time component.
      // Returned as string "YYYY-MM-DD" by Sequelize.
      due_date: {
        type:      Sequelize.DATEONLY,
        allowNull: false,
      },
      paid_at: {
        type:      Sequelize.DATE,
        allowNull: true,
      },
      // Timestamp when the invoice notification was sent to the seller.
      sent_at: {
        type:      Sequelize.DATE,
        allowNull: true,
      },
      voided_at: {
        type:      Sequelize.DATE,
        allowNull: true,
      },
      // SET NULL: an invoice remains valid even if the admin who voided it is deleted.
      voided_by: {
        type:       Sequelize.INTEGER,
        allowNull:  true,
        references: { model: "users", key: "id" },
        onDelete:   "SET NULL",
        onUpdate:   "CASCADE",
      },
      notes: {
        type:      Sequelize.TEXT,
        allowNull: true,
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
      updated_at: {
        type:         Sequelize.DATE,
        allowNull:    false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    // invoice_number uniqueness is already enforced by the column definition above.
    await queryInterface.addIndex("seller_invoices", ["seller_id", "status"], {
      name: "idx_si_seller_status",
    });
    await queryInterface.addIndex("seller_invoices", ["seller_id", "created_at"], {
      name: "idx_si_seller_created",
    });
    // Cron: upcoming due dates and overdue alerts.
    await queryInterface.addIndex("seller_invoices", ["status", "due_date"], {
      name: "idx_si_status_due_date",
    });
    // Join path from subscription to its invoices.
    await queryInterface.addIndex("seller_invoices", ["subscription_id"], {
      name: "idx_si_subscription_id",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("seller_invoices");
    // Drop sequence after table — no column DEFAULT references it, but keep
    // the drop order explicit for clarity.
    await queryInterface.sequelize.query(`
      DROP SEQUENCE IF EXISTS seller_invoice_number_seq
    `);
  },
};
