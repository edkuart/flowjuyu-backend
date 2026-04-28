"use strict";

// Rename Stripe-specific columns to provider-agnostic names
// and add a `provider` column to support multiple payment processors.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.renameColumn(
      "video_credit_transactions",
      "stripe_checkout_session_id",
      "provider_session_id",
    );
    await queryInterface.renameColumn(
      "video_credit_transactions",
      "stripe_payment_intent_id",
      "provider_transaction_id",
    );
    await queryInterface.addColumn("video_credit_transactions", "provider", {
      type: Sequelize.STRING(50),
      allowNull: false,
      defaultValue: "stripe",
      after: "amount_usd_cents",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("video_credit_transactions", "provider");
    await queryInterface.renameColumn(
      "video_credit_transactions",
      "provider_session_id",
      "stripe_checkout_session_id",
    );
    await queryInterface.renameColumn(
      "video_credit_transactions",
      "provider_transaction_id",
      "stripe_payment_intent_id",
    );
  },
};
