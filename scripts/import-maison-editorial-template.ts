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

const TEMPLATE_NAME = "Maison Editorial / Landscape";
const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 900;
const BACKGROUND_COLOR = "#141210";
const BACKGROUND_STYLE =
  "radial-gradient(circle at 30% 15%, rgba(199,164,122,0.08) 0, rgba(199,164,122,0) 40%), radial-gradient(circle at 72% 82%, rgba(199,164,122,0.05) 0, rgba(199,164,122,0) 35%), linear-gradient(180deg, #141210 0%, #0e0c0b 100%)";

const itemsSnapshot: TemplateItem[] = [
  // Large decorative circle (bottom-left overflow)
  {
    element_type: "shape",
    product_id: null,
    pos_x: -260,
    pos_y: 520,
    width: 560,
    height: 560,
    z_index: 1,
    content: {
      shapeType: "circle",
      fillColor: "rgba(199,164,122,0)",
      gradientEnabled: false,
      borderRadius: 999,
      opacity: 1,
      strokeColor: "rgba(199,164,122,0.12)",
      strokeWidth: 1,
      shadowEnabled: false,
    },
  },
  // Smaller decorative circle accent
  {
    element_type: "shape",
    product_id: null,
    pos_x: -100,
    pos_y: 660,
    width: 280,
    height: 280,
    z_index: 1,
    content: {
      shapeType: "circle",
      fillColor: "rgba(199,164,122,0)",
      gradientEnabled: false,
      borderRadius: 999,
      opacity: 1,
      strokeColor: "rgba(199,164,122,0.08)",
      strokeWidth: 1,
      shadowEnabled: false,
    },
  },
  // Gold horizontal top accent line
  {
    element_type: "shape",
    product_id: null,
    pos_x: 180,
    pos_y: 120,
    width: 420,
    height: 1,
    z_index: 2,
    content: {
      shapeType: "line",
      fillColor: "#c7a47a",
      gradientEnabled: true,
      gradientColor2: "rgba(199,164,122,0.1)",
      gradientAngle: 0,
      gradientType: "linear",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Gold dot accent
  {
    element_type: "shape",
    product_id: null,
    pos_x: 600,
    pos_y: 112,
    width: 8,
    height: 8,
    z_index: 2,
    content: {
      shapeType: "circle",
      fillColor: "#c7a47a",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Diamond accent
  {
    element_type: "shape",
    product_id: null,
    pos_x: 620,
    pos_y: 106,
    width: 18,
    height: 18,
    z_index: 2,
    content: {
      shapeType: "square",
      fillColor: "rgba(199,164,122,0)",
      borderRadius: 0,
      opacity: 1,
      strokeColor: "#c7a47a",
      strokeWidth: 1,
      shadowEnabled: false,
      rotation: 45,
    },
  },
  // Vertical gold divider (separating left text area from right image grid)
  {
    element_type: "shape",
    product_id: null,
    pos_x: 660,
    pos_y: 110,
    width: 1,
    height: 680,
    z_index: 2,
    content: {
      shapeType: "line",
      fillColor: "rgba(199,164,122,0.25)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Bottom gold horizontal accent line
  {
    element_type: "shape",
    product_id: null,
    pos_x: 180,
    pos_y: 820,
    width: 340,
    height: 1,
    z_index: 2,
    content: {
      shapeType: "line",
      fillColor: "rgba(199,164,122,0.3)",
      gradientEnabled: true,
      gradientColor2: "rgba(199,164,122,0)",
      gradientAngle: 0,
      gradientType: "linear",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Title: MAISON EDITORIAL
  {
    element_type: "text",
    product_id: null,
    pos_x: 180,
    pos_y: 210,
    width: 460,
    height: 200,
    z_index: 3,
    content: {
      text: "MAISON\nEDITORIAL",
      fontSize: 96,
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "#e9e2d8",
      textAlign: "left",
      letterSpacing: -3.8,
      lineHeight: 0.9,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Gold horizontal divider below title
  {
    element_type: "shape",
    product_id: null,
    pos_x: 180,
    pos_y: 443,
    width: 70,
    height: 2,
    z_index: 3,
    content: {
      shapeType: "line",
      fillColor: "#c7a47a",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  // Subtitle description
  {
    element_type: "text",
    product_id: null,
    pos_x: 180,
    pos_y: 481,
    width: 420,
    height: 100,
    z_index: 3,
    content: {
      text: "Lanzamientos premium con dirección editorial y hero dominante.",
      fontSize: 22,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "normal",
      fontStyle: "normal",
      color: "#b7a796",
      textAlign: "left",
      letterSpacing: 0,
      lineHeight: 1.55,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // CTA button background (dark with gold border)
  {
    element_type: "shape",
    product_id: null,
    pos_x: 180,
    pos_y: 650,
    width: 260,
    height: 64,
    z_index: 4,
    content: {
      shapeType: "rectangle",
      fillColor: "rgba(20,18,16,0.6)",
      borderRadius: 0,
      opacity: 1,
      strokeColor: "rgba(199,164,122,0.7)",
      strokeWidth: 1,
      shadowEnabled: false,
    },
  },
  // CTA text
  {
    element_type: "text",
    product_id: null,
    pos_x: 210,
    pos_y: 669,
    width: 180,
    height: 26,
    z_index: 5,
    content: {
      text: "VER COLECCIÓN",
      fontSize: 16,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "bold",
      fontStyle: "normal",
      color: "#e9e2d8",
      textAlign: "left",
      letterSpacing: 2.4,
      lineHeight: 1.1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // CTA arrow
  {
    element_type: "text",
    product_id: null,
    pos_x: 394,
    pos_y: 660,
    width: 26,
    height: 34,
    z_index: 5,
    content: {
      text: "→",
      fontSize: 28,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "normal",
      fontStyle: "normal",
      color: "#c7a47a",
      textAlign: "center",
      letterSpacing: 0,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  // Product frame 1 — large left column
  {
    element_type: "product",
    product_id: null,
    product_image: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=1200&q=80",
    pos_x: 680,
    pos_y: 110,
    width: 440,
    height: 680,
    z_index: 4,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: true,
      shadowX: 0,
      shadowY: 24,
      shadowBlur: 60,
      shadowSpread: 0,
      shadowColor: "rgba(0,0,0,0.45)",
      strokeColor: "rgba(199,164,122,0.35)",
      strokeWidth: 1,
    },
  },
  // Product frame 2 — top-right
  {
    element_type: "product",
    product_id: null,
    product_image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=80",
    pos_x: 1140,
    pos_y: 110,
    width: 300,
    height: 330,
    z_index: 4,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: true,
      shadowX: 0,
      shadowY: 24,
      shadowBlur: 60,
      shadowSpread: 0,
      shadowColor: "rgba(0,0,0,0.45)",
      strokeColor: "rgba(199,164,122,0.35)",
      strokeWidth: 1,
    },
  },
  // Product frame 3 — bottom-right
  {
    element_type: "product",
    product_id: null,
    product_image: "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=1200&q=80",
    pos_x: 1140,
    pos_y: 460,
    width: 300,
    height: 330,
    z_index: 4,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: true,
      shadowX: 0,
      shadowY: 24,
      shadowBlur: 60,
      shadowSpread: 0,
      shadowColor: "rgba(0,0,0,0.45)",
      strokeColor: "rgba(199,164,122,0.35)",
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
    console.error("Failed to import Maison Editorial template:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => {});
  });
