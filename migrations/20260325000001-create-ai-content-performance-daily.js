"use strict";

/**
 * Migration: Phase 3 — AI Content Performance Tracking
 *
 * Creates:
 *   - ai_content_performance_daily  (one row per item+variant+date+channel)
 *
 * Attribution strategy: approximate.
 *   product_id → ai_content_items.subject_id → published_variant_id.
 *   Confidence is always stored as 'approximate' for Phase 3.
 *
 * Idempotent: guarded by showAllTables() check.
 * Down: drops table only.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes("ai_content_performance_daily")) {
      await queryInterface.createTable("ai_content_performance_daily", {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal("gen_random_uuid()"),
          primaryKey: true,
        },

        // ── Attribution ───────────────────────────────────────────────────
        content_item_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "ai_content_items", key: "id" },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
        content_variant_id: {
          type: Sequelize.UUID,
          allowNull: false,
          // No FK: variant may be archived/replaced; keep history intact.
        },

        // ── Date + channel ────────────────────────────────────────────────
        recorded_date: {
          type: Sequelize.DATEONLY,
          allowNull: false,
        },
        channel: {
          // 'organic' in Phase 3 (social/paid expansion is Phase 4+)
          type: Sequelize.STRING(40),
          allowNull: false,
          defaultValue: "organic",
        },

        // ── Raw event counts ──────────────────────────────────────────────
        impressions: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        views: {
          // product_views.view_date rows for the product on this date
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        clicks: {
          // proxy: saves (favorites) — Phase 3 approximation
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        whatsapp_clicks: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        intentions: {
          // purchase_intentions rows for the product on this date
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        saves: {
          // favorites created on this date for the product
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },

        // ── Computed rates (stored for query performance) ─────────────────
        engagement_rate: {
          // product_sessions avg engagement / views; 0 if table absent
          type: Sequelize.DECIMAL(6, 4),
          allowNull: true,
        },
        click_rate: {
          // saves / views
          type: Sequelize.DECIMAL(6, 4),
          allowNull: true,
        },
        whatsapp_rate: {
          // whatsapp_clicks / views
          type: Sequelize.DECIMAL(6, 4),
          allowNull: true,
        },
        intent_rate: {
          // intentions / views
          type: Sequelize.DECIMAL(6, 4),
          allowNull: true,
        },
        time_on_page_avg: {
          // seconds, from product_sessions if available
          type: Sequelize.DECIMAL(8, 2),
          allowNull: true,
        },

        // ── Composite performance score ───────────────────────────────────
        performance_score: {
          // 0.40*intent_rate + 0.25*whatsapp_rate + 0.20*click_rate + 0.15*engagement_rate
          // NULL when views < MIN_IMPRESSIONS (5)
          type: Sequelize.DECIMAL(4, 3),
          allowNull: true,
        },

        // ── Meta ──────────────────────────────────────────────────────────
        attribution_confidence: {
          // 'approximate' | 'direct' — always 'approximate' in Phase 3
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: "approximate",
        },
        source_event_type: {
          // Which event table was primary source, for audit trail
          type: Sequelize.STRING(60),
          allowNull: true,
        },

        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("NOW()"),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("NOW()"),
        },
      });

      // Unique per item+variant+date+channel to allow safe upserts
      await queryInterface.addIndex(
        "ai_content_performance_daily",
        ["content_item_id", "content_variant_id", "recorded_date", "channel"],
        {
          unique: true,
          name: "uq_perf_daily_item_variant_date_channel",
        }
      );

      // Fast range queries for learning service (last N days for an item)
      await queryInterface.addIndex(
        "ai_content_performance_daily",
        ["content_item_id", "recorded_date"],
        { name: "idx_perf_daily_item_date" }
      );

      // Fast queries for best/worst performers by date range
      await queryInterface.addIndex(
        "ai_content_performance_daily",
        ["recorded_date", "performance_score"],
        { name: "idx_perf_daily_date_score" }
      );

      console.log("✅ Created table: ai_content_performance_daily");
    } else {
      console.log("⏭️  Table ai_content_performance_daily already exists — skipping.");
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ai_content_performance_daily");
  },
};
