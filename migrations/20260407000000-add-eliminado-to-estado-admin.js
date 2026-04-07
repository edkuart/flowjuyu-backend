"use strict";

/**
 * Migration: add-eliminado-to-estado-admin
 *
 * Expands the CHECK constraint on vendedor_perfil.estado_admin to allow
 * the new 'eliminado' state required for logical seller deletion.
 *
 * up:   drops vendedor_estado_admin_check, recreates it with 'eliminado' included
 * down: drops the expanded constraint, restores the original three-value constraint
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE vendedor_perfil
        DROP CONSTRAINT IF EXISTS vendedor_estado_admin_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE vendedor_perfil
        ADD CONSTRAINT vendedor_estado_admin_check
        CHECK (estado_admin IN ('activo', 'inactivo', 'suspendido', 'eliminado'));
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE vendedor_perfil
        DROP CONSTRAINT IF EXISTS vendedor_estado_admin_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE vendedor_perfil
        ADD CONSTRAINT vendedor_estado_admin_check
        CHECK (estado_admin IN ('activo', 'inactivo', 'suspendido'));
    `);
  },
};
