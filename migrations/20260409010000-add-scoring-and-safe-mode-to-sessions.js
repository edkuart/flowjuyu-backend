"use strict";

/**
 * Migration: add failure scoring and safe mode to conversation_sessions
 *
 * failure_score    (0-100) — composite risk indicator driven by failure signals
 * frustration_score (0-100) — frustration-specific sub-score
 * safe_mode        (bool)  — when true, bot restricts to guided interactions only
 *
 * All fields have safe defaults — existing sessions are unaffected at runtime.
 * safe_mode = false keeps all sessions in normal mode until CRITICAL threshold.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface
      .describeTable("conversation_sessions")
      .catch(() => null);

    if (!cols) {
      console.log("conversation_sessions does not exist — skipping");
      return;
    }

    if (!("failure_score" in cols)) {
      await queryInterface.addColumn("conversation_sessions", "failure_score", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    if (!("frustration_score" in cols)) {
      await queryInterface.addColumn(
        "conversation_sessions",
        "frustration_score",
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        }
      );
    }

    if (!("safe_mode" in cols)) {
      await queryInterface.addColumn("conversation_sessions", "safe_mode", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    // Index for querying sessions in safe mode or by risk level
    const indexes = await queryInterface
      .showIndex("conversation_sessions")
      .catch(() => []);
    const hasIdx = indexes.some(
      (i) => i.name === "idx_conversation_sessions_safe_mode"
    );
    if (!hasIdx) {
      await queryInterface.addIndex("conversation_sessions", ["safe_mode"], {
        name: "idx_conversation_sessions_safe_mode",
      });
    }
  },

  async down(queryInterface) {
    const cols = await queryInterface
      .describeTable("conversation_sessions")
      .catch(() => null);
    if (!cols) return;

    if ("safe_mode" in cols) {
      await queryInterface.removeColumn("conversation_sessions", "safe_mode");
    }
    if ("frustration_score" in cols) {
      await queryInterface.removeColumn(
        "conversation_sessions",
        "frustration_score"
      );
    }
    if ("failure_score" in cols) {
      await queryInterface.removeColumn(
        "conversation_sessions",
        "failure_score"
      );
    }
  },
};
