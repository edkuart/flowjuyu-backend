"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("users");

    if (!columns.reset_password_token) {
      await queryInterface.addColumn("users", "reset_password_token", {
        type: Sequelize.STRING,
        allowNull: true,
      });
      console.log("[migration] added reset_password_token to users");
    } else {
      console.log("[migration] reset_password_token already exists on users — skipping");
    }

    if (!columns.reset_password_expires) {
      await queryInterface.addColumn("users", "reset_password_expires", {
        type: Sequelize.DATE,
        allowNull: true,
      });
      console.log("[migration] added reset_password_expires to users");
    } else {
      console.log("[migration] reset_password_expires already exists on users — skipping");
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("users", "reset_password_token");
    await queryInterface.removeColumn("users", "reset_password_expires");
  },
};
