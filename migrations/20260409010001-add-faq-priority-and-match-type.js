"use strict";

/**
 * Migration: add priority and match_type to platform_faq_entries
 *
 * priority    (INTEGER, default 0)       — higher priority entries are checked first
 * match_type  (TEXT, default 'includes') — matching strategy:
 *   "exact"    normalized input === normalized trigger
 *   "token"    all tokens of trigger appear in input tokens
 *   "includes" input contains trigger as substring (original behavior)
 *
 * Existing entries default to priority=0 and match_type='includes', preserving
 * all current matching behavior without any code or data changes at deploy time.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface
      .describeTable("platform_faq_entries")
      .catch(() => null);

    if (!cols) {
      console.log("platform_faq_entries does not exist — skipping");
      return;
    }

    if (!("priority" in cols)) {
      await queryInterface.addColumn("platform_faq_entries", "priority", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    if (!("match_type" in cols)) {
      await queryInterface.addColumn("platform_faq_entries", "match_type", {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: "includes",
      });
    }

    // Composite index on (is_active, priority DESC) for ordered lookups
    const indexes = await queryInterface
      .showIndex("platform_faq_entries")
      .catch(() => []);
    const hasIdx = indexes.some(
      (i) => i.name === "idx_platform_faq_active_priority"
    );
    if (!hasIdx) {
      await queryInterface.addIndex(
        "platform_faq_entries",
        ["is_active", "priority"],
        { name: "idx_platform_faq_active_priority" }
      );
    }
  },

  async down(queryInterface) {
    const cols = await queryInterface
      .describeTable("platform_faq_entries")
      .catch(() => null);
    if (!cols) return;

    if ("match_type" in cols) {
      await queryInterface.removeColumn("platform_faq_entries", "match_type");
    }
    if ("priority" in cols) {
      await queryInterface.removeColumn("platform_faq_entries", "priority");
    }
  },
};
