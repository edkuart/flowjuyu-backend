"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("security_profiles", {
      id: {
        type:          Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey:    true,
        allowNull:     false,
      },
      subject_type: {
        type:      Sequelize.STRING(20),
        allowNull: false,
      },
      subject_key: {
        type:      Sequelize.STRING(255),
        allowNull: false,
      },
      trust_score: {
        type:         Sequelize.INTEGER,
        allowNull:    false,
        defaultValue: 50,
      },
      risk_score: {
        type:         Sequelize.INTEGER,
        allowNull:    false,
        defaultValue: 0,
      },
      financial_risk_score: {
        type:         Sequelize.INTEGER,
        allowNull:    false,
        defaultValue: 0,
      },
      status: {
        type:         Sequelize.STRING(20),
        allowNull:    false,
        defaultValue: "active",
      },
      last_evaluated_at: {
        type:      Sequelize.DATE,
        allowNull: true,
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
      updated_at: {
        type:         Sequelize.DATE,
        allowNull:    false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    await queryInterface.addIndex(
      "security_profiles",
      ["subject_type", "subject_key"],
      { unique: true, name: "idx_sp_subject" },
    );
    await queryInterface.addIndex("security_profiles", ["status"],               { name: "idx_sp_status" });
    await queryInterface.addIndex("security_profiles", ["financial_risk_score"], { name: "idx_sp_financial_risk" });
    await queryInterface.addIndex("security_profiles", ["last_evaluated_at"],    { name: "idx_sp_last_evaluated" });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("security_profiles");
  },
};
