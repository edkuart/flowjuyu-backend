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

  await run(
    "whatsapp_unlinked_seller_attempts table",
    `
    CREATE TABLE IF NOT EXISTS whatsapp_unlinked_seller_attempts (
      id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id      UUID,
      seller_user_id  INTEGER      REFERENCES users(id) ON DELETE SET NULL,
      phone_e164      VARCHAR(20)  NOT NULL,
      wa_message_id   VARCHAR(255) NOT NULL UNIQUE,
      message_type    VARCHAR(30)  NOT NULL,
      message_preview VARCHAR(280),
      reason          VARCHAR(50)  NOT NULL,
      metadata        JSONB,
      created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
    )
    `
  );

  await run(
    "whatsapp_unlinked_seller_attempts index seller",
    `CREATE INDEX IF NOT EXISTS idx_wa_unlinked_attempts_seller ON whatsapp_unlinked_seller_attempts (seller_user_id)`
  );

  await run(
    "whatsapp_unlinked_seller_attempts index phone",
    `CREATE INDEX IF NOT EXISTS idx_wa_unlinked_attempts_phone ON whatsapp_unlinked_seller_attempts (phone_e164)`
  );

  await run(
    "whatsapp_unlinked_seller_attempts index reason",
    `CREATE INDEX IF NOT EXISTS idx_wa_unlinked_attempts_reason ON whatsapp_unlinked_seller_attempts (reason)`
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

  // ── notifications: engagement extension ──────────────────────────────────
  // All columns are nullable (or have safe defaults) so existing rows are
  // unaffected. ADD COLUMN IF NOT EXISTS is a no-op when columns exist.

  await run(
    "notifications col metadata",
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata     JSONB`
  );

  await run(
    "notifications col actor_id",
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_id     INTEGER`
  );

  await run(
    "notifications col actor_type",
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_type   VARCHAR(20)`
  );

  await run(
    "notifications col subject_type",
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS subject_type VARCHAR(30)`
  );

  await run(
    "notifications col subject_id",
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS subject_id   VARCHAR(50)`
  );

  // is_feed_item defaults false → existing rows stay out of the feed
  await run(
    "notifications col is_feed_item",
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_feed_item BOOLEAN NOT NULL DEFAULT false`
  );

  // channel defaults 'ui' → existing rows were all UI-only
  await run(
    "notifications col channel",
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS channel      VARCHAR(20) NOT NULL DEFAULT 'ui'`
  );

  // Partial index: only covers feed rows → small and fast
  await run(
    "notifications index feed",
    `CREATE INDEX IF NOT EXISTS idx_notifications_feed ON notifications (user_id, created_at DESC) WHERE is_feed_item = true`
  );

  // ── seller_follows ────────────────────────────────────────────────────────
  await run(
    "seller_follows table",
    `
    CREATE TABLE IF NOT EXISTS seller_follows (
      id                    UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
      follower_user_id      INTEGER   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seller_user_id        INTEGER   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notifications_enabled BOOLEAN   NOT NULL DEFAULT true,
      created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT seller_follows_unique UNIQUE (follower_user_id, seller_user_id),
      CONSTRAINT no_self_follow        CHECK  (follower_user_id <> seller_user_id)
    )
    `
  );

  // Fan-out hot path: "dame todos los followers de este seller con notifs activas"
  await run(
    "seller_follows index seller",
    `CREATE INDEX IF NOT EXISTS idx_seller_follows_seller ON seller_follows (seller_user_id, notifications_enabled)`
  );

  // Buyer list: "¿a quién sigo yo?"
  await run(
    "seller_follows index follower",
    `CREATE INDEX IF NOT EXISTS idx_seller_follows_follower ON seller_follows (follower_user_id)`
  );

  // ── vendedor_perfil: live columns ─────────────────────────────────────────
  // is_live defaults false → existing sellers start offline.
  // live_started_at is nullable → no data loss on existing rows.
  await run(
    "vendedor_perfil col is_live",
    `ALTER TABLE vendedor_perfil ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT false`
  );

  await run(
    "vendedor_perfil col live_started_at",
    `ALTER TABLE vendedor_perfil ADD COLUMN IF NOT EXISTS live_started_at TIMESTAMP NULL`
  );

  await run(
    "vendedor_perfil col live_message",
    `ALTER TABLE vendedor_perfil ADD COLUMN IF NOT EXISTS live_message VARCHAR(160) NULL`
  );

  await run(
    "vendedor_perfil col live_featured_product_ids",
    `ALTER TABLE vendedor_perfil ADD COLUMN IF NOT EXISTS live_featured_product_ids JSONB`
  );

  await run(
    "vendedor_perfil col live_current_product_id",
    `ALTER TABLE vendedor_perfil ADD COLUMN IF NOT EXISTS live_current_product_id UUID NULL`
  );

  console.log("🔧 setupPhase2Tables: done.");
}

export async function setupCollectionTables(): Promise<void> {
  console.log("🔧 setupCollectionTables: checking tables...");

  // ── collections ───────────────────────────────────────────────────────────
  await run(
    "collections table",
    `
    CREATE TABLE IF NOT EXISTS collections (
      id                   SERIAL        PRIMARY KEY,
      seller_id            INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name                 VARCHAR(120)  NOT NULL,
      description          TEXT,
      background_color     VARCHAR(20)   NOT NULL DEFAULT '#FFFFFF',
      background_image_url TEXT,
      canvas_width         INTEGER       NOT NULL DEFAULT 800,
      canvas_height        INTEGER       NOT NULL DEFAULT 600,
      status               VARCHAR(20)   NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
      created_at           TIMESTAMP     NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMP     NOT NULL DEFAULT NOW()
    )
    `
  );

  await run(
    "collections index seller_id",
    `CREATE INDEX IF NOT EXISTS idx_collections_seller_id ON collections (seller_id)`
  );

  await run(
    "collections index status",
    `CREATE INDEX IF NOT EXISTS idx_collections_status ON collections (seller_id, status)`
  );

  // ── collection_items ──────────────────────────────────────────────────────
  await run(
    "collection_items table",
    `
    CREATE TABLE IF NOT EXISTS collection_items (
      id             SERIAL    PRIMARY KEY,
      collection_id  INTEGER   NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      product_id     UUID      NOT NULL REFERENCES productos(id)   ON DELETE CASCADE,
      pos_x          FLOAT     NOT NULL DEFAULT 0,
      pos_y          FLOAT     NOT NULL DEFAULT 0,
      width          FLOAT     NOT NULL DEFAULT 150,
      height         FLOAT     NOT NULL DEFAULT 150,
      z_index        INTEGER   NOT NULL DEFAULT 0,
      created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
    )
    `
  );

  await run(
    "collection_items index collection_id",
    `CREATE INDEX IF NOT EXISTS idx_collection_items_collection_id ON collection_items (collection_id)`
  );

  console.log("🔧 setupCollectionTables: done.");
}

export async function setupConsentTables(): Promise<void> {
  console.log("🔧 setupConsentTables: checking tables...");

  await run(
    "pgcrypto extension",
    `CREATE EXTENSION IF NOT EXISTS pgcrypto`
  );

  const queryInterface = sequelize.getQueryInterface();
  let policyColumns: Record<string, unknown> | null = null;
  let consentColumns: Record<string, unknown> | null = null;

  try {
    policyColumns = await (queryInterface as any).describeTable("policy_versions");
  } catch {
    policyColumns = null;
  }

  try {
    consentColumns = await (queryInterface as any).describeTable("user_consents");
  } catch {
    consentColumns = null;
  }

  if (policyColumns && !("version_code" in policyColumns)) {
    console.warn(
      "⚠️  Legacy consent schema detected in policy_versions. " +
      "Run Sequelize migrations before relying on consent access resolution.",
    );
    return;
  }

  if (consentColumns && !("accepted" in consentColumns)) {
    console.warn(
      "⚠️  Legacy consent schema detected in user_consents. " +
      "Run Sequelize migrations before relying on consent access resolution.",
    );
    return;
  }

  await run(
    "policy_versions table",
    `
    CREATE TABLE IF NOT EXISTS policy_versions (
      id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      policy_type            VARCHAR(50)  NOT NULL,
      version_code           VARCHAR(32)  NOT NULL,
      version_label          VARCHAR(200) NOT NULL,
      url                    VARCHAR(500),
      content_hash           VARCHAR(64)  NOT NULL,
      effective_at           TIMESTAMP    NOT NULL,
      is_active              BOOLEAN      NOT NULL DEFAULT false,
      is_material            BOOLEAN      NOT NULL DEFAULT true,
      requires_reacceptance  BOOLEAN      NOT NULL DEFAULT true,
      change_summary_short   VARCHAR(500),
      change_summary_full    TEXT,
      created_at             TIMESTAMP    NOT NULL DEFAULT NOW(),
      updated_at             TIMESTAMP    NOT NULL DEFAULT NOW()
    )
    `
  );

  await run(
    "policy_versions index policy_type",
    `CREATE INDEX IF NOT EXISTS policy_versions_policy_type_idx ON policy_versions (policy_type)`
  );

  await run(
    "policy_versions unique version_code",
    `CREATE UNIQUE INDEX IF NOT EXISTS policy_versions_policy_type_version_code_key ON policy_versions (policy_type, version_code)`
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
    "user_consents table",
    `
    CREATE TABLE IF NOT EXISTS user_consents (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      policy_type       VARCHAR(50)  NOT NULL,
      policy_version_id UUID         NOT NULL REFERENCES policy_versions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      accepted          BOOLEAN      NOT NULL,
      accepted_at       TIMESTAMP    NOT NULL,
      surface           VARCHAR(100),
      locale            VARCHAR(16),
      user_agent        TEXT,
      ip_hash           VARCHAR(128),
      evidence_json     JSONB,
      created_at        TIMESTAMP    NOT NULL DEFAULT NOW()
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
    "user_consents index user_policy_accepted_at",
    `CREATE INDEX IF NOT EXISTS user_consents_user_policy_accepted_at_idx ON user_consents (user_id, policy_type, accepted_at)`
  );

  await run(
    "user_consents unique accept-once",
    `
    CREATE UNIQUE INDEX IF NOT EXISTS user_consents_user_version_accept_once_idx
    ON user_consents (user_id, policy_version_id)
    WHERE accepted = true
    `
  );

  await run(
    "current_consents table",
    `
    CREATE TABLE IF NOT EXISTS current_consents (
      user_id                     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      accepted_terms_version_id   UUID REFERENCES policy_versions(id) ON DELETE SET NULL ON UPDATE CASCADE,
      accepted_privacy_version_id UUID REFERENCES policy_versions(id) ON DELETE SET NULL ON UPDATE CASCADE,
      needs_reacceptance_terms    BOOLEAN NOT NULL DEFAULT false,
      needs_reacceptance_privacy  BOOLEAN NOT NULL DEFAULT false,
      updated_at                  TIMESTAMP NOT NULL DEFAULT NOW()
    )
    `
  );

  console.log("🔧 setupConsentTables: done.");
}
