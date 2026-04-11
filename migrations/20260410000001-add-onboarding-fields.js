'use strict';

/**
 * Adds onboarding tracking fields to vendedor_perfil
 * and the is_onboarding_draft flag to listing_drafts.
 *
 * Uses STRING (not ENUM) to match the existing pattern for estado_validacion
 * and estado_admin in vendedor_perfil.
 *
 * Safe for existing rows: all new columns have defaults or allow NULL,
 * so no existing data is touched. Existing vendors with products are
 * backfilled to ACTIVATED; the rest to SELLER_REGISTERED.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {

      // ── vendedor_perfil ─────────────────────────────────────────────────────

      await queryInterface.addColumn('vendedor_perfil', 'onboarding_state', {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'NEW_USER',
      }, { transaction: t });

      await queryInterface.addColumn('vendedor_perfil', 'onboarding_completed_at', {
        type: Sequelize.DATE,
        allowNull: true,
      }, { transaction: t });

      // UUID without FK constraint — the product may not exist at migration time.
      await queryInterface.addColumn('vendedor_perfil', 'first_product_id', {
        type: Sequelize.UUID,
        allowNull: true,
      }, { transaction: t });

      await queryInterface.addColumn('vendedor_perfil', 'activation_at', {
        type: Sequelize.DATE,
        allowNull: true,
      }, { transaction: t });

      // ── listing_drafts ──────────────────────────────────────────────────────

      await queryInterface.addColumn('listing_drafts', 'is_onboarding_draft', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      }, { transaction: t });

      // ── Backfill existing vendors ───────────────────────────────────────────
      // Vendors with at least one product → ACTIVATED
      await queryInterface.sequelize.query(`
        UPDATE vendedor_perfil vp
        SET
          onboarding_state        = 'ACTIVATED',
          activation_at           = vp."createdAt",
          onboarding_completed_at = vp."createdAt"
        WHERE EXISTS (
          SELECT 1 FROM productos p
          WHERE p.vendedor_id = vp.id
          LIMIT 1
        )
      `, { transaction: t });

      // Remaining vendors (no products) → SELLER_REGISTERED
      await queryInterface.sequelize.query(`
        UPDATE vendedor_perfil
        SET onboarding_state = 'SELLER_REGISTERED'
        WHERE onboarding_state = 'NEW_USER'
      `, { transaction: t });
    });
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.removeColumn('listing_drafts', 'is_onboarding_draft', { transaction: t });
      await queryInterface.removeColumn('vendedor_perfil', 'activation_at', { transaction: t });
      await queryInterface.removeColumn('vendedor_perfil', 'first_product_id', { transaction: t });
      await queryInterface.removeColumn('vendedor_perfil', 'onboarding_completed_at', { transaction: t });
      await queryInterface.removeColumn('vendedor_perfil', 'onboarding_state', { transaction: t });
    });
  },
};
