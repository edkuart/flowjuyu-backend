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

const TEMPLATE_NAME = "Modern Atelier / Landscape";
const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 900;
const BACKGROUND_COLOR = "#f7f5f2";
const BACKGROUND_STYLE: string | null = null;

const itemsSnapshot: TemplateItem[] = [
  // Vertical separator (between text zone and right stack)
  {
    element_type: "shape",
    product_id: null,
    pos_x: 1165,
    pos_y: 60,
    width: 1,
    height: 780,
    z_index: 1,
    content: {
      shapeType: "line",
      fillColor: "rgba(154,146,135,0.15)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Product 1 — main large hero (left)
  {
    element_type: "product",
    product_id: null,
    product_image:
      "https://images.unsplash.com/photo-1520975869018-1b1f9d6d9a3c?auto=format&fit=crop&w=1200&q=80",
    pos_x: 80,
    pos_y: 60,
    width: 560,
    height: 780,
    z_index: 2,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: true,
      shadowX: 0,
      shadowY: 20,
      shadowBlur: 40,
      shadowSpread: 0,
      shadowColor: "rgba(0,0,0,0.08)",
    },
  },
  // Small square dot (overline accent)
  {
    element_type: "shape",
    product_id: null,
    pos_x: 754,
    pos_y: 200,
    width: 4,
    height: 4,
    z_index: 3,
    content: {
      shapeType: "square",
      fillColor: "#9a9287",
      borderRadius: 0,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Overline: ATELIER COLLECTION
  {
    element_type: "text",
    product_id: null,
    pos_x: 760,
    pos_y: 200,
    width: 280,
    height: 12,
    z_index: 3,
    content: {
      text: "ATELIER COLLECTION",
      fontSize: 10,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "#9a9287",
      textAlign: "left",
      letterSpacing: 5,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Overline rule
  {
    element_type: "shape",
    product_id: null,
    pos_x: 760,
    pos_y: 224,
    width: 180,
    height: 1,
    z_index: 3,
    content: {
      shapeType: "line",
      fillColor: "rgba(154,146,135,0.3)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Title: Modern Atelier (italic Georgia)
  {
    element_type: "text",
    product_id: null,
    pos_x: 760,
    pos_y: 248,
    width: 400,
    height: 190,
    z_index: 3,
    content: {
      text: "Modern\nAtelier",
      fontSize: 88,
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontWeight: "normal",
      fontStyle: "italic",
      color: "#1a1714",
      textAlign: "left",
      letterSpacing: -2,
      lineHeight: 0.92,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Subtitle
  {
    element_type: "text",
    product_id: null,
    pos_x: 760,
    pos_y: 448,
    width: 360,
    height: 95,
    z_index: 3,
    content: {
      text: "Moda refinada, limpia y contemporánea para colecciones sobrias.",
      fontSize: 19,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "normal",
      fontStyle: "normal",
      color: "#7a746e",
      textAlign: "left",
      letterSpacing: 0,
      lineHeight: 1.6,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Short rule divider
  {
    element_type: "shape",
    product_id: null,
    pos_x: 760,
    pos_y: 548,
    width: 48,
    height: 1,
    z_index: 3,
    content: {
      shapeType: "line",
      fillColor: "rgba(154,146,135,0.4)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // CTA text-link
  {
    element_type: "text",
    product_id: null,
    pos_x: 760,
    pos_y: 572,
    width: 280,
    height: 18,
    z_index: 3,
    content: {
      text: "Explorar colección →",
      fontSize: 14,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "#1a1714",
      textAlign: "left",
      letterSpacing: 1,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Product 2 — top-right stack
  {
    element_type: "product",
    product_id: null,
    product_image:
      "https://images.unsplash.com/photo-1520975922284-9d7b6c79c2df?auto=format&fit=crop&w=900&q=80",
    pos_x: 1180,
    pos_y: 60,
    width: 280,
    height: 380,
    z_index: 2,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: true,
      shadowX: 0,
      shadowY: 20,
      shadowBlur: 40,
      shadowSpread: 0,
      shadowColor: "rgba(0,0,0,0.08)",
    },
  },
  // Product 3 — bottom-right stack
  {
    element_type: "product",
    product_id: null,
    product_image:
      "https://images.unsplash.com/photo-1600180758895-7c5c46a4a7d1?auto=format&fit=crop&w=900&q=80",
    pos_x: 1180,
    pos_y: 460,
    width: 280,
    height: 380,
    z_index: 2,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: true,
      shadowX: 0,
      shadowY: 20,
      shadowBlur: 40,
      shadowSpread: 0,
      shadowColor: "rgba(0,0,0,0.08)",
    },
  },
  // Page number bottom-left
  {
    element_type: "text",
    product_id: null,
    pos_x: 80,
    pos_y: 866,
    width: 80,
    height: 14,
    z_index: 2,
    content: {
      text: "— 01",
      fontSize: 11,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "normal",
      fontStyle: "normal",
      color: "rgba(154,146,135,0.45)",
      textAlign: "left",
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
    console.error("Failed to import Modern Atelier template:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => {});
  });
