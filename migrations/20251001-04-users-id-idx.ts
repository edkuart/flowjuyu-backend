// migrations/20251001-04-users-id-idx.ts

import { QueryInterface } from "sequelize";

module.exports = {
  async up(queryInterface: QueryInterface) {
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS users_id_idx
      ON users (id);
    `);
  },

  async down(queryInterface: QueryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS users_id_idx;
    `);
  },
};
