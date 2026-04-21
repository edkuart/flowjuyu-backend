// src/utils/setupTables.ts
// Creates Phase 2 tables on startup if they don't exist.
// Each statement is isolated: one failure never prevents others from running.

import { sequelize } from "../config/db";
import supabase from "../lib/supabase";

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

function tplText({
  text,
  fontSize,
  x,
  y,
  w,
  h,
  color = "#1a1a1a",
  fontFamily = "inherit",
  fontWeight = "bold",
  textAlign = "left",
  letterSpacing = 0,
  lineHeight = 1.1,
  paddingX = 10,
  paddingY = 8,
  bgColor,
  bgOpacity = 0.6,
}: {
  text: string;
  fontSize: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  fontFamily?: string;
  fontWeight?: "normal" | "bold";
  textAlign?: "left" | "center" | "right";
  letterSpacing?: number;
  lineHeight?: number;
  paddingX?: number;
  paddingY?: number;
  bgColor?: string;
  bgOpacity?: number;
}) {
  return {
    element_type: "text",
    product_id: null,
    pos_x: x,
    pos_y: y,
    width: w,
    height: h,
    z_index: 0,
    content: {
      text,
      fontSize,
      fontFamily,
      fontWeight,
      fontStyle: "normal",
      color,
      textAlign,
      letterSpacing,
      lineHeight,
      paddingX,
      paddingY,
      bgColor,
      bgOpacity,
      shadow: false,
      outline: false,
      flipX: false,
      flipY: false,
      rotation: 0,
      animation: "none",
      motion: "none",
    },
  };
}

function tplShape({
  shapeType = "rectangle",
  fillColor,
  x,
  y,
  w,
  h,
  z = 0,
  opacity = 1,
  borderRadius = 12,
  gradientEnabled = false,
  gradientColor2 = "#ffffff",
  gradientAngle = 135,
}: {
  shapeType?: "rectangle" | "circle" | "triangle" | "star" | "line";
  fillColor: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  opacity?: number;
  borderRadius?: number;
  gradientEnabled?: boolean;
  gradientColor2?: string;
  gradientAngle?: number;
}) {
  return {
    element_type: "shape",
    product_id: null,
    pos_x: x,
    pos_y: y,
    width: w,
    height: h,
    z_index: z,
    content: {
      shapeType,
      fillColor,
      gradientEnabled,
      gradientColor2,
      gradientAngle,
      gradientType: "linear",
      borderRadius,
      opacity,
      strokeColor: "#000000",
      strokeWidth: 0,
      shadowEnabled: false,
      flipX: false,
      flipY: false,
      rotation: 0,
      animation: "none",
      motion: "none",
    },
  };
}

