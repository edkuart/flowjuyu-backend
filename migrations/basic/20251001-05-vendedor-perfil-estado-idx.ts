// migrations/20251001-05-vendedor-perfil-estado-idx.ts

import { QueryInterface } from "sequelize";

module.exports = {
  async up(queryInterface: QueryInterface) {
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS vendedor_perfil_estado_idx
      ON vendedor_perfil (estado);
    `);
  },

  async down(queryInterface: QueryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS vendedor_perfil_estado_idx;
    `);
  },
};
