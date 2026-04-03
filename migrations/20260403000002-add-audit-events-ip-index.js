"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex("audit_events", ["ip_address"], {
      name: "idx_audit_ip_address",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("audit_events", "idx_audit_ip_address");
  },
};
