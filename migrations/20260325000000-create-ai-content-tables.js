"use strict";

/**
 * Migration: Phase 2 — AI Content Identity + Data Layer (MVS)
 *
 * Creates:
 *   - ai_content_items    (canonical content need per subject+content_type)
 *   - ai_content_variants (one generation attempt per item)
 *   - ai_content_reviews  (human review log)
 *
 * MVS scope: subject_type restricted to 'product' at the application layer.
 * Schema is polymorphic-ready (subject_type VARCHAR) for Phase 3 expansion.
 *
 * Idempotent: guarded by showAllTables() check before each table creation.
 * Down: drops in reverse FK dependency order.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    // ── ai_content_items ───────────────────────────────────────────────────
    if (!tables.includes("ai_content_items")) {
      await queryInterface.createTable("ai_content_items", {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal("gen_random_uuid()"),
          primaryKey: true,
        },
        // Subject fields — polymorphic, scoped to 'product' in MVS
        subject_type: {
          type: Sequelize.STRING(30),
          allowNull: false,
          comment: "MVS: product only. Future: category, seller, editorial",
        },
        subject_id: {
          type: Sequelize.STRING(36),
          allowNull: false,
          comment: "UUID string matching productos.id for subject_type=product",
        },
        content_type: {
          type: Sequelize.STRING(40),
          allowNull: false,
          comment: "caption | product_description | image_prompt_brief",
        },
        // Lifecycle
        status: {
          type: Sequelize.STRING(30),
          allowNull: false,
          defaultValue: "pending",
          comment:
            "pending | generating | in_review | approved | published | blocked | archived",
        },
        priority: {
          type: Sequelize.SMALLINT,
          allowNull: false,
          defaultValue: 5,
          comment: "1 = highest urgency, 10 = lowest",
        },
        // Generation tracking
        last_generated_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        generation_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        cooldown_until: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: "No new generation before this timestamp (72h default)",
        },
        // Published variant reference — set atomically on publish
        // Defined without FK here to avoid circular dependency with ai_content_variants.
        // The application layer enforces referential integrity.
        published_variant_id: {
          type: Sequelize.UUID,
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

      await queryInterface.addIndex("ai_content_items", ["status"], {
        name: "idx_content_items_status",
      });
      await queryInterface.addIndex(
        "ai_content_items",
        ["subject_type", "subject_id"],
        { name: "idx_content_items_subject" }
      );
      await queryInterface.addIndex(
        "ai_content_items",
        ["priority", "status"],
        { name: "idx_content_items_priority" }
      );
      await queryInterface.addConstraint("ai_content_items", {
        fields: ["subject_type", "subject_id", "content_type"],
        type: "unique",
        name: "uq_content_item",
      });
    }

    // ── ai_content_variants ────────────────────────────────────────────────
    if (!tables.includes("ai_content_variants")) {
      await queryInterface.createTable("ai_content_variants", {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal("gen_random_uuid()"),
          primaryKey: true,
        },
        content_item_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "ai_content_items", key: "id" },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
        variant_number: {
          type: Sequelize.SMALLINT,
          allowNull: false,
          comment: "Increments per item; never reset",
        },
        // Content
        content_body: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        content_hash: {
          type: Sequelize.CHAR(64),
          allowNull: false,
          comment: "SHA-256 of content_body|language|content_type",
        },
        language: {
          type: Sequelize.CHAR(2),
          allowNull: false,
          defaultValue: "es",
        },
        word_count: {
          type: Sequelize.SMALLINT,
          allowNull: false,
        },
        // LLM metadata
        template_id: {
          type: Sequelize.STRING(80),
          allowNull: false,
          comment: "Slug of the prompt template used (not a FK in MVS)",
        },
        model_used: {
          type: Sequelize.STRING(60),
          allowNull: false,
        },
        prompt_tokens: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        completion_tokens: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        cost_usd: {
          type: Sequelize.DECIMAL(10, 7),
          allowNull: false,
          comment: "Computed at write time from model pricing constants",
        },
        generated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("NOW()"),
        },
        // Generation score components (0.000 – 1.000)
        score_specificity: { type: Sequelize.DECIMAL(4, 3), allowNull: true },
        score_brand_alignment: {
          type: Sequelize.DECIMAL(4, 3),
          allowNull: true,
        },
        score_readability: { type: Sequelize.DECIMAL(4, 3), allowNull: true },
        score_seo_coverage: { type: Sequelize.DECIMAL(4, 3), allowNull: true },
        generation_score: {
          type: Sequelize.DECIMAL(4, 3),
          allowNull: true,
          comment: "Null if guardrail blocked before scoring",
        },
        // Guardrail result
        guardrail_passed: {
          type: Sequelize.BOOLEAN,
          allowNull: true,
          comment: "Null = not yet checked",
        },
        guardrail_checked_at: { type: Sequelize.DATE, allowNull: true },
        guardrail_failures: {
          type: Sequelize.JSONB,
          allowNull: true,
          comment: 'Array of check names that failed: ["origin_claim", ...]',
        },
        // Status lifecycle
        status: {
          type: Sequelize.STRING(40),
          allowNull: false,
          defaultValue: "generated",
        },
        rejection_reason: {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: "Rejection taxonomy code (see content.types.ts)",
        },
        rejection_note: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: "Optional free-text; admin-set only",
        },
        queue_flag: {
          type: Sequelize.STRING(20),
          allowNull: true,
          comment: "ready | needs_attention",
        },
        published_at: { type: Sequelize.DATE, allowNull: true },
        archived_at: { type: Sequelize.DATE, allowNull: true },
      });

      await queryInterface.addConstraint("ai_content_variants", {
        fields: ["content_item_id", "variant_number"],
        type: "unique",
        name: "uq_variant_number",
      });
      await queryInterface.addConstraint("ai_content_variants", {
        fields: ["content_item_id", "content_hash"],
        type: "unique",
        name: "uq_content_hash",
      });
      await queryInterface.addIndex(
        "ai_content_variants",
        ["content_item_id"],
        { name: "idx_variants_item_id" }
      );
      await queryInterface.addIndex("ai_content_variants", ["status"], {
        name: "idx_variants_status",
      });
      await queryInterface.addIndex(
        "ai_content_variants",
        ["template_id"],
        { name: "idx_variants_template" }
      );
      await queryInterface.addIndex(
        "ai_content_variants",
        ["status", "queue_flag"],
        {
          name: "idx_variants_queue",
          where: { status: "queued_for_review" },
        }
      );
    }

    // ── ai_content_reviews ──────────────────────────────────────────────────
    if (!tables.includes("ai_content_reviews")) {
      await queryInterface.createTable("ai_content_reviews", {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal("gen_random_uuid()"),
          primaryKey: true,
        },
        variant_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "ai_content_variants", key: "id" },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
        reviewer_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: "users.id of the admin who reviewed",
        },
        reviewed_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("NOW()"),
        },
        action: {
          type: Sequelize.STRING(30),
          allowNull: false,
          comment: "approved | edited_and_approved | rejected | escalated",
        },
        // Edit tracking — critical for admin_edit_rate signal
        was_edited: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        content_before: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: "Snapshot of content_body before the edit",
        },
        content_after: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: "Snapshot of content_body after the edit",
        },
        edit_char_delta: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: "ABS(len_after - len_before) — rough edit distance proxy",
        },
        rejection_reason: {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: "Required when action=rejected; human-selected reason",
        },
        rejection_note: { type: Sequelize.TEXT, allowNull: true },
      });

      await queryInterface.addIndex("ai_content_reviews", ["variant_id"], {
        name: "idx_reviews_variant_id",
      });
      await queryInterface.addIndex(
        "ai_content_reviews",
        ["reviewer_id"],
        { name: "idx_reviews_reviewer_id" }
      );
      await queryInterface.addIndex("ai_content_reviews", ["action"], {
        name: "idx_reviews_action",
      });
    }
  },

  async down(queryInterface) {
    // Drop in reverse FK dependency order
    const tables = await queryInterface.showAllTables();
    if (tables.includes("ai_content_reviews"))
      await queryInterface.dropTable("ai_content_reviews");
    if (tables.includes("ai_content_variants"))
      await queryInterface.dropTable("ai_content_variants");
    if (tables.includes("ai_content_items"))
      await queryInterface.dropTable("ai_content_items");
  },
};
