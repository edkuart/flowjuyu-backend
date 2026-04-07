"use strict";

/**
 * Phase 3 — Review Intelligence Layer
 *
 * Adds:
 * - review_signals  → deterministic trust/risk/quality scoring
 * - review_votes    → helpful votes
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      CREATE TABLE review_signals (
        id            SERIAL PRIMARY KEY,
        review_id     UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE ON UPDATE CASCADE,
        risk_score    DECIMAL(5,4) NOT NULL DEFAULT 0,
        trust_score   DECIMAL(5,4) NOT NULL DEFAULT 0,
        quality_score DECIMAL(5,4) NOT NULL DEFAULT 0,
        signals       JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    await queryInterface.addIndex("review_signals", ["review_id"], {
      name:   "idx_review_signals_review_id_unique",
      unique: true,
    });

    await queryInterface.addIndex("review_signals", ["risk_score"], {
      name: "idx_review_signals_risk_score",
    });

    await queryInterface.addIndex("review_signals", ["trust_score"], {
      name: "idx_review_signals_trust_score",
    });

    await queryInterface.addIndex("review_signals", ["quality_score"], {
      name: "idx_review_signals_quality_score",
    });

    await queryInterface.sequelize.query(`
      CREATE TABLE review_votes (
        id         SERIAL PRIMARY KEY,
        review_id  UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE ON UPDATE CASCADE,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    await queryInterface.addIndex("review_votes", ["review_id"], {
      name: "idx_review_votes_review_id",
    });

    await queryInterface.addIndex("review_votes", ["user_id"], {
      name: "idx_review_votes_user_id",
    });

    await queryInterface.addIndex("review_votes", ["review_id", "user_id"], {
      name:   "idx_review_votes_review_id_user_id_unique",
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("review_votes", "idx_review_votes_review_id_user_id_unique");
    await queryInterface.removeIndex("review_votes", "idx_review_votes_user_id");
    await queryInterface.removeIndex("review_votes", "idx_review_votes_review_id");
    await queryInterface.dropTable("review_votes");

    await queryInterface.removeIndex("review_signals", "idx_review_signals_quality_score");
    await queryInterface.removeIndex("review_signals", "idx_review_signals_trust_score");
    await queryInterface.removeIndex("review_signals", "idx_review_signals_risk_score");
    await queryInterface.removeIndex("review_signals", "idx_review_signals_review_id_unique");
    await queryInterface.dropTable("review_signals");
  },
};
