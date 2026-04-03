"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_sec_alerts_active_dedup
      ON security_alerts (type, subject_type, subject_key)
      WHERE status IN ('open', 'acknowledged')
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS idx_sec_alerts_active_dedup`
    );
  },
};
