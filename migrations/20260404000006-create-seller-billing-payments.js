"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("seller_billing_payments", {
      id: {
        type:          Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey:    true,
        allowNull:     false,
      },
      // RESTRICT: a payment record is a financial artifact — never silently removed.
      invoice_id: {
        type:       Sequelize.INTEGER,
        allowNull:  false,
        references: { model: "seller_invoices", key: "id" },
        onDelete:   "RESTRICT",
        onUpdate:   "CASCADE",
      },
      // Denormalized for fast access in webhook processing path (avoids invoice JOIN).
      seller_id: {
        type:       Sequelize.INTEGER,
        allowNull:  false,
        references: { model: "users", key: "id" },
        onDelete:   "RESTRICT",
        onUpdate:   "CASCADE",
      },
      // "bac" | "paypal" | "manual"
      provider: {
        type:      Sequelize.STRING(30),
        allowNull: false,
      },
      // External ID from the provider (BAC link_id, PayPal invoice_id).
      // Used as the lookup key when an inbound webhook arrives.
      provider_reference: {
        type:      Sequelize.STRING(255),
        allowNull: true,
      },
      // Full payment URL sent to the seller.
      provider_link: {
        type:      Sequelize.TEXT,
        allowNull: true,
      },
      // When the payment link expires. Used by the cron that marks links as "expired".
      provider_link_expires_at: {
        type:      Sequelize.DATE,
        allowNull: true,
      },
      // Must equal invoice.total_amount at creation time. Never updated.
      amount: {
        type:      Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      currency: {
        type:      Sequelize.STRING(3),
        allowNull: false,
      },
      // Status machine:
      //   pending → confirmed | failed | cancelled | expired | processing
      //   pending → manual_pending (seller reports manual payment)
      //   manual_pending → confirmed (admin verifies) | failed (admin rejects)
      //   processing → confirmed | failed
      status: {
        type:         Sequelize.STRING(30),
        allowNull:    false,
        defaultValue: "pending",
      },
      // e.g. "Visa *4242", "PayPal account@example.com". Never full card number.
      payment_method_detail: {
        type:      Sequelize.STRING(255),
        allowNull: true,
      },
      confirmed_at: {
        type:      Sequelize.DATE,
        allowNull: true,
      },
      // SET NULL: confirmation audit trail must survive admin account deletion.
      confirmed_by: {
        type:       Sequelize.INTEGER,
        allowNull:  true,
        references: { model: "users", key: "id" },
        onDelete:   "SET NULL",
        onUpdate:   "CASCADE",
      },
      failure_reason: {
        type:      Sequelize.TEXT,
        allowNull: true,
      },
      notes: {
        type:      Sequelize.TEXT,
        allowNull: true,
      },
      // Nullable — not all payment flows use an idempotency key (e.g. manual payments).
      // When non-null, enforced UNIQUE at DB level.
      // In PostgreSQL, UNIQUE on a nullable column allows multiple NULLs (NULL != NULL).
      // Key is ALWAYS generated server-side; never accepted from the frontend.
      idempotency_key: {
        type:      Sequelize.STRING(255),
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

    // Unique on non-null keys only — PostgreSQL naturally allows multiple NULLs.
    await queryInterface.addIndex("seller_billing_payments", ["idempotency_key"], {
      unique: true,
      name:   "idx_sbp_idempotency_key",
    });
    // Primary webhook lookup path: incoming event → find payment record in O(1).
    await queryInterface.addIndex("seller_billing_payments", ["provider", "provider_reference"], {
      name: "idx_sbp_provider_reference",
    });
    // Seller dashboard: all payments for a seller filtered by status.
    await queryInterface.addIndex("seller_billing_payments", ["seller_id", "status"], {
      name: "idx_sbp_seller_status",
    });
    // Join path: all attempts for a given invoice.
    await queryInterface.addIndex("seller_billing_payments", ["invoice_id"], {
      name: "idx_sbp_invoice_id",
    });
    // Cron: find pending payments with expired links.
    await queryInterface.addIndex("seller_billing_payments", ["status", "provider_link_expires_at"], {
      name: "idx_sbp_status_link_expires",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("seller_billing_payments");
  },
};
