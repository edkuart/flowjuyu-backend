"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
module.exports = {
    async up(queryInterface) {
        await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_correo_lower_uniq
      ON users ((lower(correo)));
    `);
        await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS users_correo_lower_idx
      ON users ((lower(correo)));
    `);
    },
    async down(queryInterface) {
        await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS users_correo_lower_uniq;
    `);
        await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS users_correo_lower_idx;
    `);
    },
};
