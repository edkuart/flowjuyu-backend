// migrations/20251001-06-vendedor-perfil-estado-default.ts

import { QueryInterface } from "sequelize";

module.exports = {
  async up(queryInterface: QueryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE vendedor_perfil
      ALTER COLUMN estado SET DEFAULT 'pendiente';
    `);
  },

  async down(queryInterface: QueryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE vendedor_perfil
      ALTER COLUMN estado DROP DEFAULT;
    `);
  },
};
