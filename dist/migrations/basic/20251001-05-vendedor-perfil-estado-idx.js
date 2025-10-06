"use strict";
// migrations/20251001-05-vendedor-perfil-estado-idx.ts
Object.defineProperty(exports, "__esModule", { value: true });
module.exports = {
    async up(queryInterface) {
        await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS vendedor_perfil_estado_idx
      ON vendedor_perfil (estado);
    `);
    },
    async down(queryInterface) {
        await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS vendedor_perfil_estado_idx;
    `);
    },
};
