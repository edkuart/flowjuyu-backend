'use strict';

/**
 * Adds structured identity verification fields to vendedor_perfil so the
 * backend can keep KYC evidence, provider state, and decision rationale.
 *
 * Columns:
 *   kyc_provider         — internal/external engine name
 *   kyc_provider_status  — provider workflow state
 *   kyc_decision_reason  — top-level reason for current KYC decision
 *   kyc_evidence         — structured signals, matches, missing capabilities
 *   kyc_verified_at      — timestamp when strong automated verification passed
 */

const COLUMNS = [
  ['kyc_provider',        { type: 'VARCHAR(80)', allowNull: true }],
  ['kyc_provider_status', { type: 'VARCHAR(40)', allowNull: true }],
  ['kyc_decision_reason', { type: 'TEXT',        allowNull: true }],
  ['kyc_evidence',        { type: 'JSONB',       allowNull: false, defaultValue: {} }],
  ['kyc_verified_at',     { type: 'TIMESTAMPTZ', allowNull: true }],
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const existing = await queryInterface.describeTable('vendedor_perfil');

    for (const [column, opts] of COLUMNS) {
      if (existing[column]) {
        console.log(`[migration] vendedor_perfil.${column} already exists — skipping`);
        continue;
      }

      let sequelizeType;
      if (opts.type === 'VARCHAR(80)')      sequelizeType = Sequelize.STRING(80);
      else if (opts.type === 'VARCHAR(40)') sequelizeType = Sequelize.STRING(40);
      else if (opts.type === 'TEXT')        sequelizeType = Sequelize.TEXT;
      else if (opts.type === 'JSONB')       sequelizeType = Sequelize.JSONB;
      else if (opts.type === 'TIMESTAMPTZ') sequelizeType = Sequelize.DATE;
      else                                  sequelizeType = Sequelize.STRING;

      const colDef = {
        type: sequelizeType,
        allowNull: opts.allowNull,
      };

      if (Object.prototype.hasOwnProperty.call(opts, 'defaultValue')) {
        colDef.defaultValue = opts.defaultValue;
      }

      await queryInterface.addColumn('vendedor_perfil', column, colDef);
    }
  },

  async down(queryInterface) {
    const existing = await queryInterface.describeTable('vendedor_perfil');

    for (const [column] of [...COLUMNS].reverse()) {
      if (existing[column]) {
        await queryInterface.removeColumn('vendedor_perfil', column);
      }
    }
  },
};
