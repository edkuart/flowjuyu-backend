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
  z = 1,
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
  z?: number;
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
    z_index: z,
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

const LEGACY_COLLECTION_TEMPLATE_NAMES = [
  "Lanzamiento Editorial Nocturno",
  "Artesania Tierra Viva",
  "Drop Vibrante Boutique",
  "Lujo Marfil y Oro",
  "Mercado Textil Solar",
  "Capsula Minimal Terracota",
  "Oferta de Estreno Esmeralda",
  "Story de Coleccion Bohemia",
];

const DEFAULT_COLLECTION_TEMPLATES = [
  {
    name: "Maison Editorial / Portrait",
    thumbnail_url: null,
    background_color: "#FBF7F0",
    background_style: "linear-gradient(180deg, #FBF7F0, #F0E4D5)",
    background_image_url: null,
    canvas_width: 1080,
    canvas_height: 1350,
    is_public: true,
    items_snapshot: [
      tplShape({ fillColor: "#D0B07A", x: 86, y: 92, w: 180, h: 8, z: 1, borderRadius: 999 }),
      tplText({ text: "COLECCION\nMAISON", fontSize: 92, x: 88, y: 124, w: 520, h: 176, z: 2, color: "#171717", fontFamily: "'Playfair Display', serif", lineHeight: 0.94 }),
      tplText({ text: "Texturas nobles, siluetas limpias y una presencia pensada para vender valor percibido.", fontSize: 28, x: 94, y: 336, w: 420, h: 112, z: 2, color: "#62584E", lineHeight: 1.24 }),
      tplShape({ fillColor: "#F6EFE5", x: 612, y: 136, w: 352, h: 760, z: 1, borderRadius: 38 }),
      tplShape({ fillColor: "#DCCCB7", x: 646, y: 176, w: 284, h: 680, z: 2, borderRadius: 140, opacity: 0.42 }),
      tplText({ text: "Hero image", fontSize: 34, x: 700, y: 468, w: 176, h: 50, z: 3, color: "#8C7963", textAlign: "center" }),
      tplShape({ fillColor: "#171717", x: 88, y: 1098, w: 278, h: 82, z: 2, borderRadius: 999 }),
      tplText({ text: "Descubrir ahora", fontSize: 24, x: 116, y: 1122, w: 220, h: 34, z: 3, color: "#F9F5EE", textAlign: "center" }),
      tplText({ text: "Edicion inaugural", fontSize: 22, x: 702, y: 1122, w: 174, h: 28, z: 3, color: "#6A5D52", textAlign: "center", letterSpacing: 1 }),
    ],
  },
  {
    name: "Maison Editorial / Square",
    thumbnail_url: null,
    background_color: "#F7F1E8",
    background_style: "linear-gradient(135deg, #F7F1E8, #E7DDD0)",
    background_image_url: null,
    canvas_width: 1080,
    canvas_height: 1080,
    is_public: true,
    items_snapshot: [
      tplText({ text: "MAISON\nCOLLECTION", fontSize: 90, x: 72, y: 92, w: 470, h: 168, z: 2, color: "#151515", fontFamily: "'Playfair Display', serif", lineHeight: 0.94 }),
      tplText({ text: "Lanzamiento premium con una pieza hero y narrativa minima.", fontSize: 28, x: 78, y: 294, w: 406, h: 94, z: 2, color: "#64584D", lineHeight: 1.22 }),
      tplShape({ fillColor: "#F5EEE4", x: 610, y: 94, w: 360, h: 758, z: 1, borderRadius: 34 }),
      tplShape({ fillColor: "#D8CEC0", x: 638, y: 126, w: 304, h: 694, z: 2, borderRadius: 128, opacity: 0.46 }),
      tplText({ text: "Hero image", fontSize: 34, x: 698, y: 420, w: 184, h: 48, z: 3, color: "#8B7863", textAlign: "center" }),
      tplShape({ fillColor: "#C7A56A", x: 72, y: 838, w: 248, h: 74, z: 2, borderRadius: 999 }),
      tplText({ text: "Disponible hoy", fontSize: 24, x: 96, y: 858, w: 200, h: 32, z: 3, color: "#171717", textAlign: "center" }),
      tplText({ text: "Signature line", fontSize: 22, x: 72, y: 944, w: 180, h: 28, z: 2, color: "#5F564C", letterSpacing: 1.5 }),
    ],
  },
  {
    name: "Maison Editorial / Landscape",
    thumbnail_url: null,
    background_color: "#F8F4EC",
    background_style: "linear-gradient(120deg, #F8F4EC, #E6DCCF)",
    background_image_url: null,
    canvas_width: 1600,
    canvas_height: 900,
    is_public: true,
    items_snapshot: [
      tplText({ text: "MAISON\nEDITORIAL", fontSize: 102, x: 112, y: 110, w: 500, h: 180, z: 2, color: "#131313", fontFamily: "'Playfair Display', serif", lineHeight: 0.92 }),
      tplText({ text: "Una portada pensada para escaparate digital, con mas aire y menos ruido visual.", fontSize: 32, x: 118, y: 336, w: 474, h: 108, z: 2, color: "#63574D", lineHeight: 1.22 }),
      tplShape({ fillColor: "#F6EFE4", x: 940, y: 84, w: 472, h: 732, z: 1, borderRadius: 34 }),
      tplShape({ fillColor: "#CFC1B0", x: 978, y: 120, w: 396, h: 658, z: 2, borderRadius: 180, opacity: 0.44 }),
      tplText({ text: "Hero image", fontSize: 36, x: 1088, y: 402, w: 216, h: 50, z: 3, color: "#8A775F", textAlign: "center" }),
      tplShape({ fillColor: "#131313", x: 118, y: 680, w: 250, h: 76, z: 2, borderRadius: 999 }),
      tplText({ text: "Ver coleccion", fontSize: 24, x: 142, y: 702, w: 202, h: 32, z: 3, color: "#FAF5ED", textAlign: "center" }),
    ],
  },
  {
    name: "Signature Drop / Portrait",
    thumbnail_url: null,
    background_color: "#0F1114",
    background_style: "linear-gradient(180deg, #0F1114, #221A1D)",
    background_image_url: null,
    canvas_width: 1080,
    canvas_height: 1350,
    is_public: true,
    items_snapshot: [
      tplShape({ fillColor: "#8C2330", x: 82, y: 84, w: 184, h: 50, z: 1, borderRadius: 999 }),
      tplText({ text: "LIMITED DROP", fontSize: 22, x: 100, y: 98, w: 148, h: 24, z: 2, color: "#F5F1EA", textAlign: "center", letterSpacing: 1.8 }),
      tplText({ text: "SIGNATURE\nDROP", fontSize: 116, x: 76, y: 168, w: 540, h: 190, z: 2, color: "#F5F1EA", fontFamily: "'Bebas Neue', sans-serif", lineHeight: 0.9, letterSpacing: 1.2 }),
      tplText({ text: "Color, tension visual y una pieza central imposible de ignorar.", fontSize: 28, x: 84, y: 396, w: 446, h: 96, z: 2, color: "#C9BCB2", lineHeight: 1.18 }),
      tplShape({ fillColor: "#171A21", x: 610, y: 160, w: 360, h: 820, z: 1, borderRadius: 40 }),
      tplShape({ fillColor: "#D4B38A", x: 650, y: 208, w: 280, h: 724, z: 2, borderRadius: 150, opacity: 0.18 }),
      tplText({ text: "Hero image", fontSize: 36, x: 696, y: 506, w: 188, h: 52, z: 3, color: "#F4EFE8", textAlign: "center" }),
      tplShape({ fillColor: "#F5F1EA", x: 82, y: 1102, w: 274, h: 84, z: 2, borderRadius: 999 }),
      tplText({ text: "Shop the drop", fontSize: 24, x: 108, y: 1128, w: 222, h: 32, z: 3, color: "#111318", textAlign: "center" }),
    ],
  },
  {
    name: "Signature Drop / Square",
    thumbnail_url: null,
    background_color: "#101215",
    background_style: "linear-gradient(135deg, #101215, #20171B)",
    background_image_url: null,
    canvas_width: 1080,
    canvas_height: 1080,
    is_public: true,
    items_snapshot: [
      tplShape({ fillColor: "#7A1F2A", x: 74, y: 72, w: 172, h: 46, z: 1, borderRadius: 999 }),
      tplText({ text: "NEW DROP", fontSize: 20, x: 92, y: 84, w: 136, h: 24, z: 2, color: "#F3EDE4", textAlign: "center", letterSpacing: 1.7 }),
      tplText({ text: "DROP\n01", fontSize: 124, x: 72, y: 144, w: 396, h: 196, z: 2, color: "#F3EDE4", fontFamily: "'Bebas Neue', sans-serif", lineHeight: 0.86 }),
      tplText({ text: "Hecho para lanzamientos rapidos, colecciones cortas y anuncios de alto impacto.", fontSize: 28, x: 78, y: 358, w: 404, h: 112, z: 2, color: "#C5B8AE", lineHeight: 1.18 }),
      tplShape({ fillColor: "#191C23", x: 586, y: 116, w: 390, h: 674, z: 1, borderRadius: 42 }),
      tplText({ text: "Hero image", fontSize: 34, x: 682, y: 404, w: 198, h: 48, z: 2, color: "#F3EDE4", textAlign: "center" }),
      tplShape({ fillColor: "#C3A47A", x: 76, y: 840, w: 286, h: 90, z: 2, borderRadius: 999 }),
      tplText({ text: "Disponible ahora", fontSize: 25, x: 104, y: 866, w: 230, h: 34, z: 3, color: "#101215", textAlign: "center" }),
    ],
  },
  {
    name: "Crafted Heritage / Portrait",
    thumbnail_url: null,
    background_color: "#EFE1D2",
    background_style: "linear-gradient(165deg, #F3E8DB, #D6B49A)",
    background_image_url: null,
    canvas_width: 1080,
    canvas_height: 1350,
    is_public: true,
    items_snapshot: [
      tplShape({ fillColor: "#6C4030", x: 72, y: 92, w: 360, h: 360, z: 0, borderRadius: 999, opacity: 0.12 }),
      tplText({ text: "CRAFTED\nHERITAGE", fontSize: 88, x: 74, y: 116, w: 520, h: 172, z: 2, color: "#6C3826", fontFamily: "'Abril Fatface', serif", lineHeight: 0.96 }),
      tplText({ text: "Origen, detalle y oficio convertidos en una coleccion de alto valor visual.", fontSize: 28, x: 82, y: 318, w: 464, h: 110, z: 2, color: "#5E473D", lineHeight: 1.24 }),
      tplShape({ fillColor: "#FBF6EF", x: 608, y: 164, w: 366, h: 538, z: 1, borderRadius: 34 }),
      tplText({ text: "Foto de\ntextura", fontSize: 34, x: 676, y: 384, w: 230, h: 90, z: 2, color: "#B1876B", textAlign: "center" }),
      tplShape({ fillColor: "#2D5D4F", x: 76, y: 600, w: 926, h: 276, z: 1, borderRadius: 30, opacity: 0.96 }),
      tplText({ text: "Hecho a mano · edicion limitada", fontSize: 32, x: 120, y: 646, w: 430, h: 44, z: 2, color: "#FFF8EE", letterSpacing: 0.8 }),
      tplText({ text: "Usa este bloque para explicar el origen de la coleccion, el material o la tecnica artesanal que la vuelve unica.", fontSize: 24, x: 122, y: 716, w: 560, h: 90, z: 2, color: "#D7E7DF", lineHeight: 1.24 }),
      tplShape({ fillColor: "#C07A4E", x: 730, y: 658, w: 198, h: 62, z: 2, borderRadius: 999 }),
      tplText({ text: "Ver historia", fontSize: 22, x: 754, y: 676, w: 150, h: 28, z: 3, color: "#FFF8EE", textAlign: "center" }),
    ],
  },
  {
    name: "Crafted Heritage / Landscape",
    thumbnail_url: null,
    background_color: "#F2E7DA",
    background_style: "linear-gradient(135deg, #F2E7DA, #D8B89A)",
    background_image_url: null,
    canvas_width: 1600,
    canvas_height: 900,
    is_public: true,
    items_snapshot: [
      tplShape({ fillColor: "#744531", x: 80, y: 86, w: 250, h: 250, z: 0, borderRadius: 999, opacity: 0.11 }),
      tplText({ text: "HERITAGE\nCOLLECTION", fontSize: 96, x: 94, y: 110, w: 480, h: 172, z: 2, color: "#744531", fontFamily: "'Playfair Display', serif", lineHeight: 0.94 }),
      tplText({ text: "Pensada para telas, fibras y piezas que deben verse materiales, refinadas y profundamente humanas.", fontSize: 31, x: 100, y: 330, w: 486, h: 112, z: 2, color: "#5E473B", lineHeight: 1.22 }),
      tplShape({ fillColor: "#FBF6EF", x: 936, y: 92, w: 500, h: 716, z: 1, borderRadius: 32 }),
      tplText({ text: "Proceso /\ntextura", fontSize: 38, x: 1086, y: 350, w: 200, h: 84, z: 2, color: "#B28668", textAlign: "center" }),
      tplShape({ fillColor: "#315C50", x: 100, y: 686, w: 254, h: 72, z: 2, borderRadius: 999 }),
      tplText({ text: "Ver coleccion", fontSize: 24, x: 124, y: 708, w: 206, h: 32, z: 3, color: "#FBF6EF", textAlign: "center" }),
    ],
  },
  {
    name: "Modern Atelier / Portrait",
    thumbnail_url: null,
    background_color: "#FAF6F1",
    background_style: "linear-gradient(180deg, #FAF6F1, #E8D2C3)",
    background_image_url: null,
    canvas_width: 1080,
    canvas_height: 1350,
    is_public: true,
    items_snapshot: [
      tplShape({ fillColor: "#D8B4A2", x: 758, y: 90, w: 220, h: 220, z: 0, borderRadius: 999, opacity: 0.2 }),
      tplText({ text: "ATELIER\nMODERNO", fontSize: 86, x: 96, y: 120, w: 430, h: 156, z: 2, color: "#342924", fontFamily: "'Josefin Sans', sans-serif", lineHeight: 0.98, letterSpacing: 1 }),
      tplText({ text: "Formas suaves, composicion limpia y una presencia elegante para moda refinada.", fontSize: 27, x: 102, y: 316, w: 416, h: 98, z: 2, color: "#645349", lineHeight: 1.22 }),
      tplShape({ fillColor: "#F7F0E8", x: 612, y: 184, w: 308, h: 780, z: 1, borderRadius: 32 }),
      tplText({ text: "Foto hero", fontSize: 32, x: 684, y: 540, w: 164, h: 44, z: 2, color: "#C08F7B", textAlign: "center" }),
      tplShape({ fillColor: "#342924", x: 96, y: 1020, w: 244, h: 74, z: 2, borderRadius: 999 }),
      tplText({ text: "Nueva capsula", fontSize: 24, x: 120, y: 1042, w: 196, h: 30, z: 3, color: "#F9F4EE", textAlign: "center" }),
      tplText({ text: "Lineas puras · tonos suaves", fontSize: 22, x: 96, y: 1128, w: 240, h: 30, z: 2, color: "#746255", letterSpacing: 0.6 }),
    ],
  },
  {
    name: "Modern Atelier / Square",
    thumbnail_url: null,
    background_color: "#F6F0EA",
    background_style: "linear-gradient(140deg, #F6F0EA, #DFC4B5)",
    background_image_url: null,
    canvas_width: 1080,
    canvas_height: 1080,
    is_public: true,
    items_snapshot: [
      tplText({ text: "ATELIER", fontSize: 84, x: 86, y: 94, w: 300, h: 92, z: 2, color: "#3A2E28", fontFamily: "'Josefin Sans', sans-serif", letterSpacing: 2 }),
      tplText({ text: "Modern silhouettes", fontSize: 30, x: 92, y: 214, w: 280, h: 42, z: 2, color: "#6C5A50", letterSpacing: 0.5 }),
      tplShape({ fillColor: "#FCF6F1", x: 138, y: 298, w: 310, h: 650, z: 1, borderRadius: 34 }),
      tplText({ text: "Hero photo", fontSize: 32, x: 206, y: 580, w: 174, h: 44, z: 2, color: "#BE9583", textAlign: "center" }),
      tplText({ text: "Una composicion limpia para lanzamientos serenos y producto protagonista.", fontSize: 26, x: 556, y: 348, w: 360, h: 120, z: 2, color: "#65554A", lineHeight: 1.22 }),
      tplShape({ fillColor: "#D9B7A5", x: 558, y: 748, w: 280, h: 82, z: 1, borderRadius: 999 }),
      tplText({ text: "Descubrir linea", fontSize: 24, x: 584, y: 772, w: 228, h: 30, z: 2, color: "#3A2E28", textAlign: "center" }),
    ],
  },
  {
    name: "Premium Offer / Portrait",
    thumbnail_url: null,
    background_color: "#123936",
    background_style: "linear-gradient(180deg, #123936, #1D2425)",
    background_image_url: null,
    canvas_width: 1080,
    canvas_height: 1350,
    is_public: true,
    items_snapshot: [
      tplText({ text: "PRIVATE\nOFFER", fontSize: 104, x: 94, y: 124, w: 500, h: 178, z: 2, color: "#F7F2E9", fontFamily: "'Bebas Neue', sans-serif", lineHeight: 0.9, letterSpacing: 1 }),
      tplText({ text: "Convierte una promo en una pieza de alto valor visual, sin perder sofisticacion.", fontSize: 28, x: 102, y: 334, w: 436, h: 102, z: 2, color: "#CFDDD7", lineHeight: 1.22 }),
      tplShape({ fillColor: "#F7F2E9", x: 650, y: 176, w: 268, h: 510, z: 1, borderRadius: 30 }),
      tplText({ text: "Producto\nestrella", fontSize: 32, x: 690, y: 390, w: 188, h: 84, z: 2, color: "#8F7A58", textAlign: "center" }),
      tplShape({ fillColor: "#C9A25E", x: 110, y: 766, w: 304, h: 120, z: 2, borderRadius: 28 }),
      tplText({ text: "20% OFF", fontSize: 42, x: 150, y: 804, w: 224, h: 44, z: 3, color: "#163431", textAlign: "center" }),
      tplText({ text: "Exclusivo hoy", fontSize: 23, x: 176, y: 852, w: 172, h: 28, z: 3, color: "#163431", textAlign: "center", letterSpacing: 1 }),
      tplShape({ fillColor: "#F7F2E9", x: 110, y: 1080, w: 260, h: 78, z: 2, borderRadius: 999 }),
      tplText({ text: "Comprar ahora", fontSize: 24, x: 136, y: 1102, w: 208, h: 30, z: 3, color: "#163431", textAlign: "center" }),
    ],
  },
  {
    name: "Premium Offer / Square",
    thumbnail_url: null,
    background_color: "#103A37",
    background_style: "linear-gradient(135deg, #103A37, #203334)",
    background_image_url: null,
    canvas_width: 1080,
    canvas_height: 1080,
    is_public: true,
    items_snapshot: [
      tplText({ text: "EARLY\nACCESS", fontSize: 108, x: 90, y: 124, w: 444, h: 170, z: 2, color: "#F5ECDD", fontFamily: "'Bebas Neue', sans-serif", lineHeight: 0.9 }),
      tplText({ text: "Haz que la oferta se sienta exclusiva, no barata.", fontSize: 28, x: 98, y: 320, w: 360, h: 92, z: 2, color: "#D9E5DE", lineHeight: 1.2 }),
      tplShape({ fillColor: "#F5ECDD", x: 648, y: 126, w: 252, h: 450, z: 1, borderRadius: 30 }),
      tplText({ text: "Hero", fontSize: 32, x: 724, y: 334, w: 100, h: 40, z: 2, color: "#8D7758", textAlign: "center" }),
      tplShape({ fillColor: "#D2AE67", x: 98, y: 752, w: 300, h: 112, z: 2, borderRadius: 24 }),
      tplText({ text: "10% OFF", fontSize: 40, x: 134, y: 790, w: 228, h: 40, z: 3, color: "#163431", textAlign: "center" }),
      tplText({ text: "Solo por lanzamiento", fontSize: 22, x: 490, y: 780, w: 290, h: 32, z: 2, color: "#D8E4DE", letterSpacing: 0.5 }),
      tplShape({ fillColor: "#F5ECDD", x: 490, y: 836, w: 248, h: 76, z: 2, borderRadius: 999 }),
      tplText({ text: "Ver ahora", fontSize: 24, x: 520, y: 858, w: 188, h: 30, z: 3, color: "#163431", textAlign: "center" }),
    ],
  },
  {
    name: "Lookbook Grid / Landscape",
    thumbnail_url: null,
    background_color: "#F4EFE7",
    background_style: "linear-gradient(140deg, #F4EFE7, #DDD0C3)",
    background_image_url: null,
    canvas_width: 1600,
    canvas_height: 900,
    is_public: true,
    items_snapshot: [
      tplText({ text: "LOOKBOOK", fontSize: 92, x: 106, y: 88, w: 360, h: 96, z: 2, color: "#1B1B1B", fontFamily: "'Montserrat', sans-serif", letterSpacing: 1.4 }),
      tplText({ text: "Tres piezas clave, una sola historia visual.", fontSize: 30, x: 112, y: 202, w: 390, h: 44, z: 2, color: "#6A5D52" }),
      tplShape({ fillColor: "#FCF8F1", x: 106, y: 314, w: 280, h: 420, z: 1, borderRadius: 26 }),
      tplShape({ fillColor: "#EDE2D7", x: 432, y: 254, w: 320, h: 480, z: 1, borderRadius: 26 }),
      tplShape({ fillColor: "#C8B6A0", x: 798, y: 314, w: 280, h: 420, z: 1, borderRadius: 26 }),
      tplText({ text: "Look 01", fontSize: 28, x: 182, y: 500, w: 128, h: 36, z: 2, color: "#B49773", textAlign: "center" }),
      tplText({ text: "Look 02", fontSize: 28, x: 528, y: 500, w: 128, h: 36, z: 2, color: "#9A856B", textAlign: "center" }),
      tplText({ text: "Look 03", fontSize: 28, x: 874, y: 500, w: 128, h: 36, z: 2, color: "#FFF8EF", textAlign: "center" }),
      tplShape({ fillColor: "#1B1B1B", x: 1184, y: 150, w: 256, h: 76, z: 2, borderRadius: 999 }),
      tplText({ text: "Ver seleccion", fontSize: 24, x: 1210, y: 172, w: 204, h: 30, z: 3, color: "#F4EFE7", textAlign: "center" }),
      tplText({ text: "Ideal para portada de lineup o banner de coleccion.", fontSize: 27, x: 1188, y: 278, w: 258, h: 90, z: 2, color: "#65594F", lineHeight: 1.2 }),
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

  await run(
    "vendedor_perfil col live_chat_slow_mode_seconds",
    `ALTER TABLE vendedor_perfil ADD COLUMN IF NOT EXISTS live_chat_slow_mode_seconds INTEGER NOT NULL DEFAULT 0`
  );

  await run(
    "vendedor_perfil col live_chat_pinned_message",
    `ALTER TABLE vendedor_perfil ADD COLUMN IF NOT EXISTS live_chat_pinned_message VARCHAR(240) NULL`
  );

  await run(
    "live_chat_messages table",
    `
    CREATE TABLE IF NOT EXISTS live_chat_messages (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      seller_id  INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      buyer_name VARCHAR(120) NOT NULL,
      sender_role VARCHAR(20) NOT NULL DEFAULT 'buyer' CHECK (sender_role IN ('buyer', 'seller')),
      message    VARCHAR(240) NOT NULL,
      status     VARCHAR(20)  NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'deleted')),
      created_at TIMESTAMP    NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP    NOT NULL DEFAULT NOW()
    )
    `
  );

  await run(
    "live_chat_messages index seller_created",
    `CREATE INDEX IF NOT EXISTS idx_live_chat_messages_seller_created ON live_chat_messages (seller_id, created_at DESC)`
  );

  await run(
    "live_chat_messages col sender_role",
    `ALTER TABLE live_chat_messages ADD COLUMN IF NOT EXISTS sender_role VARCHAR(20) NOT NULL DEFAULT 'buyer'`
  );

  await run(
    "live_chat_messages index seller_status_created",
    `CREATE INDEX IF NOT EXISTS idx_live_chat_messages_seller_status_created ON live_chat_messages (seller_id, status, created_at DESC)`
  );

  await run(
    "live_chat_messages index user_created",
    `CREATE INDEX IF NOT EXISTS idx_live_chat_messages_user_created ON live_chat_messages (user_id, created_at DESC)`
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
    for (const legacyName of LEGACY_COLLECTION_TEMPLATE_NAMES) {
      await sequelize.query(
        `DELETE FROM collection_templates WHERE seller_id IS NULL AND name = :name`,
        { replacements: { name: legacyName } }
      );
    }

    for (const template of DEFAULT_COLLECTION_TEMPLATES) {
      await sequelize.query(
        `DELETE FROM collection_templates WHERE seller_id IS NULL AND name = :name`,
        { replacements: { name: template.name } }
      );

      await sequelize.query(
        `
        INSERT INTO collection_templates
          (seller_id, name, thumbnail_url, items_snapshot, canvas_width, canvas_height, background_color, background_style, background_image_url, is_public, created_at, updated_at)
        VALUES (
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
