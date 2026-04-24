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

const TEMPLATE_NAME = "Signature Drop / Landscape";
const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 900;
const BACKGROUND_COLOR = "#0a0d14";
const BACKGROUND_STYLE =
  "radial-gradient(circle at 84% 82%, rgba(60,100,255,0.07) 0%, rgba(60,100,255,0.025) 23%, rgba(60,100,255,0) 48%), linear-gradient(135deg, #0a0d14 0%, #060810 100%)";

const itemsSnapshot: TemplateItem[] = [
  // Eyebrow label: "NEW ARRIVAL"
  {
    element_type: "text",
    product_id: null,
    pos_x: 180,
    pos_y: 100,
    width: 220,
    height: 14,
    z_index: 3,
    content: {
      text: "NEW ARRIVAL",
      fontSize: 11,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "#4a7fff",
      textAlign: "left",
      letterSpacing: 4,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Eyebrow thin horizontal line
  {
    element_type: "shape",
    product_id: null,
    pos_x: 180,
    pos_y: 128,
    width: 260,
    height: 1,
    z_index: 2,
    content: {
      shapeType: "line",
      fillColor: "rgba(74,127,255,0.35)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Blue vertical accent bar (behind title)
  {
    element_type: "shape",
    product_id: null,
    pos_x: 180,
    pos_y: 155,
    width: 3,
    height: 190,
    z_index: 2,
    content: {
      shapeType: "rectangle",
      fillColor: "rgba(74,127,255,0.7)",
      borderRadius: 0,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Title: SIGNATURE DROP
  {
    element_type: "text",
    product_id: null,
    pos_x: 194,
    pos_y: 155,
    width: 440,
    height: 200,
    z_index: 3,
    content: {
      text: "SIGNATURE\nDROP",
      fontSize: 100,
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "#f0ecf8",
      textAlign: "left",
      letterSpacing: -4,
      lineHeight: 0.88,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Subtitle
  {
    element_type: "text",
    product_id: null,
    pos_x: 194,
    pos_y: 390,
    width: 400,
    height: 70,
    z_index: 3,
    content: {
      text: "Drops de alto impacto para novedades y cápsulas cortas.",
      fontSize: 21,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "normal",
      fontStyle: "normal",
      color: "#8a95b0",
      textAlign: "left",
      letterSpacing: 0,
      lineHeight: 1.5,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Short blue divider
  {
    element_type: "shape",
    product_id: null,
    pos_x: 194,
    pos_y: 460,
    width: 60,
    height: 1,
    z_index: 2,
    content: {
      shapeType: "line",
      fillColor: "#4a7fff",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Season tag: SS 2025 DROP 01
  {
    element_type: "text",
    product_id: null,
    pos_x: 194,
    pos_y: 490,
    width: 220,
    height: 14,
    z_index: 3,
    content: {
      text: "SS 2025 DROP 01",
      fontSize: 12,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "#4a7fff",
      textAlign: "left",
      letterSpacing: 3.5,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // CTA button background (dark fill + blue border)
  {
    element_type: "shape",
    product_id: null,
    pos_x: 180,
    pos_y: 620,
    width: 240,
    height: 60,
    z_index: 4,
    content: {
      shapeType: "rectangle",
      fillColor: "#0d1120",
      borderRadius: 0,
      opacity: 1,
      strokeColor: "rgba(74,127,255,0.75)",
      strokeWidth: 1,
      shadowEnabled: false,
    },
  },
  // CTA text: VER DROP
  {
    element_type: "text",
    product_id: null,
    pos_x: 208,
    pos_y: 641,
    width: 140,
    height: 18,
    z_index: 5,
    content: {
      text: "VER DROP",
      fontSize: 15,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "#f0ecf8",
      textAlign: "left",
      letterSpacing: 2.5,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // CTA arrow →
  {
    element_type: "text",
    product_id: null,
    pos_x: 366,
    pos_y: 633,
    width: 28,
    height: 32,
    z_index: 5,
    content: {
      text: "→",
      fontSize: 26,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "normal",
      fontStyle: "normal",
      color: "#4a7fff",
      textAlign: "center",
      letterSpacing: 0,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Vertical separator line (left edge of product zone)
  {
    element_type: "shape",
    product_id: null,
    pos_x: 638,
    pos_y: 80,
    width: 1,
    height: 740,
    z_index: 2,
    content: {
      shapeType: "line",
      fillColor: "rgba(74,127,255,0.15)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Blue dot accent at separator top
  {
    element_type: "shape",
    product_id: null,
    pos_x: 644,
    pos_y: 95,
    width: 8,
    height: 8,
    z_index: 3,
    content: {
      shapeType: "circle",
      fillColor: "#4a7fff",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Corner faint number "001"
  {
    element_type: "text",
    product_id: null,
    pos_x: 1400,
    pos_y: 778,
    width: 160,
    height: 90,
    z_index: 2,
    content: {
      text: "001",
      fontSize: 80,
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "rgba(74,127,255,0.04)",
      textAlign: "right",
      letterSpacing: 0,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Product frame 1 — hero full-height left column
  {
    element_type: "product",
    product_id: null,
    product_image:
      "https://images.unsplash.com/photo-1520975916090-3105956dac38?auto=format&fit=crop&w=1100&q=85",
    pos_x: 640,
    pos_y: 80,
    width: 480,
    height: 740,
    z_index: 4,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 0.88,
      shadowEnabled: true,
      shadowX: 0,
      shadowY: 0,
      shadowBlur: 50,
      shadowSpread: 0,
      shadowColor: "rgba(0,0,0,0.6)",
      strokeColor: "rgba(74,127,255,0.3)",
      strokeWidth: 1,
    },
  },
  // Product frame 2 — top-right
  {
    element_type: "product",
    product_id: null,
    product_image:
      "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=900&q=85",
    pos_x: 1140,
    pos_y: 80,
    width: 320,
    height: 360,
    z_index: 4,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 0.88,
      shadowEnabled: true,
      shadowX: 0,
      shadowY: 0,
      shadowBlur: 50,
      shadowSpread: 0,
      shadowColor: "rgba(0,0,0,0.6)",
      strokeColor: "rgba(74,127,255,0.3)",
      strokeWidth: 1,
    },
  },
  // Product frame 3 — bottom-right
  {
    element_type: "product",
    product_id: null,
    product_image:
      "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?auto=format&fit=crop&w=900&q=85",
    pos_x: 1140,
    pos_y: 460,
    width: 320,
    height: 360,
    z_index: 4,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 0.88,
      shadowEnabled: true,
      shadowX: 0,
      shadowY: 0,
      shadowBlur: 50,
      shadowSpread: 0,
      shadowColor: "rgba(0,0,0,0.6)",
      strokeColor: "rgba(74,127,255,0.3)",
      strokeWidth: 1,
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
    console.error("Failed to import Signature Drop template:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => {});
  });
