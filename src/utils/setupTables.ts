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
