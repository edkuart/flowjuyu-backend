"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
module.exports = {
    async up(queryInterface) {
        await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS vendedor_perfil_dpi_idx
      ON vendedor_perfil (dpi);
    `);
    },
    async down(queryInterface) {
        await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS vendedor_perfil_dpi_idx;
    `);
    },
};
