"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("analytics_events", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      event_name: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      seller_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    await queryInterface.addIndex("analytics_events", ["event_name"], {
      name: "idx_analytics_events_event_name",
    });
    await queryInterface.addIndex("analytics_events", ["created_at"], {
      name: "idx_analytics_events_created_at",
    });
    await queryInterface.addIndex("analytics_events", ["seller_id"], {
      name: "idx_analytics_events_seller_id",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("analytics_events");
  },
};
