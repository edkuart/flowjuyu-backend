"use strict";

/**
 * Migration: add-social-links-vendedor-perfil
 *
 * Adds three nullable TEXT columns to `vendedor_perfil`:
 *   - instagram
 *   - facebook
 *   - tiktok
 *
 * Idempotent: each ALTER is guarded by a column-existence check.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("vendedor_perfil");

    if (!table.instagram) {
      await queryInterface.addColumn("vendedor_perfil", "instagram", {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: null,
      });
    }

    if (!table.facebook) {
      await queryInterface.addColumn("vendedor_perfil", "facebook", {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: null,
      });
    }

    if (!table.tiktok) {
      await queryInterface.addColumn("vendedor_perfil", "tiktok", {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("vendedor_perfil");
    if (table.instagram) await queryInterface.removeColumn("vendedor_perfil", "instagram");
    if (table.facebook)  await queryInterface.removeColumn("vendedor_perfil", "facebook");
    if (table.tiktok)    await queryInterface.removeColumn("vendedor_perfil", "tiktok");
  },
};
