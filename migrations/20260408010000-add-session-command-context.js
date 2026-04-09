"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes("conversation_sessions")) {
      const description = await queryInterface.describeTable("conversation_sessions");

      if (!description.command_context_json) {
        await queryInterface.addColumn("conversation_sessions", "command_context_json", {
          type: Sequelize.JSONB,
          allowNull: true,
        });
      }
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes("conversation_sessions")) {
      const description = await queryInterface.describeTable("conversation_sessions");

      if (description.command_context_json) {
        await queryInterface.removeColumn("conversation_sessions", "command_context_json");
      }
    }
  },
};
