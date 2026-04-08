"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes("conversation_sessions")) {
      const description = await queryInterface.describeTable("conversation_sessions");

      if (!description.expected_input_type) {
        await queryInterface.addColumn("conversation_sessions", "expected_input_type", {
          type: Sequelize.STRING(20),
          allowNull: true,
        });
      }
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes("conversation_sessions")) {
      const description = await queryInterface.describeTable("conversation_sessions");
      if (description.expected_input_type) {
        await queryInterface.removeColumn("conversation_sessions", "expected_input_type");
      }
    }
  },
};
