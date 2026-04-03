"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("security_alerts", {
      id: {
        type:          Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey:    true,
        allowNull:     false,
      },
      type: {
        type:      Sequelize.STRING(100),
        allowNull: false,
      },
      severity: {
        type:      Sequelize.STRING(20),
        allowNull: false,
      },
      subject_type: {
        type:      Sequelize.STRING(50),
        allowNull: false,
      },
      subject_key: {
        type:      Sequelize.STRING(255),
        allowNull: false,
      },
      status: {
        type:         Sequelize.STRING(20),
        allowNull:    false,
        defaultValue: "open",
      },
      title: {
        type:      Sequelize.STRING(255),
        allowNull: false,
      },
      description: {
        type:      Sequelize.TEXT,
        allowNull: false,
      },
      metadata: {
        type:      Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type:         Sequelize.DATE,
        allowNull:    false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      resolved_at: {
        type:      Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addIndex("security_alerts", ["status"],                      { name: "idx_sec_alerts_status" });
    await queryInterface.addIndex("security_alerts", ["severity"],                    { name: "idx_sec_alerts_severity" });
    await queryInterface.addIndex("security_alerts", ["type"],                        { name: "idx_sec_alerts_type" });
    await queryInterface.addIndex("security_alerts", ["subject_type", "subject_key"], { name: "idx_sec_alerts_subject" });
    await queryInterface.addIndex("security_alerts", ["created_at"],                  { name: "idx_sec_alerts_created_at" });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("security_alerts");
  },
};
