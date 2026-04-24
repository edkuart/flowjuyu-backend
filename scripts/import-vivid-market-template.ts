import { QueryTypes } from "sequelize";
import { sequelize } from "../src/config/db";

type TemplateItem = {
  element_type: "product" | "text" | "shape" | "image";
  product_id: string | null;
  product_image?: string | null;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  z_index: number;
  content: Record<string, unknown> | null;
};

const TEMPLATE_NAME = "Vivid Market / Landscape";
const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 900;
const BACKGROUND_COLOR = "#f5efe3";
const BACKGROUND_STYLE: string | null = null;

const itemsSnapshot: TemplateItem[] = [
  // Product frame 1 — large left arch, coral border, rotated -2°
  {
    element_type: "product",
    product_id: null,
    product_image:
      "https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=900&q=85",
    pos_x: 60,
    pos_y: 80,
    width: 380,
    height: 520,
    z_index: 2,
    content: {
      borderRadius: 200,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: false,
      rotation: -2,
    },
  },
  // Product frame 2 — center-top arch, green border, rotated 1.5°
  {
    element_type: "product",
    product_id: null,
    product_image:
      "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=800&q=85",
    pos_x: 460,
    pos_y: 40,
    width: 280,
    height: 360,
    z_index: 2,
    content: {
      borderRadius: 140,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: false,
      rotation: 1.5,
    },
  },
  // Product frame 3 — center-bottom arch, purple border, rotated -1°
  {
    element_type: "product",
    product_id: null,
    product_image:
      "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=800&q=85",
    pos_x: 480,
    pos_y: 420,
    width: 240,
    height: 360,
    z_index: 2,
    content: {
      borderRadius: 120,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: false,
      rotation: -1,
    },
  },
  // Product frame 4 — tall right arch, pink border, rotated 2°
  {
    element_type: "product",
    product_id: null,
    product_image:
      "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?auto=format&fit=crop&w=900&q=85",
    pos_x: 740,
    pos_y: 60,
    width: 320,
    height: 660,
    z_index: 2,
    content: {
      borderRadius: 160,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: false,
      rotation: 2,
    },
  },
  // Decorative asterisk star
  {
    element_type: "text",
    product_id: null,
    pos_x: 440,
    pos_y: 40,
    width: 60,
    height: 50,
    z_index: 3,
    content: {
      text: "*",
      fontSize: 42,
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontWeight: "normal",
      fontStyle: "normal",
      color: "rgba(224,90,58,0.35)",
      textAlign: "left",
      letterSpacing: 0,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Decorative circle outline (bottom-right of text zone)
  {
    element_type: "shape",
    product_id: null,
    pos_x: 1060,
    pos_y: 680,
    width: 120,
    height: 120,
    z_index: 3,
    content: {
      shapeType: "circle",
      fillColor: "rgba(255,255,255,0)",
      borderRadius: 999,
      opacity: 1,
      strokeColor: "rgba(107,95,214,0.15)",
      strokeWidth: 2,
      shadowEnabled: false,
    },
  },
  // Top coral rule
  {
    element_type: "shape",
    product_id: null,
    pos_x: 1100,
    pos_y: 130,
    width: 200,
    height: 3,
    z_index: 3,
    content: {
      shapeType: "line",
      fillColor: "#e05a3a",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Overline: NUEVA TEMPORADA
  {
    element_type: "text",
    product_id: null,
    pos_x: 1100,
    pos_y: 150,
    width: 260,
    height: 12,
    z_index: 3,
    content: {
      text: "NUEVA TEMPORADA",
      fontSize: 10,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "#b36040",
      textAlign: "left",
      letterSpacing: 4.5,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Title: Vivid Market
  {
    element_type: "text",
    product_id: null,
    pos_x: 1100,
    pos_y: 188,
    width: 420,
    height: 185,
    z_index: 3,
    content: {
      text: "Vivid\nMarket",
      fontSize: 88,
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontWeight: "normal",
      fontStyle: "italic",
      color: "#1c1409",
      textAlign: "left",
      letterSpacing: -2,
      lineHeight: 0.9,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Subtitle
  {
    element_type: "text",
    product_id: null,
    pos_x: 1100,
    pos_y: 396,
    width: 380,
    height: 70,
    z_index: 3,
    content: {
      text: "Los colores de la temporada.\nPiezas que hablan sin decir nada.",
      fontSize: 18,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "normal",
      fontStyle: "normal",
      color: "#7a6652",
      textAlign: "left",
      letterSpacing: 0,
      lineHeight: 1.6,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Color dot 1 — coral
  {
    element_type: "shape",
    product_id: null,
    pos_x: 1100,
    pos_y: 520,
    width: 14,
    height: 14,
    z_index: 3,
    content: {
      shapeType: "circle",
      fillColor: "#e05a3a",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Color dot 2 — green
  {
    element_type: "shape",
    product_id: null,
    pos_x: 1124,
    pos_y: 520,
    width: 14,
    height: 14,
    z_index: 3,
    content: {
      shapeType: "circle",
      fillColor: "#4a9e6e",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Color dot 3 — purple
  {
    element_type: "shape",
    product_id: null,
    pos_x: 1148,
    pos_y: 520,
    width: 14,
    height: 14,
    z_index: 3,
    content: {
      shapeType: "circle",
      fillColor: "#6b5fd6",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // CTA pill button (coral)
  {
    element_type: "shape",
    product_id: null,
    pos_x: 1100,
    pos_y: 570,
    width: 280,
    height: 62,
    z_index: 4,
    content: {
      shapeType: "capsule",
      fillColor: "#e05a3a",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // CTA text
  {
    element_type: "text",
    product_id: null,
    pos_x: 1100,
    pos_y: 595,
    width: 280,
    height: 16,
    z_index: 5,
    content: {
      text: "EXPLORAR COLECCIÓN",
      fontSize: 13,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "#ffffff",
      textAlign: "center",
      letterSpacing: 1.5,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
];

async function replaceTemplate() {
  await sequelize.query(
    `DELETE FROM collection_templates WHERE seller_id IS NULL AND name = :name`,
    { replacements: { name: TEMPLATE_NAME }, type: QueryTypes.DELETE },
  );

  const inserted = await sequelize.query<{ id: number }>(
    `
    INSERT INTO collection_templates
      (seller_id, name, thumbnail_url, items_snapshot, canvas_width, canvas_height, background_color, background_style, background_image_url, is_public, created_at, updated_at)
    VALUES
      (NULL, :name, NULL, CAST(:itemsSnapshot AS jsonb), :canvasWidth, :canvasHeight, :backgroundColor, :backgroundStyle, NULL, true, NOW(), NOW())
    RETURNING id
    `,
    {
      replacements: {
        name: TEMPLATE_NAME,
        itemsSnapshot: JSON.stringify(itemsSnapshot),
        canvasWidth: CANVAS_WIDTH,
        canvasHeight: CANVAS_HEIGHT,
        backgroundColor: BACKGROUND_COLOR,
        backgroundStyle: BACKGROUND_STYLE,
      },
      type: QueryTypes.SELECT,
    },
  );

  console.log(`Replaced template ${TEMPLATE_NAME} → new id #${inserted[0]?.id ?? "n/a"}`);
}

replaceTemplate()
  .catch((error) => {
    console.error("Failed to import Vivid Market template:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => {});
  });
