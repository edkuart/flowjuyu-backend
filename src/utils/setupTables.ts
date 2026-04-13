// src/utils/setupTables.ts
// Creates Phase 2 tables on startup if they don't exist.
// Each statement is isolated: one failure never prevents others from running.

import { sequelize } from "../config/db";

async function run(label: string, sql: string): Promise<void> {
  try {
    await sequelize.query(sql);
    console.log(`  ✅ ${label}`);
  } catch (err: any) {
    // 42P07 = duplicate_table, 42P06 = duplicate_schema — safe to ignore
    if (err?.original?.code === "42P07") {
      console.log(`  ✓  ${label} (already exists)`);
    } else {
      console.error(`  ❌ ${label}:`, err?.original?.message ?? err?.message ?? err);
    }
  }
}

export async function setupPhase2Tables(): Promise<void> {
  console.log("🔧 setupPhase2Tables: checking tables...");

  // ── reviews ──────────────────────────────────────────────────────────────
  await run(
    "reviews table",
    `
    CREATE TABLE IF NOT EXISTS reviews (
      id          SERIAL       PRIMARY KEY,
      seller_id   INTEGER      NOT NULL,
      product_id  UUID,
      buyer_id    INTEGER,
      buyer_name  VARCHAR(100) NOT NULL DEFAULT 'Comprador',
      rating      INTEGER      NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment     TEXT,
      created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
    )
    `
  );

  await run(
    "reviews index",
    `CREATE INDEX IF NOT EXISTS idx_reviews_seller_id ON reviews (seller_id)`
  );

  // ── whatsapp_clicks ───────────────────────────────────────────────────────
  await run(
    "whatsapp_clicks table",
    `
    CREATE TABLE IF NOT EXISTS whatsapp_clicks (
      id          SERIAL       PRIMARY KEY,
      seller_id   INTEGER      NOT NULL,
      product_id  UUID,
      session_id  VARCHAR(255),
      ip_address  VARCHAR(64),
      created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
    )
    `
  );

  await run(
    "whatsapp_clicks index",
    `CREATE INDEX IF NOT EXISTS idx_wa_clicks_seller_id ON whatsapp_clicks (seller_id)`
  );

  // ── favorites ─────────────────────────────────────────────────────────────
  await run(
    "favorites table",
    `
    CREATE TABLE IF NOT EXISTS favorites (
      id          SERIAL    PRIMARY KEY,
      user_id     INTEGER   NOT NULL REFERENCES users(id)            ON DELETE CASCADE,
      product_id  UUID                REFERENCES productos(id)       ON DELETE CASCADE,
      seller_id   INTEGER             REFERENCES vendedor_perfil(id) ON DELETE CASCADE,
      created_at  TIMESTAMP NOT NULL  DEFAULT NOW(),
      CONSTRAINT favorites_user_product UNIQUE (user_id, product_id),
      CONSTRAINT favorites_user_seller  UNIQUE (user_id, seller_id)
    )
    `
  );

  await run(
    "favorites index",
    `CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites (user_id)`
  );

  // ── notifications ────────────────────────────────────────────────────────
  await run(
    "notifications table",
    `
    CREATE TABLE IF NOT EXISTS notifications (
      id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        VARCHAR(50)  NOT NULL DEFAULT 'general',
      title       VARCHAR(255) NOT NULL,
      message     TEXT         NOT NULL,
      link        VARCHAR(500),
      is_read     BOOLEAN      NOT NULL DEFAULT false,
      created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
    )
    `
  );

  await run(
    "notifications index user_id",
    `CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id)`
  );

  await run(
    "notifications index unread",
    `CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id, is_read) WHERE is_read = false`
  );

  console.log("🔧 setupPhase2Tables: done.");
}

