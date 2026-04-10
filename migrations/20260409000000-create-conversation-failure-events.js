"use strict";

/**
 * Migration: create conversation_failure_events
 *
 * Stores detected failure signals from the WhatsApp conversational system.
 * Used for post-hoc analysis, debugging, and future AI training data.
 *
 * Failure signals:
 *   bot_repeated_itself    — same bot reply sent twice in a row
 *   user_repeated_input    — user sent the same normalized text more than once
 *   frustration_detected   — user text matched known frustration patterns
 *   step_mismatch          — input type did not match the expected step
 *   silent_outbound_failure — outbound send to WhatsApp API failed
 *   invalid_transition     — state machine received an illegal step transition
 *   context_loop           — session was hard-reset multiple times in short period
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes("conversation_failure_events")) {
      console.log("conversation_failure_events already exists — skipping");
      return;
    }

    await queryInterface.createTable("conversation_failure_events", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      session_id: {
        type: Sequelize.UUID,
        allowNull: false,
        // Intentionally no FK constraint — sessions can be cleaned up independently
      },
      seller_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      wa_message_id: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      signal: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      user_text: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      bot_text: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      current_step: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      expected_input_type: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      command_context: {
        type: Sequelize.JSONB,
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
    });

    await queryInterface.addIndex(
      "conversation_failure_events",
      ["session_id"],
      { name: "idx_conv_failure_events_session" }
    );
    await queryInterface.addIndex(
      "conversation_failure_events",
      ["signal"],
      { name: "idx_conv_failure_events_signal" }
    );
    await queryInterface.addIndex(
      "conversation_failure_events",
      ["created_at"],
      { name: "idx_conv_failure_events_created_at" }
    );
    await queryInterface.addIndex(
      "conversation_failure_events",
      ["seller_user_id"],
      { name: "idx_conv_failure_events_seller" }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("conversation_failure_events");
  },
};
