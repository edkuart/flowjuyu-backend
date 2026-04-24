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

const TEMPLATE_NAME = "Premium Offer / Landscape";
const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 900;
const BACKGROUND_COLOR = "#1a2e22";
const BACKGROUND_STYLE =
  "radial-gradient(circle at 50% 0%, rgba(212,186,140,0.06) 0%, rgba(212,186,140,0.025) 26%, rgba(212,186,140,0) 58%)";

const itemsSnapshot: TemplateItem[] = [
  // Vertical divider (left/right zone separator)
  {
    element_type: "shape",
    product_id: null,
    pos_x: 868,
    pos_y: 80,
    width: 1,
    height: 740,
    z_index: 1,
    content: {
      shapeType: "line",
      fillColor: "rgba(212,186,140,0.2)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Product frame A — tall main hero
  {
    element_type: "product",
    product_id: null,
    product_image:
      "https://images.unsplash.com/photo-1520975916090-3105956dac38?auto=format&fit=crop&w=1000&q=85",
    pos_x: 80,
    pos_y: 60,
    width: 420,
    height: 780,
    z_index: 2,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: true,
      shadowX: 0,
      shadowY: 0,
      shadowBlur: 50,
      shadowSpread: 0,
      shadowColor: "rgba(0,0,0,0.35)",
      strokeColor: "rgba(212,186,140,0.25)",
      strokeWidth: 1,
    },
  },
  // Product frame B — top-right accent
  {
    element_type: "product",
    product_id: null,
    product_image:
      "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=900&q=85",
    pos_x: 520,
    pos_y: 60,
    width: 320,
    height: 370,
    z_index: 2,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: true,
      shadowX: 0,
      shadowY: 0,
      shadowBlur: 50,
      shadowSpread: 0,
      shadowColor: "rgba(0,0,0,0.35)",
      strokeColor: "rgba(212,186,140,0.25)",
      strokeWidth: 1,
    },
  },
  // Product frame C — bottom-right accent
  {
    element_type: "product",
    product_id: null,
    product_image:
      "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?auto=format&fit=crop&w=900&q=85",
    pos_x: 520,
    pos_y: 450,
    width: 320,
    height: 390,
    z_index: 2,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: true,
      shadowX: 0,
      shadowY: 0,
      shadowBlur: 50,
      shadowSpread: 0,
      shadowColor: "rgba(0,0,0,0.35)",
      strokeColor: "rgba(212,186,140,0.25)",
      strokeWidth: 1,
    },
  },
  // Overline: OFERTA ESPECIAL
  {
    element_type: "text",
    product_id: null,
    pos_x: 960,
    pos_y: 130,
    width: 240,
    height: 12,
    z_index: 3,
    content: {
      text: "OFERTA ESPECIAL",
      fontSize: 10,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "rgba(212,186,140,0.7)",
      textAlign: "left",
      letterSpacing: 5,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Badge background
  {
    element_type: "shape",
    product_id: null,
    pos_x: 960,
    pos_y: 162,
    width: 148,
    height: 52,
    z_index: 4,
    content: {
      shapeType: "rectangle",
      fillColor: "rgba(212,186,140,0.12)",
      borderRadius: 4,
      opacity: 1,
      strokeColor: "rgba(212,186,140,0.35)",
      strokeWidth: 1,
      shadowEnabled: false,
    },
  },
  // Badge text: HASTA 40%
  {
    element_type: "text",
    product_id: null,
    pos_x: 960,
    pos_y: 177,
    width: 148,
    height: 24,
    z_index: 5,
    content: {
      text: "HASTA 40%",
      fontSize: 22,
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "#d4ba8c",
      textAlign: "center",
      letterSpacing: 0,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Title: Lo mejor de la temporada
  {
    element_type: "text",
    product_id: null,
    pos_x: 960,
    pos_y: 240,
    width: 540,
    height: 195,
    z_index: 3,
    content: {
      text: "Lo mejor\nde la temporada",
      fontSize: 76,
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontWeight: "normal",
      fontStyle: "normal",
      color: "#f0e8d8",
      textAlign: "left",
      letterSpacing: -2,
      lineHeight: 0.94,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Subtitle
  {
    element_type: "text",
    product_id: null,
    pos_x: 960,
    pos_y: 446,
    width: 480,
    height: 100,
    z_index: 3,
    content: {
      text: "Piezas seleccionadas con la misma dirección editorial. Precios de acceso, calidad de atelier.",
      fontSize: 18,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "normal",
      fontStyle: "normal",
      color: "rgba(212,186,140,0.65)",
      textAlign: "left",
      letterSpacing: 0,
      lineHeight: 1.65,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Short rule
  {
    element_type: "shape",
    product_id: null,
    pos_x: 960,
    pos_y: 556,
    width: 56,
    height: 1,
    z_index: 3,
    content: {
      shapeType: "line",
      fillColor: "rgba(212,186,140,0.3)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Stat line 1
  {
    element_type: "text",
    product_id: null,
    pos_x: 960,
    pos_y: 576,
    width: 400,
    height: 14,
    z_index: 3,
    content: {
      text: "Envío gratis · Devolución gratuita",
      fontSize: 13,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "normal",
      fontStyle: "normal",
      color: "rgba(212,186,140,0.5)",
      textAlign: "left",
      letterSpacing: 0.5,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Stat line 2
  {
    element_type: "text",
    product_id: null,
    pos_x: 960,
    pos_y: 608,
    width: 320,
    height: 14,
    z_index: 3,
    content: {
      text: "Disponible por tiempo limitado",
      fontSize: 13,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "normal",
      fontStyle: "italic",
      color: "rgba(212,186,140,0.35)",
      textAlign: "left",
      letterSpacing: 0,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // CTA button background (champagne fill)
  {
    element_type: "shape",
    product_id: null,
    pos_x: 960,
    pos_y: 680,
    width: 280,
    height: 64,
    z_index: 4,
    content: {
      shapeType: "rectangle",
      fillColor: "#d4ba8c",
      borderRadius: 0,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // CTA text: VER OFERTA →
  {
    element_type: "text",
    product_id: null,
    pos_x: 960,
    pos_y: 705,
    width: 280,
    height: 18,
    z_index: 5,
    content: {
      text: "VER OFERTA →",
      fontSize: 15,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "#1a2e22",
      textAlign: "center",
      letterSpacing: 2,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Faint corner number "40"
  {
    element_type: "text",
    product_id: null,
    pos_x: 1356,
    pos_y: 726,
    width: 184,
    height: 144,
    z_index: 2,
    content: {
      text: "40",
      fontSize: 140,
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "rgba(212,186,140,0.03)",
      textAlign: "right",
      letterSpacing: 0,
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
    console.error("Failed to import Premium Offer template:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => {});
  });
