"use strict";

async function describeIfExists(queryInterface) {
  try {
    return await queryInterface.describeTable("ai_credit_purchase_requests");
  } catch (err) {
    if (err?.original?.code === "42P01") return null;
    throw err;
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await describeIfExists(queryInterface);
    if (!table) return;

    if (!table.provider) {
      await queryInterface.addColumn(
        "ai_credit_purchase_requests",
        "provider",
        {
          type: Sequelize.STRING(50),
          allowNull: true,
        },
      );
    }

    if (!table.provider_session_id) {
      await queryInterface.addColumn(
        "ai_credit_purchase_requests",
        "provider_session_id",
        {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
      );
    }

    if (!table.provider_transaction_id) {
      await queryInterface.addColumn(
        "ai_credit_purchase_requests",
        "provider_transaction_id",
        {
          type: Sequelize.STRING(255),
          allowNull: true,
        },
      );
    }

    if (!table.payment_completed_at) {
      await queryInterface.addColumn(
        "ai_credit_purchase_requests",
        "payment_completed_at",
        {
          type: Sequelize.DATE,
          allowNull: true,
        },
      );
    }

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ai_credit_req_provider_session_uidx
      ON ai_credit_purchase_requests (provider_session_id)
      WHERE provider_session_id IS NOT NULL
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ai_credit_req_provider_transaction_uidx
      ON ai_credit_purchase_requests (provider_transaction_id)
      WHERE provider_transaction_id IS NOT NULL
    `);
  },

  async down(queryInterface) {
    const table = await describeIfExists(queryInterface);
    if (!table) return;

    await queryInterface.sequelize.query(
      "DROP INDEX IF EXISTS ai_credit_req_provider_transaction_uidx",
    );
    await queryInterface.sequelize.query(
      "DROP INDEX IF EXISTS ai_credit_req_provider_session_uidx",
    );
    if (table.payment_completed_at) {
      await queryInterface.removeColumn(
        "ai_credit_purchase_requests",
        "payment_completed_at",
      );
    }
    if (table.provider_transaction_id) {
      await queryInterface.removeColumn(
        "ai_credit_purchase_requests",
        "provider_transaction_id",
      );
    }
    if (table.provider_session_id) {
      await queryInterface.removeColumn(
        "ai_credit_purchase_requests",
        "provider_session_id",
      );
    }
    if (table.provider) {
      await queryInterface.removeColumn(
        "ai_credit_purchase_requests",
        "provider",
      );
    }
  },
};
