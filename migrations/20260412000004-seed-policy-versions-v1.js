'use strict';

/**
 * Seeds the initial policy versions (v1) into policy_versions.
 *
 * This is reference data, not user data — it belongs in a migration so that
 * every environment (dev, staging, prod) gets the same baseline automatically
 * after running `sequelize db:migrate`.
 *
 * Idempotent: uses INSERT ... ON CONFLICT DO NOTHING so re-running this
 * migration on a DB that already has these rows is safe.
 *
 * content_hash:
 *   Set to NULL intentionally. The real SHA-256 hash of each published
 *   document must be populated by the ops team once the legal documents are
 *   finalised and hosted at their canonical URLs. Procedure:
 *     1. Hash the document: sha256sum terms-v1.html
 *     2. UPDATE policy_versions SET content_hash='<hash>' WHERE id=<id>;
 *
 * URLs:
 *   Replace the placeholder /legal/* paths with the actual canonical URLs
 *   before launching marketing campaigns or processing real user consents.
 *   The frontend legal pages currently carry an explicit "placeholder" notice
 *   (src/app/legal/privacy/page.tsx) — update them in tandem.
 *
 * effective_from:
 *   Set to the migration run timestamp (NOW()) as a conservative default.
 *   Update to the actual go-live date of each document if different.
 */

const SEED_ROWS = [
  {
    policy_type:    'terms',
    version:        'v1',
    label:          'Términos y Condiciones de Uso v1',
    url:            '/legal/terms',
    is_active:      true,
  },
  {
    policy_type:    'privacy',
    version:        'v1',
    label:          'Política de Privacidad v1',
    url:            '/legal/privacy',
    is_active:      true,
  },
  {
    policy_type:    'communications',
    version:        'v1',
    label:          'Política de Comunicaciones y Marketing v1',
    url:            '/legal/communications',
    is_active:      true,
  },
  {
    policy_type:    'kyc_data',
    version:        'v1',
    label:          'Aviso de Tratamiento de Datos KYC v1',
    url:            '/legal/kyc-data',
    is_active:      true,
  },
];

module.exports = {
  async up(queryInterface, _Sequelize) {
    const now = new Date();

    const rows = SEED_ROWS.map((row) => ({
      ...row,
      content_hash:   null,
      effective_from: now,
      created_at:     now,
    }));

    // Insert each row individually so ON CONFLICT targets the composite unique
    // index (policy_type, version) rather than a non-existent named constraint.
    for (const row of rows) {
      await queryInterface.sequelize.query(
        `INSERT INTO policy_versions
           (policy_type, version, label, url, content_hash, effective_from, is_active, created_at)
         VALUES
           (:policy_type, :version, :label, :url, :content_hash, :effective_from, :is_active, :created_at)
         ON CONFLICT (policy_type, version) DO NOTHING`,
        { replacements: row },
      );
    }
  },

  async down(queryInterface, _Sequelize) {
    // Remove only the exact rows this seed inserted — do not wipe the whole table.
    for (const row of SEED_ROWS) {
      await queryInterface.sequelize.query(
        `DELETE FROM policy_versions WHERE policy_type = :policy_type AND version = :version`,
        { replacements: { policy_type: row.policy_type, version: row.version } },
      );
    }
  },
};
