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

const TEMPLATE_NAME = "Fiesta Drop / Landscape";
const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 900;
const BACKGROUND_COLOR = "#e8177a";
const BACKGROUND_STYLE = "linear-gradient(135deg, #e8177a 0%, #f5c800 100%)";

const itemsSnapshot: TemplateItem[] = [
  // frame-a — tall left column
  {
    element_type: "product",
    product_id: null,
    product_image:
      "https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=900&q=85",
    pos_x: 80,
    pos_y: 40,
    width: 380,
    height: 820,
    z_index: 2,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: true,
      shadowX: 0,
      shadowY: 0,
      shadowBlur: 30,
      shadowSpread: 0,
      shadowColor: "rgba(0,0,0,0.2)",
      strokeColor: "rgba(255,255,255,0.4)",
      strokeWidth: 1,
    },
  },
  // frame-b — tall center column
  {
    element_type: "product",
    product_id: null,
    product_image:
      "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?auto=format&fit=crop&w=900&q=85",
    pos_x: 480,
    pos_y: 60,
    width: 340,
    height: 780,
    z_index: 2,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: true,
      shadowX: 0,
      shadowY: 0,
      shadowBlur: 30,
      shadowSpread: 0,
      shadowColor: "rgba(0,0,0,0.2)",
      strokeColor: "rgba(255,255,255,0.4)",
      strokeWidth: 1,
    },
  },
  // frame-c — top right
  {
    element_type: "product",
    product_id: null,
    product_image:
      "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=800&q=85",
    pos_x: 840,
    pos_y: 40,
    width: 300,
    height: 380,
    z_index: 2,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: true,
      shadowX: 0,
      shadowY: 0,
      shadowBlur: 30,
      shadowSpread: 0,
      shadowColor: "rgba(0,0,0,0.2)",
      strokeColor: "rgba(255,255,255,0.4)",
      strokeWidth: 1,
    },
  },
  // frame-d — bottom right
  {
    element_type: "product",
    product_id: null,
    product_image:
      "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=800&q=85",
    pos_x: 840,
    pos_y: 440,
    width: 300,
    height: 380,
    z_index: 2,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: true,
      shadowX: 0,
      shadowY: 0,
      shadowBlur: 30,
      shadowSpread: 0,
      shadowColor: "rgba(0,0,0,0.2)",
      strokeColor: "rgba(255,255,255,0.4)",
      strokeWidth: 1,
    },
  },
  // Decorative circles (right margin)
  {
    element_type: "shape",
    product_id: null,
    pos_x: 1460,
    pos_y: 130,
    width: 18,
    height: 18,
    z_index: 1,
    content: {
      shapeType: "circle",
      fillColor: "rgba(255,255,255,0.3)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  {
    element_type: "shape",
    product_id: null,
    pos_x: 1490,
    pos_y: 148,
    width: 10,
    height: 10,
    z_index: 1,
    content: {
      shapeType: "circle",
      fillColor: "rgba(255,255,255,0.2)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Circle outline (bottom-left of text zone)
  {
    element_type: "shape",
    product_id: null,
    pos_x: 1160,
    pos_y: 760,
    width: 80,
    height: 80,
    z_index: 1,
    content: {
      shapeType: "circle",
      fillColor: "rgba(255,255,255,0)",
      borderRadius: 999,
      opacity: 1,
      strokeColor: "rgba(255,255,255,0.2)",
      strokeWidth: 2,
      shadowEnabled: false,
    },
  },
  // Sparkle *
  {
    element_type: "text",
    product_id: null,
    pos_x: 1160,
    pos_y: 60,
    width: 60,
    height: 60,
    z_index: 3,
    content: {
      text: "*",
      fontSize: 52,
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "rgba(255,255,255,0.5)",
      textAlign: "left",
      letterSpacing: 0,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Overline: FIESTA DROP
  {
    element_type: "text",
    product_id: null,
    pos_x: 1160,
    pos_y: 130,
    width: 300,
    height: 12,
    z_index: 3,
    content: {
      text: "FIESTA DROP",
      fontSize: 10,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "rgba(255,255,255,0.75)",
      textAlign: "left",
      letterSpacing: 5,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Title: La / Temporada
  {
    element_type: "text",
    product_id: null,
    pos_x: 1160,
    pos_y: 165,
    width: 360,
    height: 145,
    z_index: 3,
    content: {
      text: "La\nTemporada",
      fontSize: 82,
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontWeight: "bold",
      fontStyle: "italic",
      color: "#ffffff",
      textAlign: "left",
      letterSpacing: -2,
      lineHeight: 0.88,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // White rule divider
  {
    element_type: "shape",
    product_id: null,
    pos_x: 1160,
    pos_y: 400,
    width: 56,
    height: 2,
    z_index: 3,
    content: {
      shapeType: "line",
      fillColor: "rgba(255,255,255,0.5)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Subtitle
  {
    element_type: "text",
    product_id: null,
    pos_x: 1160,
    pos_y: 430,
    width: 340,
    height: 80,
    z_index: 3,
    content: {
      text: "La colección más alegre de la temporada. Lista para brillar.",
      fontSize: 17,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "normal",
      fontStyle: "normal",
      color: "rgba(255,255,255,0.85)",
      textAlign: "left",
      letterSpacing: 0,
      lineHeight: 1.6,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // CTA pill background (white)
  {
    element_type: "shape",
    product_id: null,
    pos_x: 1160,
    pos_y: 640,
    width: 300,
    height: 66,
    z_index: 4,
    content: {
      shapeType: "rectangle",
      fillColor: "#ffffff",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // CTA text: VER COLECCIÓN
  {
    element_type: "text",
    product_id: null,
    pos_x: 1160,
    pos_y: 665,
    width: 300,
    height: 16,
    z_index: 5,
    content: {
      text: "VER COLECCIÓN",
      fontSize: 14,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "#e8177a",
      textAlign: "center",
      letterSpacing: 2,
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
    console.error("Failed to import Fiesta Drop template:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => {});
  });
