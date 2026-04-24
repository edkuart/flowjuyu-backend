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

const TEMPLATE_NAME = "Color Block / Landscape";
const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 900;
const BACKGROUND_COLOR = "#f5f0e6";
// 3-zone color block: blue | cream | terracotta
// 580/1600 = 36.25%  |  1020/1600 = 63.75%
const BACKGROUND_STYLE =
  "linear-gradient(90deg, #2845c8 0% 36.25%, #f5f0e6 36.25% 63.75%, #e8412a 63.75% 100%)";

const itemsSnapshot: TemplateItem[] = [
  // Divider line — left/center boundary
  {
    element_type: "shape",
    product_id: null,
    pos_x: 580,
    pos_y: 0,
    width: 1,
    height: 900,
    z_index: 1,
    content: {
      shapeType: "line",
      fillColor: "rgba(0,0,0,0.08)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Divider line — center/right boundary
  {
    element_type: "shape",
    product_id: null,
    pos_x: 1020,
    pos_y: 0,
    width: 1,
    height: 900,
    z_index: 1,
    content: {
      shapeType: "line",
      fillColor: "rgba(0,0,0,0.08)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Product center — tall full hero in cream zone
  {
    element_type: "product",
    product_id: null,
    product_image:
      "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?auto=format&fit=crop&w=900&q=85",
    pos_x: 600,
    pos_y: 40,
    width: 400,
    height: 820,
    z_index: 2,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Product top-right — in terracotta zone
  {
    element_type: "product",
    product_id: null,
    product_image:
      "https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=1000&q=85",
    pos_x: 1040,
    pos_y: 40,
    width: 520,
    height: 400,
    z_index: 2,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Product bottom-right — in terracotta zone
  {
    element_type: "product",
    product_id: null,
    product_image:
      "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=1000&q=85",
    pos_x: 1040,
    pos_y: 460,
    width: 520,
    height: 400,
    z_index: 2,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Overline: NUEVA COLECCIÓN
  {
    element_type: "text",
    product_id: null,
    pos_x: 72,
    pos_y: 120,
    width: 280,
    height: 12,
    z_index: 3,
    content: {
      text: "NUEVA COLECCIÓN",
      fontSize: 10,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "rgba(255,255,255,0.6)",
      textAlign: "left",
      letterSpacing: 5,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Title: Color Block
  {
    element_type: "text",
    product_id: null,
    pos_x: 72,
    pos_y: 155,
    width: 440,
    height: 215,
    z_index: 3,
    content: {
      text: "Color\nBlock",
      fontSize: 110,
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "#ffffff",
      textAlign: "left",
      letterSpacing: -4,
      lineHeight: 0.86,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // White rule divider
  {
    element_type: "shape",
    product_id: null,
    pos_x: 72,
    pos_y: 390,
    width: 60,
    height: 2,
    z_index: 3,
    content: {
      shapeType: "line",
      fillColor: "rgba(255,255,255,0.4)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Subtitle
  {
    element_type: "text",
    product_id: null,
    pos_x: 72,
    pos_y: 416,
    width: 420,
    height: 65,
    z_index: 3,
    content: {
      text: "Geometría pura. Colores que afirman.",
      fontSize: 20,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "normal",
      fontStyle: "normal",
      color: "rgba(255,255,255,0.7)",
      textAlign: "left",
      letterSpacing: 0,
      lineHeight: 1.5,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // CTA button background (white)
  {
    element_type: "shape",
    product_id: null,
    pos_x: 72,
    pos_y: 680,
    width: 260,
    height: 60,
    z_index: 4,
    content: {
      shapeType: "rectangle",
      fillColor: "#ffffff",
      borderRadius: 0,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // CTA text: VER TODO
  {
    element_type: "text",
    product_id: null,
    pos_x: 72,
    pos_y: 703,
    width: 260,
    height: 16,
    z_index: 5,
    content: {
      text: "VER TODO",
      fontSize: 14,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "#2845c8",
      textAlign: "center",
      letterSpacing: 2,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Season label (bottom of right zone)
  {
    element_type: "text",
    product_id: null,
    pos_x: 1040,
    pos_y: 870,
    width: 120,
    height: 13,
    z_index: 3,
    content: {
      text: "SS 2025",
      fontSize: 11,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "rgba(255,255,255,0.4)",
      textAlign: "left",
      letterSpacing: 3,
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
    console.error("Failed to import Color Block template:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => {});
  });
