'use strict';

/**
 * Adds seller_sku to listing_drafts.
 *
 * This mirrors the opcional seller_sku column in productos and allows
 * sellers to supply their own inventory code during the WhatsApp
 * listing conversation. The value is written to productos.seller_sku
 * at publish time.
 *
 * Safe for existing rows: column is nullable with no default.
 *
 * No uniqueness constraint here — the productos table already enforces
 * the partial unique index (vendedor_id, seller_sku) WHERE seller_sku IS NOT NULL.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('listing_drafts');

    if (!tableDesc.seller_sku) {
      await queryInterface.addColumn('listing_drafts', 'seller_sku', {
        type: Sequelize.STRING(100),
        allowNull: true,
        defaultValue: null,
      });
      console.log('[migration] added seller_sku to listing_drafts');
    } else {
      console.log('[migration] seller_sku already exists on listing_drafts — skipping');
    }
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.removeColumn('listing_drafts', 'seller_sku');
    console.log('[migration] removed seller_sku from listing_drafts');
  },
};
