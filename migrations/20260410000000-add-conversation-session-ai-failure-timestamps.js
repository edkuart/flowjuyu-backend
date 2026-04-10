'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableName = 'conversation_sessions';
    const columns = await queryInterface.describeTable(tableName);

    if (!columns.last_failure_at) {
      await queryInterface.addColumn(tableName, 'last_failure_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    if (!columns.last_ai_at) {
      await queryInterface.addColumn(tableName, 'last_ai_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const tableName = 'conversation_sessions';
    const columns = await queryInterface.describeTable(tableName);

    if (columns.last_ai_at) {
      await queryInterface.removeColumn(tableName, 'last_ai_at');
    }

    if (columns.last_failure_at) {
      await queryInterface.removeColumn(tableName, 'last_failure_at');
    }
  },
};
