'use strict';

/**
 * Adds seller-specific consent fields to vendedor_perfil.
 *
 * Why separate from users?
 *   - kyc_data_consent is legally distinct from the general T&C: it covers
 *     the specific use of DPI images and biometric data for KYC verification.
 *     Sellers must give explicit, separate consent for this before uploading
 *     identity documents.
 *   - whatsapp_marketing is a seller-only channel; buyers use email marketing
 *     tracked on the users table.
 *
 * Columns added (5):
 *   kyc_data_consent         — explicit consent to process KYC/biometric data
 *   kyc_data_consent_at      — timestamp of consent
 *   kyc_data_consent_version — policy version the seller consented to ('v1', …)
 *   whatsapp_marketing       — opted in to WhatsApp marketing messages
 *   whatsapp_marketing_at    — timestamp of opt-in/opt-out
 *
 * Safe for existing rows:
 *   All boolean flags default to false; timestamps and version strings
 *   default to NULL. No existing vendedor_perfil row is touched.
 *
 * Enforcement note:
 *   The KYC upload endpoint (POST /api/seller/kyc/submit) should verify
 *   kyc_data_consent = true before accepting any identity documents.
 *   That guard is NOT added here — this migration is schema-only.
 */

const COLUMNS = [
  ['kyc_data_consent',         { type: 'BOOLEAN',     allowNull: false, defaultValue: false }],
  ['kyc_data_consent_at',      { type: 'TIMESTAMPTZ', allowNull: true }],
  ['kyc_data_consent_version', { type: 'VARCHAR(20)', allowNull: true }],
  ['whatsapp_marketing',       { type: 'BOOLEAN',     allowNull: false, defaultValue: false }],
  ['whatsapp_marketing_at',    { type: 'TIMESTAMPTZ', allowNull: true }],
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
      if (opts.type === 'BOOLEAN')       sequelizeType = Sequelize.BOOLEAN;
      else if (opts.type === 'VARCHAR(20)') sequelizeType = Sequelize.STRING(20);
      else if (opts.type === 'TIMESTAMPTZ') sequelizeType = Sequelize.DATE;
      else                               sequelizeType = Sequelize.STRING;

      const colDef = {
        type:      sequelizeType,
        allowNull: opts.allowNull,
      };
      if (Object.prototype.hasOwnProperty.call(opts, 'defaultValue')) {
        colDef.defaultValue = opts.defaultValue;
      }

      await queryInterface.addColumn('vendedor_perfil', column, colDef);
    }
  },

  async down(queryInterface, _Sequelize) {
    const existing = await queryInterface.describeTable('vendedor_perfil');

    for (const [column] of [...COLUMNS].reverse()) {
      if (existing[column]) {
        await queryInterface.removeColumn('vendedor_perfil', column);
      }
    }
  },
};
