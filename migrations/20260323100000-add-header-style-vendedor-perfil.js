"use strict";

/**
 * Migration: add-header-style-vendedor-perfil
 *
 * Adds a nullable JSONB column `header_style` to `vendedor_perfil`.
 * Shape: { mode: "gradient"|"image"|"image+overlay", overlay_color?: string, overlay_opacity?: number }
 *
 * Idempotent: guarded by column existence check.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("vendedor_perfil");

    if (!table.header_style) {
      await queryInterface.addColumn("vendedor_perfil", "header_style", {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("vendedor_perfil");
    if (table.header_style) {
      await queryInterface.removeColumn("vendedor_perfil", "header_style");
    }
  },
};
