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

const TEMPLATE_NAME = "Noir Studio / Landscape";
const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 900;
const BACKGROUND_COLOR = "#0c0c0c";
const BACKGROUND_STYLE: string | null = null;

const itemsSnapshot: TemplateItem[] = [
  // Product frame — full-height dominant hero
  {
    element_type: "product",
    product_id: null,
    product_image:
      "https://images.unsplash.com/photo-1506629905607-d9e297d3c5c4?auto=format&fit=crop&w=1200&q=90",
    pos_x: 60,
    pos_y: 0,
    width: 780,
    height: 900,
    z_index: 2,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 0.78,
      shadowEnabled: false,
    },
  },
  // Thin white edge line (right edge of image zone)
  {
    element_type: "shape",
    product_id: null,
    pos_x: 840,
    pos_y: 0,
    width: 1,
    height: 900,
    z_index: 3,
    content: {
      shapeType: "line",
      fillColor: "rgba(255,255,255,0.06)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Red rule (top accent)
  {
    element_type: "shape",
    product_id: null,
    pos_x: 900,
    pos_y: 140,
    width: 80,
    height: 2,
    z_index: 3,
    content: {
      shapeType: "line",
      fillColor: "#c0392b",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Overline: NOIR STUDIO
  {
    element_type: "text",
    product_id: null,
    pos_x: 900,
    pos_y: 160,
    width: 220,
    height: 12,
    z_index: 3,
    content: {
      text: "NOIR STUDIO",
      fontSize: 10,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "rgba(255,255,255,0.4)",
      textAlign: "left",
      letterSpacing: 6,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Title: THE DEFINITIVE EDITION
  {
    element_type: "text",
    product_id: null,
    pos_x: 900,
    pos_y: 200,
    width: 560,
    height: 175,
    z_index: 3,
    content: {
      text: "THE DEFINITIVE\nEDITION",
      fontSize: 90,
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "#f5f5f5",
      textAlign: "left",
      letterSpacing: -3,
      lineHeight: 0.88,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // White rule divider
  {
    element_type: "shape",
    product_id: null,
    pos_x: 900,
    pos_y: 400,
    width: 56,
    height: 1,
    z_index: 3,
    content: {
      shapeType: "line",
      fillColor: "rgba(255,255,255,0.15)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Subtitle
  {
    element_type: "text",
    product_id: null,
    pos_x: 900,
    pos_y: 428,
    width: 480,
    height: 100,
    z_index: 3,
    content: {
      text: "Una sola imagen. Un solo instante. La colección que define la temporada.",
      fontSize: 19,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "normal",
      fontStyle: "normal",
      color: "rgba(255,255,255,0.45)",
      textAlign: "left",
      letterSpacing: 0,
      lineHeight: 1.6,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Collection label
  {
    element_type: "text",
    product_id: null,
    pos_x: 900,
    pos_y: 568,
    width: 260,
    height: 13,
    z_index: 3,
    content: {
      text: "COLLECTION N° 07",
      fontSize: 11,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "rgba(255,255,255,0.25)",
      textAlign: "left",
      letterSpacing: 4,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Small red rule (below collection label)
  {
    element_type: "shape",
    product_id: null,
    pos_x: 900,
    pos_y: 596,
    width: 32,
    height: 1,
    z_index: 3,
    content: {
      shapeType: "line",
      fillColor: "rgba(192,57,43,0.6)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // CTA button background (white)
  {
    element_type: "shape",
    product_id: null,
    pos_x: 900,
    pos_y: 700,
    width: 260,
    height: 62,
    z_index: 4,
    content: {
      shapeType: "rectangle",
      fillColor: "#f5f5f5",
      borderRadius: 0,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // CTA text: VER COLECCIÓN
  {
    element_type: "text",
    product_id: null,
    pos_x: 900,
    pos_y: 725,
    width: 260,
    height: 16,
    z_index: 5,
    content: {
      text: "VER COLECCIÓN",
      fontSize: 13,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "#0c0c0c",
      textAlign: "center",
      letterSpacing: 2.5,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Ghost square accent (bottom-right corner)
  {
    element_type: "shape",
    product_id: null,
    pos_x: 1480,
    pos_y: 680,
    width: 60,
    height: 60,
    z_index: 3,
    content: {
      shapeType: "rectangle",
      fillColor: "rgba(255,255,255,0)",
      borderRadius: 0,
      opacity: 1,
      strokeColor: "rgba(255,255,255,0.06)",
      strokeWidth: 1,
      shadowEnabled: false,
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
    console.error("Failed to import Noir Studio template:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => {});
  });
