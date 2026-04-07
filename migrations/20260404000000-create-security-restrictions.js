"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("security_restrictions", {
      id: {
        type:          Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey:    true,
      },
      subject_type: {
        type:      Sequelize.STRING(20),
        allowNull: false,
      },
      subject_key: {
        type:      Sequelize.STRING(255),
        allowNull: false,
      },
      restriction_type: {
        type:      Sequelize.STRING(40),
        allowNull: false,
      },
      reason: {
        type:      Sequelize.TEXT,
        allowNull: false,
      },
      status: {
        type:         Sequelize.STRING(20),
        allowNull:    false,
        defaultValue: "active",
      },
      expires_at: {
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
    });

    await queryInterface.addIndex(
      "security_restrictions",
      ["subject_type", "subject_key", "status"],
      { name: "idx_sec_restrictions_subject_status" },
    );
    await queryInterface.addIndex(
      "security_restrictions",
      ["restriction_type"],
      { name: "idx_sec_restrictions_type" },
    );
    await queryInterface.addIndex(
      "security_restrictions",
      ["expires_at"],
      { name: "idx_sec_restrictions_expires_at" },
    );
    await queryInterface.addIndex(
      "security_restrictions",
      ["created_at"],
      { name: "idx_sec_restrictions_created_at" },
    );

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_sec_restrictions_active_dedup
      ON security_restrictions (subject_type, subject_key, restriction_type)
      WHERE status = 'active'
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("security_restrictions");
  },
};
