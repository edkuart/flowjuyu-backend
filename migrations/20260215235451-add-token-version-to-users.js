"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("users");
    if (columns.token_version) {
      console.log("[migration] token_version already exists on users — skipping");
      return;
    }
    await queryInterface.addColumn("users", "token_version", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    console.log("[migration] added token_version to users");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("users", "token_version");
  },
};
