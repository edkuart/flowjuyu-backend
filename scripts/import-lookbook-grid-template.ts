import { QueryTypes } from "sequelize";
import { sequelize } from "../src/config/db";

type TemplateItem = {
  element_type: "product" | "text" | "shape" | "image";
  product_id: string | null;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  z_index: number;
  content: Record<string, unknown> | null;
};

const TEMPLATE_NAME = "Lookbook Grid / Landscape";
const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 900;
const BACKGROUND_STYLE =
  "radial-gradient(circle at 18% 36%, rgba(255,255,255,0.48), rgba(255,255,255,0) 34%), radial-gradient(circle at 77% 19%, rgba(255,248,240,0.2), rgba(255,248,240,0) 26%), linear-gradient(90deg, #f5f0e9 0 58%, #e7d9ca 58% 100%)";

const itemsSnapshot: TemplateItem[] = [
  {
    element_type: "shape",
    product_id: null,
    pos_x: 1152,
    pos_y: 0,
    width: 448,
    height: 112,
    z_index: 1,
    content: {
      shapeType: "rectangle",
      fillColor: "rgba(222,204,185,0.55)",
      borderRadius: 0,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  {
    element_type: "shape",
    product_id: null,
    pos_x: 128,
    pos_y: 0,
    width: 1,
    height: 900,
    z_index: 1,
    content: {
      shapeType: "line",
      fillColor: "rgba(188,165,144,0.2)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  {
    element_type: "shape",
    product_id: null,
    pos_x: 66,
    pos_y: 84,
    width: 28,
    height: 28,
    z_index: 2,
    content: {
      shapeType: "square",
      fillColor: "#cab092",
      borderRadius: 0,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  {
    element_type: "shape",
    product_id: null,
    pos_x: 1530,
    pos_y: 0,
    width: 2,
    height: 96,
    z_index: 2,
    content: {
      shapeType: "line",
      fillColor: "rgba(117,100,87,0.75)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  {
    element_type: "shape",
    product_id: null,
    pos_x: 1516,
    pos_y: 0,
    width: 2,
    height: 96,
    z_index: 2,
    content: {
      shapeType: "line",
      fillColor: "rgba(117,100,87,0.75)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  {
    element_type: "shape",
    product_id: null,
    pos_x: 1502,
    pos_y: 0,
    width: 2,
    height: 96,
    z_index: 2,
    content: {
      shapeType: "line",
      fillColor: "rgba(117,100,87,0.75)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  {
    element_type: "shape",
    product_id: null,
    pos_x: 1488,
    pos_y: 0,
    width: 2,
    height: 96,
    z_index: 2,
    content: {
      shapeType: "line",
      fillColor: "rgba(117,100,87,0.75)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  {
    element_type: "text",
    product_id: null,
    pos_x: 56,
    pos_y: 640,
    width: 28,
    height: 170,
    z_index: 2,
    content: {
      text: "ARTESANAL",
      fontSize: 17,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "normal",
      fontStyle: "normal",
      color: "#b08d6d",
      textAlign: "center",
      letterSpacing: 3.2,
      lineHeight: 1.05,
      paddingX: 0,
      paddingY: 0,
      rotation: -90,
    },
  },
  {
    element_type: "shape",
    product_id: null,
    pos_x: 66,
    pos_y: 764,
    width: 18,
    height: 18,
    z_index: 2,
    content: {
      shapeType: "square",
      fillColor: "#b89979",
      borderRadius: 0,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  {
    element_type: "shape",
    product_id: null,
    pos_x: 66,
    pos_y: 794,
    width: 18,
    height: 18,
    z_index: 2,
    content: {
      shapeType: "square",
      fillColor: "#b89979",
      borderRadius: 0,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  {
    element_type: "shape",
    product_id: null,
    pos_x: 66,
    pos_y: 824,
    width: 18,
    height: 18,
    z_index: 2,
    content: {
      shapeType: "square",
      fillColor: "#b89979",
      borderRadius: 0,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  {
    element_type: "text",
    product_id: null,
    pos_x: 175,
    pos_y: 150,
    width: 440,
    height: 180,
    z_index: 3,
    content: {
      text: "LOOKBOOK\nGRID",
      fontSize: 92,
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontWeight: "normal",
      fontStyle: "normal",
      color: "#3b2f28",
      textAlign: "left",
      letterSpacing: -4.2,
      lineHeight: 0.94,
      paddingX: 0,
      paddingY: 0,
    },
  },
  {
    element_type: "shape",
    product_id: null,
    pos_x: 175,
    pos_y: 392,
    width: 58,
    height: 2,
    z_index: 3,
    content: {
      shapeType: "line",
      fillColor: "#bfa88f",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  {
    element_type: "text",
    product_id: null,
    pos_x: 175,
    pos_y: 430,
    width: 410,
    height: 80,
    z_index: 3,
    content: {
      text: "Presentación de múltiples piezas con lectura editorial clara.",
      fontSize: 23,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "normal",
      fontStyle: "normal",
      color: "#56483e",
      textAlign: "left",
      letterSpacing: 0,
      lineHeight: 1.45,
      paddingX: 0,
      paddingY: 0,
    },
  },
  {
    element_type: "shape",
    product_id: null,
    pos_x: 175,
    pos_y: 658,
    width: 270,
    height: 72,
    z_index: 4,
    content: {
      shapeType: "rectangle",
      fillColor: "#4a3a2f",
      gradientEnabled: true,
      gradientColor2: "#3c2f26",
      gradientAngle: 180,
      gradientType: "linear",
      borderRadius: 0,
      opacity: 1,
      shadowEnabled: true,
      shadowX: 0,
      shadowY: 14,
      shadowBlur: 30,
      shadowSpread: 0,
      shadowColor: "rgba(55,38,28,0.12)",
    },
  },
  {
    element_type: "text",
    product_id: null,
    pos_x: 205,
    pos_y: 681,
    width: 178,
    height: 24,
    z_index: 5,
    content: {
      text: "Ver colección",
      fontSize: 22,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "normal",
      fontStyle: "normal",
      color: "#f4ede6",
      textAlign: "left",
      letterSpacing: 0.2,
      lineHeight: 1.1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  {
    element_type: "text",
    product_id: null,
    pos_x: 394,
    pos_y: 670,
    width: 22,
    height: 38,
    z_index: 5,
    content: {
      text: "→",
      fontSize: 34,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "normal",
      fontStyle: "normal",
      color: "#d0b393",
      textAlign: "center",
      letterSpacing: 0,
      lineHeight: 1,
      paddingX: 0,
      paddingY: 0,
    },
  },
  {
    element_type: "shape",
    product_id: null,
    pos_x: 680,
    pos_y: 112,
    width: 1,
    height: 788,
    z_index: 3,
    content: {
      shapeType: "line",
      fillColor: "rgba(114,92,74,0.08)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  {
    element_type: "shape",
    product_id: null,
    pos_x: 680,
    pos_y: 112,
    width: 920,
    height: 1,
    z_index: 3,
    content: {
      shapeType: "line",
      fillColor: "rgba(114,92,74,0.08)",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  {
    element_type: "product",
    product_id: null,
    pos_x: 680,
    pos_y: 112,
    width: 470,
    height: 670,
    z_index: 4,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: false,
    },
  },
  {
    element_type: "product",
    product_id: null,
    pos_x: 1150,
    pos_y: 112,
    width: 450,
    height: 350,
    z_index: 4,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: false,
    },
  },
  {
    element_type: "product",
    product_id: null,
    pos_x: 1150,
    pos_y: 462,
    width: 450,
    height: 320,
    z_index: 4,
    content: {
      borderRadius: 0,
      objectFit: "cover",
      opacity: 1,
      shadowEnabled: false,
    },
  },
  {
    element_type: "shape",
    product_id: null,
    pos_x: 680,
    pos_y: 782,
    width: 470,
    height: 118,
    z_index: 4,
    content: {
      shapeType: "rectangle",
      fillColor: "#e6d6c4",
      borderRadius: 0,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  {
    element_type: "shape",
    product_id: null,
    pos_x: 1150,
    pos_y: 782,
    width: 450,
    height: 118,
    z_index: 4,
    content: {
      shapeType: "rectangle",
      fillColor: "#f2ece4",
      borderRadius: 0,
      opacity: 1,
      shadowEnabled: false,
    },
  },
  {
    element_type: "shape",
    product_id: null,
    pos_x: 1286,
    pos_y: 836,
    width: 314,
    height: 1,
    z_index: 5,
    content: {
      shapeType: "line",
      fillColor: "#ccb59d",
      borderRadius: 999,
      opacity: 1,
      shadowEnabled: false,
    },
  },
];

async function upsertTemplate() {
  const existing = await sequelize.query<{ id: number }>(
    `
    SELECT id
    FROM collection_templates
    WHERE seller_id IS NULL
      AND name = :name
    LIMIT 1
    `,
    {
      replacements: { name: TEMPLATE_NAME },
      type: QueryTypes.SELECT,
    },
  );

  if (existing[0]?.id) {
    await sequelize.query(
      `
      UPDATE collection_templates
      SET
        thumbnail_url = NULL,
        items_snapshot = CAST(:itemsSnapshot AS jsonb),
        canvas_width = :canvasWidth,
        canvas_height = :canvasHeight,
        background_color = :backgroundColor,
        background_style = :backgroundStyle,
        background_image_url = NULL,
        is_public = true,
        updated_at = NOW()
      WHERE id = :id
      `,
      {
        replacements: {
          id: existing[0].id,
          itemsSnapshot: JSON.stringify(itemsSnapshot),
          canvasWidth: CANVAS_WIDTH,
          canvasHeight: CANVAS_HEIGHT,
          backgroundColor: "#f5f0e9",
          backgroundStyle: BACKGROUND_STYLE,
        },
        type: QueryTypes.UPDATE,
      },
    );

    console.log(`Updated template ${TEMPLATE_NAME} (#${existing[0].id})`);
    return;
  }

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
        backgroundColor: "#f5f0e9",
        backgroundStyle: BACKGROUND_STYLE,
      },
      type: QueryTypes.SELECT,
    },
  );

  console.log(`Inserted template ${TEMPLATE_NAME} (#${inserted[0]?.id ?? "n/a"})`);
}

upsertTemplate()
  .catch((error) => {
    console.error("Failed to import Lookbook Grid template:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => {});
  });