const DEFAULT_COLLECTION_TEMPLATES = [
  {
    name: "Lanzamiento Editorial Nocturno",
    thumbnail_url: null,
    background_color: "#0E0F14",
    background_style: "linear-gradient(135deg, #0E0F14, #232634)",
    background_image_url: null,
    canvas_width: 1080,
    canvas_height: 1080,
    is_public: true,
    items_snapshot: [
      tplShape({ fillColor: "#D6B36A", x: 70, y: 78, w: 180, h: 8, z: 1, borderRadius: 99 }),
      tplText({ text: "NUEVA COLECCION", fontSize: 88, x: 72, y: 110, w: 620, h: 180, color: "#F8F3E8", letterSpacing: 1.5, lineHeight: 0.95 }),
      tplText({ text: "Siluetas que convierten textura en deseo.", fontSize: 28, x: 78, y: 300, w: 480, h: 90, color: "#D8D1C0", lineHeight: 1.2 }),
      tplShape({ fillColor: "#151824", x: 640, y: 96, w: 340, h: 760, z: 0, borderRadius: 36 }),
      tplShape({ fillColor: "#D6B36A", x: 708, y: 164, w: 204, h: 540, z: 1, borderRadius: 120, opacity: 0.16 }),
      tplText({ text: "Arrastra aqui\nla pieza hero", fontSize: 34, x: 690, y: 360, w: 240, h: 130, color: "#F8F3E8", textAlign: "center", lineHeight: 1.15 }),
      tplShape({ fillColor: "#F8F3E8", x: 72, y: 842, w: 280, h: 92, z: 1, borderRadius: 999 }),
      tplText({ text: "Disponible ahora", fontSize: 28, x: 102, y: 862, w: 220, h: 50, color: "#0E0F14", textAlign: "center" }),
    ],
  },
  {
    name: "Artesania Tierra Viva",
    thumbnail_url: null,
    background_color: "#E8D7C5",
    background_style: "linear-gradient(160deg, #F2E7D8, #D7B89C)",
    background_image_url: null,
    canvas_width: 1080,
    canvas_height: 1350,
    is_public: true,
    items_snapshot: [
      tplShape({ fillColor: "#8A4B2A", x: 70, y: 76, w: 420, h: 420, z: 0, borderRadius: 220, opacity: 0.12 }),
      tplShape({ fillColor: "#2E6A57", x: 780, y: 1040, w: 220, h: 220, z: 0, borderRadius: 999, opacity: 0.16 }),
      tplText({ text: "HECHO CON\nALMA Y TELAR", fontSize: 86, x: 70, y: 108, w: 620, h: 210, color: "#6A321D", fontFamily: "'Abril Fatface', serif", lineHeight: 0.95 }),
      tplText({ text: "Lanzamiento de coleccion inspirada en oficio, textura y origen.", fontSize: 28, x: 78, y: 344, w: 540, h: 120, color: "#5F463D", lineHeight: 1.25 }),
      tplShape({ fillColor: "#FBF6EF", x: 618, y: 180, w: 360, h: 520, z: 0, borderRadius: 28 }),
      tplText({ text: "Foto principal", fontSize: 32, x: 680, y: 410, w: 236, h: 60, color: "#A67B5B", textAlign: "center" }),
      tplShape({ fillColor: "#2E6A57", x: 80, y: 560, w: 920, h: 270, z: 0, borderRadius: 28, opacity: 0.94 }),
      tplText({ text: "3 piezas destacadas", fontSize: 38, x: 120, y: 605, w: 320, h: 52, color: "#FFF9F1" }),
      tplText({ text: "Arrastra productos aqui y cambia el copy por una promesa clara de valor artesanal.", fontSize: 24, x: 122, y: 676, w: 590, h: 96, color: "#DDEBDE", lineHeight: 1.25 }),
      tplShape({ fillColor: "#C77C4E", x: 738, y: 618, w: 188, h: 64, z: 1, borderRadius: 999 }),
      tplText({ text: "Edicion especial", fontSize: 22, x: 752, y: 635, w: 160, h: 28, color: "#FFF6EA", textAlign: "center" }),
    ],
  },
  {
    name: "Drop Vibrante Boutique",
    thumbnail_url: null,
    background_color: "#F7F6F1",
    background_style: "linear-gradient(145deg, #F7F6F1, #F1C7B8)",
    background_image_url: null,
    canvas_width: 1080,
    canvas_height: 1080,
    is_public: true,
    items_snapshot: [
      tplShape({ fillColor: "#EF6B57", x: 640, y: 54, w: 270, h: 270, z: 0, borderRadius: 999, opacity: 0.18 }),
      tplShape({ fillColor: "#0F3D3A", x: 110, y: 680, w: 260, h: 260, z: 0, borderRadius: 999, opacity: 0.1 }),
      tplText({ text: "DROP\nLIMITADO", fontSize: 106, x: 76, y: 84, w: 560, h: 220, color: "#13212B", fontFamily: "'Bebas Neue', sans-serif", lineHeight: 0.92, letterSpacing: 1 }),
      tplText({ text: "Color, textura y energia para un lanzamiento imposible de ignorar.", fontSize: 30, x: 82, y: 326, w: 490, h: 92, color: "#42505C", lineHeight: 1.18 }),
      tplShape({ fillColor: "#13212B", x: 642, y: 370, w: 300, h: 360, z: 0, borderRadius: 38 }),
      tplText({ text: "Imagen o\nproducto hero", fontSize: 34, x: 686, y: 492, w: 212, h: 96, color: "#F7F6F1", textAlign: "center" }),
      tplShape({ fillColor: "#EF6B57", x: 80, y: 826, w: 420, h: 120, z: 1, borderRadius: 30 }),
      tplText({ text: "Disponible hoy", fontSize: 34, x: 110, y: 862, w: 360, h: 42, color: "#FFF8F5", textAlign: "center" }),
      tplText({ text: "Ideal para capsulas, novedades o ediciones cortas.", fontSize: 22, x: 556, y: 846, w: 410, h: 62, color: "#3E4752", lineHeight: 1.2 }),
    ],
  },
  {
    name: "Lujo Marfil y Oro",
    thumbnail_url: null,
    background_color: "#F6F1E7",
    background_style: "linear-gradient(135deg, #F9F5EE, #E8DDCB)",
    background_image_url: null,
    canvas_width: 1080,
    canvas_height: 1350,
    is_public: true,
    items_snapshot: [
      tplShape({ fillColor: "#D4AF68", x: 83, y: 88, w: 914, h: 1174, z: 0, borderRadius: 44, opacity: 0.17 }),
      tplShape({ fillColor: "#FEFBF5", x: 112, y: 118, w: 856, h: 1114, z: 1, borderRadius: 36 }),
      tplText({ text: "COLECCION\nSIGNATURE", fontSize: 88, x: 182, y: 208, w: 500, h: 190, color: "#181818", fontFamily: "'Playfair Display', serif", lineHeight: 0.96 }),
      tplText({ text: "Una composicion pensada para destacar piezas premium, sets regalo y lanzamientos con tono aspiracional.", fontSize: 27, x: 186, y: 428, w: 440, h: 118, color: "#61594F", lineHeight: 1.25 }),
      tplShape({ fillColor: "#EEE4D4", x: 646, y: 214, w: 200, h: 520, z: 1, borderRadius: 110 }),
      tplText({ text: "Pieza hero", fontSize: 30, x: 665, y: 438, w: 160, h: 44, color: "#8B744C", textAlign: "center" }),
      tplShape({ fillColor: "#161616", x: 188, y: 1040, w: 260, h: 82, z: 2, borderRadius: 999 }),
      tplText({ text: "Descubrir ahora", fontSize: 26, x: 214, y: 1064, w: 208, h: 34, color: "#F6F1E7", textAlign: "center" }),
      tplText({ text: "Textura fina, tonos neutros, contraste elegante.", fontSize: 23, x: 560, y: 1048, w: 250, h: 60, color: "#665C50", lineHeight: 1.2 }),
    ],
  },
  {
    name: "Mercado Textil Solar",
    thumbnail_url: null,
    background_color: "#F6EBD3",
    background_style: "linear-gradient(135deg, #F7EED9, #F0C55B)",
    background_image_url: null,
    canvas_width: 1080,
    canvas_height: 1080,
    is_public: true,
    items_snapshot: [
      tplShape({ fillColor: "#A33E2B", x: 60, y: 70, w: 960, h: 940, z: 0, borderRadius: 48, opacity: 0.08 }),
      tplText({ text: "COLORES QUE\nSE VENDEN SOLOS", fontSize: 92, x: 84, y: 110, w: 640, h: 196, color: "#8F3526", fontFamily: "'Oswald', sans-serif", lineHeight: 0.94 }),
      tplText({ text: "Pensada para lanzamientos alegres, estampados vivos y colecciones con personalidad local.", fontSize: 27, x: 90, y: 336, w: 520, h: 110, color: "#6B4D38", lineHeight: 1.22 }),
      tplShape({ fillColor: "#FFF7EB", x: 684, y: 120, w: 280, h: 360, z: 0, borderRadius: 34 }),
      tplText({ text: "Imagen 1", fontSize: 28, x: 756, y: 278, w: 136, h: 42, color: "#C28B45", textAlign: "center" }),
      tplShape({ fillColor: "#2E6A57", x: 684, y: 520, w: 280, h: 360, z: 0, borderRadius: 34, opacity: 0.92 }),
      tplText({ text: "Imagen 2", fontSize: 28, x: 756, y: 678, w: 136, h: 42, color: "#F4EDE2", textAlign: "center" }),
      tplShape({ fillColor: "#8F3526", x: 86, y: 824, w: 420, h: 112, z: 1, borderRadius: 24 }),
      tplText({ text: "Lanzamiento de temporada", fontSize: 31, x: 114, y: 862, w: 364, h: 36, color: "#FFF6E8", textAlign: "center" }),
    ],
  },
  {
    name: "Capsula Minimal Terracota",
    thumbnail_url: null,
    background_color: "#F5EEE8",
    background_style: "linear-gradient(180deg, #F5EEE8, #E5C3AF)",
    background_image_url: null,
    canvas_width: 1080,
    canvas_height: 1350,
    is_public: true,
    items_snapshot: [
      tplShape({ fillColor: "#B8613C", x: 84, y: 132, w: 420, h: 1040, z: 0, borderRadius: 24, opacity: 0.12 }),
      tplText({ text: "CAPSULA\nNUEVA", fontSize: 92, x: 568, y: 170, w: 320, h: 170, color: "#3B2A22", fontFamily: "'Josefin Sans', sans-serif", lineHeight: 0.96, letterSpacing: 1 }),
      tplText({ text: "Una plantilla sobria para piezas de alto detalle visual.", fontSize: 27, x: 570, y: 360, w: 350, h: 90, color: "#5E4D42", lineHeight: 1.22 }),
      tplShape({ fillColor: "#FCF8F3", x: 144, y: 204, w: 310, h: 764, z: 1, borderRadius: 30 }),
      tplText({ text: "Foto vertical", fontSize: 30, x: 196, y: 550, w: 206, h: 50, color: "#BE8B72", textAlign: "center" }),
      tplShape({ fillColor: "#3B2A22", x: 570, y: 980, w: 260, h: 76, z: 1, borderRadius: 999 }),
      tplText({ text: "Ver coleccion", fontSize: 24, x: 600, y: 1002, w: 200, h: 28, color: "#F8F1EA", textAlign: "center" }),
      tplText({ text: "Perfecta para moda femenina, lineas suaves y lanzamientos refinados.", fontSize: 22, x: 570, y: 1092, w: 290, h: 74, color: "#65554A", lineHeight: 1.25 }),
    ],
  },
  {
    name: "Oferta de Estreno Esmeralda",
    thumbnail_url: null,
    background_color: "#E8F1EE",
    background_style: "linear-gradient(145deg, #F2F8F5, #BFD8CF)",
    background_image_url: null,
    canvas_width: 1080,
    canvas_height: 1080,
    is_public: true,
    items_snapshot: [
      tplShape({ fillColor: "#0F3D3A", x: 70, y: 70, w: 940, h: 940, z: 0, borderRadius: 42, opacity: 0.94 }),
      tplShape({ fillColor: "#D4AF68", x: 78, y: 80, w: 200, h: 200, z: 1, borderRadius: 999, opacity: 0.15 }),
      tplText({ text: "OFERTA DE\nLANZAMIENTO", fontSize: 92, x: 108, y: 128, w: 610, h: 180, color: "#F5F0E4", fontFamily: "'Bebas Neue', sans-serif", lineHeight: 0.92, letterSpacing: 1 }),
      tplText({ text: "Haz visible una promo, beneficio o descuento de estreno con alto contraste.", fontSize: 27, x: 112, y: 330, w: 430, h: 110, color: "#C9DDD4", lineHeight: 1.22 }),
      tplShape({ fillColor: "#F5F0E4", x: 662, y: 170, w: 250, h: 470, z: 1, borderRadius: 30 }),
      tplText({ text: "Producto\nestrella", fontSize: 32, x: 700, y: 366, w: 174, h: 80, color: "#8C7A59", textAlign: "center" }),
      tplShape({ fillColor: "#D4AF68", x: 112, y: 760, w: 280, h: 112, z: 1, borderRadius: 24 }),
      tplText({ text: "20% OFF HOY", fontSize: 36, x: 132, y: 798, w: 240, h: 38, color: "#17332F", textAlign: "center" }),
      tplText({ text: "Cambia esta oferta por tu mensaje comercial real.", fontSize: 22, x: 454, y: 786, w: 360, h: 66, color: "#D8E4DE", lineHeight: 1.2 }),
    ],
  },
  {
    name: "Story de Coleccion Bohemia",
    thumbnail_url: null,
    background_color: "#F4E6D8",
    background_style: "linear-gradient(135deg, #F8EEDF, #D9B99A)",
    background_image_url: null,
    canvas_width: 1080,
    canvas_height: 1350,
    is_public: true,
    items_snapshot: [
      tplShape({ fillColor: "#6B3E2E", x: 0, y: 0, w: 1080, h: 220, z: 0, opacity: 0.88, borderRadius: 0 }),
      tplText({ text: "UNA HISTORIA\nPARA VESTIR", fontSize: 78, x: 84, y: 74, w: 520, h: 140, color: "#FFF8F1", fontFamily: "'Playfair Display', serif", lineHeight: 0.96 }),
      tplShape({ fillColor: "#FFF8F1", x: 86, y: 292, w: 420, h: 620, z: 0, borderRadius: 32 }),
      tplText({ text: "Foto principal", fontSize: 34, x: 180, y: 570, w: 232, h: 50, color: "#BF9C82", textAlign: "center" }),
      tplText({ text: "Presenta el origen, la inspiracion o el proceso de la coleccion.", fontSize: 28, x: 580, y: 338, w: 360, h: 140, color: "#5A463B", lineHeight: 1.24 }),
      tplShape({ fillColor: "#2E6A57", x: 574, y: 548, w: 310, h: 220, z: 0, borderRadius: 28, opacity: 0.96 }),
      tplText({ text: "Producto 1", fontSize: 28, x: 650, y: 640, w: 158, h: 34, color: "#F5EEE5", textAlign: "center" }),
      tplShape({ fillColor: "#C77C4E", x: 690, y: 802, w: 250, h: 120, z: 0, borderRadius: 999, opacity: 0.95 }),
      tplText({ text: "Conocer la coleccion", fontSize: 24, x: 724, y: 846, w: 182, h: 30, color: "#FFF5E9", textAlign: "center" }),
    ],
  },
];

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

  await run(
    "vendedor_perfil col live_external_url",
    `ALTER TABLE vendedor_perfil ADD COLUMN IF NOT EXISTS live_external_url TEXT NULL`
  );

  await run(
    "vendedor_perfil col live_platform",
    `ALTER TABLE vendedor_perfil ADD COLUMN IF NOT EXISTS live_platform VARCHAR(20) NULL`
  );

  await run(
    "vendedor_perfil col live_collection_id",
    `ALTER TABLE vendedor_perfil ADD COLUMN IF NOT EXISTS live_collection_id INTEGER NULL`
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

  // background_style stores a full CSS background string (gradient or solid).
  // When set, it overrides background_color in the frontend.
  await run(
    "collections col background_style",
    `ALTER TABLE collections ADD COLUMN IF NOT EXISTS background_style TEXT`
  );

  // ── collection_templates ──────────────────────────────────────────────────
  await run(
    "collection_templates table",
    `
    CREATE TABLE IF NOT EXISTS collection_templates (
      id                   SERIAL        PRIMARY KEY,
      seller_id            INTEGER       REFERENCES users(id) ON DELETE CASCADE,
      name                 VARCHAR(120)  NOT NULL,
      thumbnail_url        TEXT,
      items_snapshot       JSONB         NOT NULL DEFAULT '[]'::jsonb,
      canvas_width         INTEGER       NOT NULL DEFAULT 800,
      canvas_height        INTEGER       NOT NULL DEFAULT 600,
      background_color     VARCHAR(20)   NOT NULL DEFAULT '#FFFFFF',
      background_style     TEXT,
      background_image_url TEXT,
      is_public            BOOLEAN       NOT NULL DEFAULT true,
      created_at           TIMESTAMP     NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMP     NOT NULL DEFAULT NOW()
    )
    `
  );

  await run(
    "collection_templates index seller_id",
    `CREATE INDEX IF NOT EXISTS idx_collection_templates_seller_id ON collection_templates (seller_id)`
  );

  await run(
    "collection_templates seller nullable",
    `ALTER TABLE collection_templates ALTER COLUMN seller_id DROP NOT NULL`
  );

  await run(
    "collection_templates index public",
    `CREATE INDEX IF NOT EXISTS idx_collection_templates_public ON collection_templates (is_public, created_at DESC)`
  );

  await run(
    "collection_templates col background_image_url",
    `ALTER TABLE collection_templates ADD COLUMN IF NOT EXISTS background_image_url TEXT`
  );

  try {
    for (const template of DEFAULT_COLLECTION_TEMPLATES) {
      await sequelize.query(
        `
        INSERT INTO collection_templates
          (seller_id, name, thumbnail_url, items_snapshot, canvas_width, canvas_height, background_color, background_style, background_image_url, is_public, created_at, updated_at)
        SELECT
          NULL,
          :name,
          :thumbnailUrl,
          CAST(:itemsSnapshot AS jsonb),
          :canvasWidth,
          :canvasHeight,
          :backgroundColor,
          :backgroundStyle,
          :backgroundImageUrl,
          :isPublic,
          NOW(),
          NOW()
        WHERE NOT EXISTS (
          SELECT 1 FROM collection_templates WHERE seller_id IS NULL AND name = :name
        )
        `,
        {
          replacements: {
            name: template.name,
            thumbnailUrl: template.thumbnail_url,
            itemsSnapshot: JSON.stringify(template.items_snapshot),
            canvasWidth: template.canvas_width,
            canvasHeight: template.canvas_height,
            backgroundColor: template.background_color,
            backgroundStyle: template.background_style,
            backgroundImageUrl: template.background_image_url,
            isPublic: template.is_public,
          },
        }
      );
    }
    console.log(`  ✅ collection_templates seed (${DEFAULT_COLLECTION_TEMPLATES.length} base templates)`);
  } catch (err: any) {
    console.error("  ❌ collection_templates seed:", err?.original?.message ?? err?.message ?? err);
  }

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

  // ── collection_items: text / shape / animation support ────────────────────
  // product_id was NOT NULL; make it nullable so text/shape items can omit it.
  await run(
    "collection_items col product_id nullable",
    `ALTER TABLE collection_items ALTER COLUMN product_id DROP NOT NULL`
  );

  await run(
    "collection_items col element_type",
    `ALTER TABLE collection_items ADD COLUMN IF NOT EXISTS element_type VARCHAR(20) NOT NULL DEFAULT 'product'`
  );

  await run(
    "collection_items col content",
    `ALTER TABLE collection_items ADD COLUMN IF NOT EXISTS content JSONB`
  );

  // ── Supabase storage bucket for collection images ─────────────────────────
  try {
    const { error } = await supabase.storage.createBucket("colecciones_imagenes", {
      public: true,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
      fileSizeLimit: 8 * 1024 * 1024,
    });
    if (!error || error.message?.includes("already exists") || (error as any)?.error === "Duplicate") {
      console.log("  ✅ colecciones_imagenes bucket (ready)");
    } else {
      console.error("  ❌ colecciones_imagenes bucket:", error.message);
    }
  } catch (err: any) {
    console.error("  ❌ colecciones_imagenes bucket:", err?.message ?? err);
  }

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
