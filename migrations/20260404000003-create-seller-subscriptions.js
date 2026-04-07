"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("seller_subscriptions", {
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
      plan_id: {
        type:       Sequelize.INTEGER,
        allowNull:  false,
        references: { model: "seller_plans", key: "id" },
        onDelete:   "RESTRICT",
        onUpdate:   "CASCADE",
      },
      // Status machine: draft → active → past_due → expired | cancelled | paused
      status: {
        type:         Sequelize.STRING(30),
        allowNull:    false,
        defaultValue: "draft",
      },
      billing_cycle: {
        type:         Sequelize.STRING(20),
        allowNull:    false,
        defaultValue: "monthly",
      },
      // Price fixed at signup time. Never changes even if plan.price_monthly changes.
      price_at_signup: {
        type:      Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      currency_at_signup: {
        type:         Sequelize.STRING(3),
        allowNull:    false,
        defaultValue: "GTQ",
      },
      // DATEONLY: stored as DATE in PostgreSQL (no time component).
      // Returned as string "YYYY-MM-DD" by Sequelize — declare as string in TS model.
      // null while subscription is in draft (no period established yet).
      current_period_start: {
        type:      Sequelize.DATEONLY,
        allowNull: true,
      },
      current_period_end: {
        type:      Sequelize.DATEONLY,
        allowNull: true,
      },
      // Populated when status transitions to past_due.
      grace_period_end: {
        type:      Sequelize.DATEONLY,
        allowNull: true,
      },
      auto_renew: {
        type:         Sequelize.BOOLEAN,
        allowNull:    false,
        defaultValue: true,
      },
      cancelled_at: {
        type:      Sequelize.DATE,
        allowNull: true,
      },
      cancellation_reason: {
        type:      Sequelize.TEXT,
        allowNull: true,
      },
      paused_at: {
        type:      Sequelize.DATE,
        allowNull: true,
      },
      // SET NULL: deleting an admin account must not cascade into subscriptions.
      paused_by: {
        type:       Sequelize.INTEGER,
        allowNull:  true,
        references: { model: "users", key: "id" },
        onDelete:   "SET NULL",
        onUpdate:   "CASCADE",
      },
      resumed_at: {
        type:      Sequelize.DATE,
        allowNull: true,
      },
      // last_payment_id is added in migration 20260404000007 (circular FK resolution).
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

    // Most critical runtime index: "does this seller have an active subscription?"
    await queryInterface.addIndex("seller_subscriptions", ["seller_id", "status"], {
      name: "idx_ss_seller_status",
    });
    // Cron: subscriptions approaching renewal date.
    await queryInterface.addIndex("seller_subscriptions", ["status", "current_period_end"], {
      name: "idx_ss_status_period_end",
    });
    // Cron: grace period expiration scan.
    await queryInterface.addIndex("seller_subscriptions", ["status", "grace_period_end"], {
      name: "idx_ss_status_grace_end",
    });
    // History listing for a seller, latest first.
    await queryInterface.addIndex("seller_subscriptions", ["seller_id", "created_at"], {
      name: "idx_ss_seller_created",
    });

    // Partial unique index: only one active subscription per seller at any time.
    // Raw SQL required — queryInterface.addIndex with `where` is supported in
    // Sequelize but only PostgreSQL dialect honours the WHERE clause correctly.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_ss_one_active_per_seller
      ON seller_subscriptions (seller_id)
      WHERE status = 'active'
    `);
  },

  async down(queryInterface) {
    // Partial index is owned by the table; dropped automatically on dropTable.
    await queryInterface.dropTable("seller_subscriptions");
  },
};
