"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes("listing_drafts")) {
      const description = await queryInterface.describeTable("listing_drafts");

      if (!description.vision_suggestions_json) {
        await queryInterface.addColumn("listing_drafts", "vision_suggestions_json", {
          type: Sequelize.JSONB,
          allowNull: true,
        });
      }
    }
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();

    if (tables.includes("listing_drafts")) {
      const description = await queryInterface.describeTable("listing_drafts");

      if (description.vision_suggestions_json) {
        await queryInterface.removeColumn("listing_drafts", "vision_suggestions_json");
      }
    }
  },
};
