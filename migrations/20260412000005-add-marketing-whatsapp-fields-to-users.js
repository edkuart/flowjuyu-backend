'use strict';

const COLUMNS = [
  ['marketing_whatsapp',    { type: 'BOOLEAN',     allowNull: false, defaultValue: false }],
  ['marketing_whatsapp_at', { type: 'TIMESTAMPTZ', allowNull: true }],
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const existing = await queryInterface.describeTable('users');

    for (const [column, opts] of COLUMNS) {
      if (existing[column]) {
        console.log(`[migration] users.${column} already exists — skipping`);
        continue;
      }

      let sequelizeType;
      if (opts.type === 'BOOLEAN') sequelizeType = Sequelize.BOOLEAN;
      else if (opts.type === 'TIMESTAMPTZ') sequelizeType = Sequelize.DATE;
      else sequelizeType = Sequelize.STRING;

      const colDef = {
        type: sequelizeType,
        allowNull: opts.allowNull,
      };

      if (Object.prototype.hasOwnProperty.call(opts, 'defaultValue')) {
        colDef.defaultValue = opts.defaultValue;
      }

      await queryInterface.addColumn('users', column, colDef);
    }
  },

  async down(queryInterface, _Sequelize) {
    const existing = await queryInterface.describeTable('users');

    for (const [column] of [...COLUMNS].reverse()) {
      if (existing[column]) {
        await queryInterface.removeColumn('users', column);
      }
    }
  },
};
