"use strict";

// This migration resolves the circular FK between seller_subscriptions and
// seller_billing_payments. It must run AFTER migration 000006 has created
// seller_billing_payments. The column could not be included in migration 000003
// because seller_billing_payments did not exist yet.
//
// last_payment_id is used for idempotent activation: activateSubscription()
// checks if sub.last_payment_id === incomingPaymentId before applying changes.
// A duplicate webhook for the same payment therefore has no effect.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("seller_subscriptions", "last_payment_id", {
      type:       Sequelize.INTEGER,
      allowNull:  true,
      references: { model: "seller_billing_payments", key: "id" },
      // SET NULL: removing a payment record (should never happen in production)
      // must not cascade into and corrupt the subscription record.
      onDelete:   "SET NULL",
      onUpdate:   "CASCADE",
    });

    await queryInterface.addIndex("seller_subscriptions", ["last_payment_id"], {
      name: "idx_ss_last_payment_id",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("seller_subscriptions", "idx_ss_last_payment_id");
    await queryInterface.removeColumn("seller_subscriptions", "last_payment_id");
  },
};
