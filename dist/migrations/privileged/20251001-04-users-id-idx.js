"use strict";
// migrations/20251001-04-users-id-idx.ts
Object.defineProperty(exports, "__esModule", { value: true });
module.exports = {
    async up(queryInterface) {
        await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS users_id_idx
      ON users (id);
    `);
    },
    async down(queryInterface) {
        await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS users_id_idx;
    `);
    },
};