export async function setupConsentTables(): Promise<void> {
  console.log("🔧 setupConsentTables: checking tables...");

  await run(
    "policy_versions table",
    `
    CREATE TABLE IF NOT EXISTS policy_versions (
      id             SERIAL PRIMARY KEY,
      policy_type    VARCHAR(50)  NOT NULL,
      version        VARCHAR(20)  NOT NULL,
      label          VARCHAR(200) NOT NULL,
      url            VARCHAR(500) NOT NULL,
      content_hash   VARCHAR(64),
      effective_from TIMESTAMP    NOT NULL,
      is_active      BOOLEAN      NOT NULL DEFAULT false,
      created_at     TIMESTAMP    NOT NULL DEFAULT NOW()
    )
    `
  );

  await run(
    "policy_versions index policy_type",
    `CREATE INDEX IF NOT EXISTS policy_versions_policy_type_idx ON policy_versions (policy_type)`
  );

  await run(
    "policy_versions unique version",
    `CREATE UNIQUE INDEX IF NOT EXISTS policy_versions_policy_type_version_key ON policy_versions (policy_type, version)`
  );

  await run(
    "policy_versions one active per type",
    `
    CREATE UNIQUE INDEX IF NOT EXISTS policy_versions_one_active_per_type
    ON policy_versions (policy_type)
    WHERE is_active = true
    `
  );

  await run(
    "policy_versions seed terms",
    `
    INSERT INTO policy_versions
      (policy_type, version, label, url, content_hash, effective_from, is_active, created_at)
    VALUES
      ('terms', 'v1', 'Términos y Condiciones de Uso v1', '/legal/terms', NULL, NOW(), true, NOW())
    ON CONFLICT (policy_type, version) DO NOTHING
    `
  );

  await run(
    "policy_versions seed privacy",
    `
    INSERT INTO policy_versions
      (policy_type, version, label, url, content_hash, effective_from, is_active, created_at)
    VALUES
      ('privacy', 'v1', 'Política de Privacidad v1', '/legal/privacy', NULL, NOW(), true, NOW())
    ON CONFLICT (policy_type, version) DO NOTHING
    `
  );

  await run(
    "policy_versions seed communications",
    `
    INSERT INTO policy_versions
      (policy_type, version, label, url, content_hash, effective_from, is_active, created_at)
    VALUES
      ('communications', 'v1', 'Política de Comunicaciones y Marketing v1', '/legal/communications', NULL, NOW(), true, NOW())
    ON CONFLICT (policy_type, version) DO NOTHING
    `
  );

  await run(
    "policy_versions seed kyc_data",
    `
    INSERT INTO policy_versions
      (policy_type, version, label, url, content_hash, effective_from, is_active, created_at)
    VALUES
      ('kyc_data', 'v1', 'Aviso de Tratamiento de Datos KYC v1', '/legal/kyc-data', NULL, NOW(), true, NOW())
    ON CONFLICT (policy_type, version) DO NOTHING
    `
  );

  await run(
    "user_consents table",
    `
    CREATE TABLE IF NOT EXISTS user_consents (
      id                BIGSERIAL PRIMARY KEY,
      user_id           INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      policy_version_id INTEGER     NOT NULL REFERENCES policy_versions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      granted           BOOLEAN     NOT NULL,
      ip_address        VARCHAR(45),
      user_agent        TEXT,
      source            VARCHAR(50),
      created_at        TIMESTAMP   NOT NULL DEFAULT NOW()
    )
    `
  );

  await run(
    "user_consents index user_id",
    `CREATE INDEX IF NOT EXISTS user_consents_user_id_idx ON user_consents (user_id)`
  );

  await run(
    "user_consents index policy_version_id",
    `CREATE INDEX IF NOT EXISTS user_consents_policy_version_id_idx ON user_consents (policy_version_id)`
  );

  await run(
    "user_consents index user_id_created_at",
    `CREATE INDEX IF NOT EXISTS user_consents_user_id_created_at_idx ON user_consents (user_id, created_at)`
  );

  await run(
    "current_consents view drop",
    `DROP VIEW IF EXISTS current_consents`
  );

  await run(
    "current_consents view create",
    `
    CREATE VIEW current_consents AS
    SELECT DISTINCT ON (uc.user_id, pv.policy_type)
      uc.id,
      uc.user_id,
      pv.policy_type,
      pv.version,
      pv.id AS policy_version_id,
      uc.granted,
      uc.source,
      uc.ip_address,
      uc.created_at
    FROM user_consents uc
    JOIN policy_versions pv ON pv.id = uc.policy_version_id
    ORDER BY uc.user_id, pv.policy_type, uc.created_at DESC, uc.id DESC
    `
  );

  console.log("🔧 setupConsentTables: done.");
}
