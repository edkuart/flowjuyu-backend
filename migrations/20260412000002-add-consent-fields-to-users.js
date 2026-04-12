'use strict';

/**
 * Adds denormalized consent fast-access flags to the users table.
 *
 * Why denormalized?
 *   Auth middleware and most request handlers need to know "has this user
 *   accepted current terms?" in a single row read. Joining user_consents on
 *   every authenticated request is expensive. These flags are the cache;
 *   user_consents is the authoritative log.
 *
 * Consistency rule (enforced in the consent service, not here):
 *   Whenever a row is inserted into user_consents, the corresponding flag on
 *   users must be updated in the same transaction. Divergence = bug.
 *
 * Columns added (10):
 *   terms_current                    — user has accepted the currently active T&C
 *   terms_version                    — which version they accepted ('v1', 'v2', …)
 *   terms_accepted_at                — timestamp of acceptance
 *   privacy_current                  — user has accepted the current Privacy Policy
 *   privacy_version                  — which version they accepted
 *   privacy_accepted_at              — timestamp of acceptance
 *   marketing_email                  — opted in to marketing emails
 *   marketing_email_at               — timestamp of opt-in/opt-out
 *   data_processing_acknowledged     — acknowledged data processing notice
 *   data_processing_acknowledged_at  — timestamp of acknowledgement
 *
 * Safe for existing rows:
 *   All boolean flags default to false; all timestamps and version strings
 *   default to NULL. No existing row is touched by this migration.
 *
 * Note on terms_accepted_at / terms_version:
 *   The frontend has been sending these fields since launch (see
 *   src/app/api/auth/register/buyer/route.ts and LEGAL_TERMS_VERSION = 'v1')
 *   but the backend discarded them silently because the columns didn't exist.
 *   These columns make that data-capture retroactively meaningful for new
 *   registrations. Existing users have NULL — backfill is a separate task.
 */

const COLUMNS = [
  ['terms_current',                   { type: 'BOOLEAN',     allowNull: false, defaultValue: false }],
  ['terms_version',                   { type: 'VARCHAR(20)', allowNull: true }],
  ['terms_accepted_at',               { type: 'TIMESTAMPTZ', allowNull: true }],
  ['privacy_current',                 { type: 'BOOLEAN',     allowNull: false, defaultValue: false }],
  ['privacy_version',                 { type: 'VARCHAR(20)', allowNull: true }],
  ['privacy_accepted_at',             { type: 'TIMESTAMPTZ', allowNull: true }],
  ['marketing_email',                 { type: 'BOOLEAN',     allowNull: false, defaultValue: false }],
  ['marketing_email_at',              { type: 'TIMESTAMPTZ', allowNull: true }],
  ['data_processing_acknowledged',    { type: 'BOOLEAN',     allowNull: false, defaultValue: false }],
  ['data_processing_acknowledged_at', { type: 'TIMESTAMPTZ', allowNull: true }],
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const existing = await queryInterface.describeTable('users');

    for (const [column, opts] of COLUMNS) {
      if (existing[column]) {
        // Idempotency guard — skip if already present (e.g. manual hotfix)
        console.log(`[migration] users.${column} already exists — skipping`);
        continue;
      }

      // Resolve type string to Sequelize DataType
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

      await queryInterface.addColumn('users', column, colDef);
    }
  },

  async down(queryInterface, _Sequelize) {
    const existing = await queryInterface.describeTable('users');

    // Remove in reverse order
    for (const [column] of [...COLUMNS].reverse()) {
      if (existing[column]) {
        await queryInterface.removeColumn('users', column);
      }
    }
  },
};
