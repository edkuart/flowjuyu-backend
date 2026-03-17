// src/utils/setupTables.ts
// Creates Phase 2 tables on startup if they don't exist.

import { sequelize } from "../config/db";

export async function setupPhase2Tables(): Promise<void> {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id          SERIAL PRIMARY KEY,
        seller_id   INTEGER      NOT NULL,
        product_id  UUID,
        buyer_id    INTEGER,
        buyer_name  VARCHAR(100) NOT NULL DEFAULT 'Comprador',
        rating      INTEGER      NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment     TEXT,
        created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
      )
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_reviews_seller_id ON reviews (seller_id);
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_clicks (
        id          SERIAL       PRIMARY KEY,
        seller_id   INTEGER      NOT NULL,
        product_id  UUID,
        session_id  VARCHAR(255),
        ip_address  VARCHAR(64),
        created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
      )
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_wa_clicks_seller_id ON whatsapp_clicks (seller_id);
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS favorites (
        id          SERIAL    PRIMARY KEY,
        user_id     INTEGER   NOT NULL,
        product_id  UUID,
        seller_id   INTEGER,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT favorites_user_product UNIQUE (user_id, product_id),
        CONSTRAINT favorites_user_seller  UNIQUE (user_id, seller_id)
      )
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites (user_id);
    `);

    console.log("✅ Phase 2 tables ready (reviews, whatsapp_clicks, favorites)");
  } catch (err) {
    console.error("❌ setupPhase2Tables error:", err);
  }
}
