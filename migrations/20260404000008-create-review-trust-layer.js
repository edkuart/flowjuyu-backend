"use strict";

/**
 * Phase 2 — Reputation, Moderation & Trust Layer
 *
 * Extends reviews with lifecycle support and adds related tables for:
 * - seller responses
 * - abuse reports
 *
 * Reviews remain soft-deletable and auditable; no physical deletion.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("reviews", "review_edit_count", {
      type:         Sequelize.INTEGER,
      allowNull:    false,
      defaultValue: 0,
    });

    await queryInterface.addColumn("reviews", "deleted_at", {
      type:      Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      CREATE TABLE review_responses (
        id         SERIAL PRIMARY KEY,
        review_id  UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE ON UPDATE CASCADE,
        seller_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        respuesta  TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    await queryInterface.addIndex("review_responses", ["review_id"], {
      name:   "idx_review_responses_review_id_unique",
      unique: true,
    });

    await queryInterface.addIndex("review_responses", ["seller_id"], {
      name: "idx_review_responses_seller_id",
    });

    await queryInterface.sequelize.query(`
      CREATE TABLE review_reports (
        id         SERIAL PRIMARY KEY,
        review_id  UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE ON UPDATE CASCADE,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        motivo     TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    await queryInterface.addIndex("review_reports", ["review_id"], {
      name: "idx_review_reports_review_id",
    });

    await queryInterface.addIndex("review_reports", ["user_id"], {
      name: "idx_review_reports_user_id",
    });

    await queryInterface.addIndex("review_reports", ["review_id", "user_id"], {
      name:   "idx_review_reports_review_id_user_id_unique",
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("review_reports", "idx_review_reports_review_id_user_id_unique");
    await queryInterface.removeIndex("review_reports", "idx_review_reports_user_id");
    await queryInterface.removeIndex("review_reports", "idx_review_reports_review_id");
    await queryInterface.dropTable("review_reports");

    await queryInterface.removeIndex("review_responses", "idx_review_responses_seller_id");
    await queryInterface.removeIndex("review_responses", "idx_review_responses_review_id_unique");
    await queryInterface.dropTable("review_responses");

    await queryInterface.removeColumn("reviews", "deleted_at");
    await queryInterface.removeColumn("reviews", "review_edit_count");
  },
};
