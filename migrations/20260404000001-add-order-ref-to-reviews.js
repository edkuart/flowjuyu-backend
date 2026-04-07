"use strict";

/**
 * Phase 1 — Reviews Integrity
 *
 * Adds purchase-linkage columns to the reviews table:
 *   order_id      → which order the review came from
 *   order_item_id → which specific line item is being reviewed (unique: 1 review per item)
 *   estado        → lifecycle state ('published' | future: 'flagged' | 'hidden')
 *   updated_at    → timestamp for future edit support
 *
 * Existing rows are left intact with NULL order_id/order_item_id and
 * estado = 'published' (applied via column DEFAULT).
 *
 * The partial unique index on order_item_id enforces one review per
 * purchased item going forward, while allowing legacy rows (NULL) to coexist.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ── order_id ─────────────────────────────────────────────────────────────
    await queryInterface.addColumn("reviews", "order_id", {
      type:      Sequelize.INTEGER,
      allowNull: true,
      references: { model: "orders", key: "id" },
      onDelete:  "SET NULL",
      onUpdate:  "CASCADE",
    });

    // ── order_item_id ─────────────────────────────────────────────────────────
    await queryInterface.addColumn("reviews", "order_item_id", {
      type:      Sequelize.INTEGER,
      allowNull: true,
      references: { model: "order_items", key: "id" },
      onDelete:  "SET NULL",
      onUpdate:  "CASCADE",
    });

    // ── estado ────────────────────────────────────────────────────────────────
    await queryInterface.addColumn("reviews", "estado", {
      type:         Sequelize.STRING(20),
      allowNull:    false,
      defaultValue: "published",
    });

    // ── updated_at ────────────────────────────────────────────────────────────
    await queryInterface.addColumn("reviews", "updated_at", {
      type:      Sequelize.DATE,
      allowNull: true,
    });

    // ── Indexes ───────────────────────────────────────────────────────────────

    // Partial unique index: one review per order_item (only for non-NULL rows)
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_reviews_order_item_id_unique
        ON reviews (order_item_id)
       WHERE order_item_id IS NOT NULL
    `);

    await queryInterface.addIndex("reviews", ["order_id"], {
      name: "idx_reviews_order_id",
    });

    await queryInterface.addIndex("reviews", ["estado"], {
      name: "idx_reviews_estado",
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS idx_reviews_order_item_id_unique`
    );
    await queryInterface.removeIndex("reviews", "idx_reviews_order_id");
    await queryInterface.removeIndex("reviews", "idx_reviews_estado");

    await queryInterface.removeColumn("reviews", "updated_at");
    await queryInterface.removeColumn("reviews", "estado");
    await queryInterface.removeColumn("reviews", "order_item_id");
    await queryInterface.removeColumn("reviews", "order_id");
  },
};
