"use strict";
// migrations/20251001-06-vendedor-perfil-estado-default.ts
Object.defineProperty(exports, "__esModule", { value: true });
module.exports = {
    async up(queryInterface) {
        await queryInterface.sequelize.query(`
      ALTER TABLE vendedor_perfil
      ALTER COLUMN estado SET DEFAULT 'pendiente';
    `);
    },
    async down(queryInterface) {
        await queryInterface.sequelize.query(`
      ALTER TABLE vendedor_perfil
      ALTER COLUMN estado DROP DEFAULT;
    `);
    },
};
