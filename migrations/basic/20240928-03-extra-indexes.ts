import { QueryInterface } from "sequelize";

module.exports = {
  async up(queryInterface: QueryInterface) {
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS vendedor_perfil_dpi_idx
      ON vendedor_perfil (dpi);
    `);
  },

  async down(queryInterface: QueryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS vendedor_perfil_dpi_idx;
    `);
  },
};
