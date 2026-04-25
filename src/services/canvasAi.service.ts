// src/services/canvasAi.service.ts
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai    = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type AiProduct = {
  id: string;
  nombre: string;
  precio: number | string;
  imagen_url: string | null;
};

export type AiCanvasRequest = {
  prompt: string;
  title: string;
  tagline?: string;
  cta?: string;
  style: "minimal" | "bold" | "editorial" | "playful" | "luxury" | "artisanal";
  palette: "auto" | "neutral" | "earth" | "dark" | "vibrant";
  layout: "hero" | "grid" | "asymmetric" | "collage";
  productCount: number;
  canvasWidth: number;
  canvasHeight: number;
  sellerName: string;
  products: AiProduct[];
  generateBgImage?: boolean;
};

export type AiCanvasItem = {
  element_type: "text" | "shape" | "product";
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  z_index: number;
  product_id?: string | null;
  content: Record<string, unknown>;
};

export type AiCanvasResult = {
  background_color: string;
  background_style: string | null;
  background_image_base64: string | null;
  background_image_content_type: "image/png" | "image/jpeg" | null;
  items: AiCanvasItem[];
};

const AVAILABLE_FONTS = [
  "inherit",
  "'Inter', sans-serif", "'Poppins', sans-serif", "'Montserrat', sans-serif",
  "'DM Sans', sans-serif", "'Manrope', sans-serif", "'Work Sans', sans-serif",
  "'Nunito', sans-serif", "'Lato', sans-serif", "'Raleway', sans-serif",
  "'Josefin Sans', sans-serif", "'Oswald', sans-serif", "'Bebas Neue', sans-serif",
  "'Russo One', sans-serif", "'Righteous', sans-serif", "'Fredoka One', sans-serif",
  "'Baloo 2', sans-serif", "'Playfair Display', serif", "'Cormorant Garamond', serif",
  "'Lora', serif", "'EB Garamond', serif", "'Libre Baskerville', serif",
  "'Abril Fatface', serif", "'Great Vibes', cursive", "'Sacramento', cursive",
  "'Dancing Script', cursive", "'Pacifico', cursive", "'Satisfy', cursive",
  "'Space Mono', monospace",
];

const STYLE_DESC: Record<AiCanvasRequest["style"], string> = {
  minimal:    "Clean and modern — generous white space, refined typography, minimal 2-color palette, elegant restraint. No clutter.",
  bold:       "Bold and impactful — strong display fonts, high contrast, energetic overlapping composition, large dominant headline.",
  editorial:  "Editorial and luxurious — serif typography, generous breathing room, muted earthy tones, magazine-style asymmetry.",
  playful:    "Playful and vibrant — fun display fonts, bright accents, dynamic decorative shapes, loose and lively energy.",
  luxury:     "Luxury and premium — black/gold/champagne palette, elegant serif or thin sans fonts, minimal elements, maximum prestige.",
  artisanal:  "Artisanal and handcrafted — warm earth tones, script typography, organic shapes, natural textures feel, rustic charm.",
};

const PALETTE_DESC: Record<AiCanvasRequest["palette"], string> = {
  auto:     "Choose the palette that best matches the style and product context.",
  neutral:  "Whites, creams, warm grays, off-whites. Subtle and sophisticated.",
  earth:    "Terracotta, sand, olive, brown, warm ochre. Organic and grounded.",
  dark:     "Deep navy, charcoal, near-black backgrounds with light text. Dramatic.",
  vibrant:  "Bold saturated colors — coral, electric blue, vivid green, hot pink. Energetic.",
};

const LAYOUT_DESC: Record<AiCanvasRequest["layout"], string> = {
  hero:       "Hero layout: one large dominant product image centered or slightly off-center, large title overlay or beside it, supporting elements around it. Classic and impactful.",
  grid:       "Grid layout: products arranged in an organized grid or row, equal visual weight, title at top or bottom, clean and systematic.",
  asymmetric: "Asymmetric layout: intentionally unbalanced placement — title and products at different scales, overlapping elements, dynamic diagonal tension.",
  collage:    "Collage layout: overlapping product images at varied scales and slight rotations, layered shapes behind, rich texture, editorial depth.",
};

function buildSystemPrompt(req: AiCanvasRequest): string {
  const productList = req.products.length > 0
    ? req.products
        .map((p) => `  id="${p.id}"  name="${p.nombre}"  price=Q${p.precio}${p.imagen_url ? "  [has image]" : "  [no image]"}`)
        .join("\n")
    : "  (No products — use only text and shape elements)";

  const ctaLine = req.cta ? `Call-to-action text: "${req.cta}"` : "No CTA specified.";
  const taglineLine = req.tagline ? `Tagline / slogan: "${req.tagline}"` : "No tagline specified.";

  return `You are a senior visual designer creating product collection marketing canvases for Latin American e-commerce sellers. Your output will be rendered directly as a marketing canvas with draggable elements.

## Canvas
- Dimensions: ${req.canvasWidth} × ${req.canvasHeight} px  (width × height)
- Coordinate origin: top-left = (0, 0)
- ALL elements must stay within bounds:
    pos_x ≥ 0,  pos_y ≥ 0
    pos_x + width ≤ ${req.canvasWidth}
    pos_y + height ≤ ${req.canvasHeight}
- Minimum 20px margin from every edge

## Seller & Collection Brief
- Seller: ${req.sellerName}
- Collection title: "${req.title}"
- ${taglineLine}
- ${ctaLine}
- Creative brief: ${req.prompt}

## Products to feature (show exactly ${req.productCount} of them)
${productList}

Choose the ${req.productCount} most visually interesting products (prefer ones with images). Feature EXACTLY ${req.productCount} product elements. Do not add more.

## Design System

### Style: ${req.style.toUpperCase()}
${STYLE_DESC[req.style]}

### Color Palette: ${req.palette.toUpperCase()}
${PALETTE_DESC[req.palette]}

### Layout: ${req.layout.toUpperCase()}
${LAYOUT_DESC[req.layout]}

---

## Element Types

### "product"
Renders a product image. Required content fields:
  borderRadius: 0–32
  opacity: 0.8–1
  objectFit: "cover" | "contain"
  animation: entrance animation (see below)
  motion: "none"
Must have a valid product_id from the list above.

### "text"
Required content fields:
  text: string (the display text — concise, impactful; use the provided title/tagline/CTA)
  fontSize: 12–120 px
  fontFamily: one of the available fonts
  fontWeight: "normal" | "bold" | "600" | "700"
  fontStyle: "normal" | "italic"
  color: hex (#RRGGBB)
  textAlign: "left" | "center" | "right"
  letterSpacing: −2 to 10
  lineHeight: 0.9 to 2.2
  shadow: boolean
  shadowColor, shadowX, shadowY, shadowBlur (if shadow=true)
  outline: boolean
  outlineColor, outlineWidth 1–4 (if outline=true)
  animation: entrance animation
  motion: motion animation (max 2 elements total)
  rotation: −15 to 15 (optional tilt)

### "shape"
Required content fields:
  shapeType: "rectangle" | "circle" | "triangle" | "star" | "diamond" | "capsule" | "arch" | "blob" | "sparkle" | "wave" | "line"
  fillColor: hex
  opacity: 0.05–1
  borderRadius: 0–999
  gradientEnabled: boolean
  gradientColor2, gradientAngle 0–359, gradientType "linear"|"radial" (if gradient)
  strokeWidth: 0–6
  strokeColor (if strokeWidth > 0)
  animation, motion, rotation

---

## Available fonts
${AVAILABLE_FONTS.map((f) => `"${f}"`).join(", ")}

## Entrance animations (plays once on load — stagger by z_index)
"none" | "fadeIn" | "slideUp" | "slideLeft" | "zoomIn"

## Motion animations (loops — max 2 total across all elements)
"none" | "float" | "pulse" | "spin" | "shake" | "bounce"

---

## Mandatory composition rules

1. TITLE first: always include the collection title "${req.title}" as a prominent text element
2. ${req.tagline ? `TAGLINE: include "${req.tagline}" as a secondary text element` : "Add a short supporting subtitle that fits the style"}
3. ${req.cta ? `CTA: include "${req.cta}" styled as a button-like shape+text combo or badge` : "Optionally add a subtle action text"}
4. PRODUCTS: place exactly ${req.productCount} product element(s), sized min 150px on the shortest side
5. VISUAL HIERARCHY: Title (large) → Products (prominent) → Tagline (medium) → Decorative (subtle)
6. BALANCE: spread elements across the full canvas — avoid clustering
7. TYPOGRAPHY: max 2 font families; pick fonts that express the ${req.style} style
8. DENSITY: 5–12 total elements. Quality over quantity.
9. ANIMATIONS: stagger entrance animations by z_index order; keep motion to 0–2 elements

## Z-index guide
Background shapes: 1–3 | Products: 4–7 | Text: 6–10 | Foreground accents: 8–11

Call the set_canvas tool with the complete canvas design. Be creative, professional, and faithfully translate the brief into a compelling visual layout.`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isHex(s: unknown): s is string {
  return typeof s === "string" && /^#[0-9a-fA-F]{3,8}$/.test(s);
}

function sanitizeItem(
  raw: Record<string, unknown>,
  canvasWidth: number,
  canvasHeight: number,
  validProductIds: Set<string>,
): AiCanvasItem | null {
  const elementType = raw.element_type as string;
  if (!["text", "shape", "product"].includes(elementType)) return null;

  const width  = clamp(Number(raw.width  ?? 100), 10, canvasWidth);
  const height = clamp(Number(raw.height ?? 80),  10, canvasHeight);
  const pos_x  = clamp(Number(raw.pos_x  ?? 0),   0, canvasWidth  - width);
  const pos_y  = clamp(Number(raw.pos_y  ?? 0),   0, canvasHeight - height);
  const z_index = clamp(Number(raw.z_index ?? 0), 0, 20);

  let product_id: string | null = null;
  if (elementType === "product") {
    const rawId = typeof raw.product_id === "string" ? raw.product_id.trim() : "";
    if (!rawId || !validProductIds.has(rawId)) return null;
    product_id = rawId;
  }

  const content = (typeof raw.content === "object" && raw.content !== null)
    ? raw.content as Record<string, unknown>
    : {};

  return { element_type: elementType as AiCanvasItem["element_type"], pos_x, pos_y, width, height, z_index, product_id, content };
}

function sanitizeResult(
  raw: Record<string, unknown>,
  req: AiCanvasRequest,
  validProductIds: Set<string>,
): Omit<AiCanvasResult, "background_image_base64" | "background_image_content_type"> {
  const background_color = isHex(raw.background_color) ? raw.background_color : "#FFFFFF";

  const rawStyle = typeof raw.background_style === "string" ? raw.background_style.trim() : null;
  const background_style =
    rawStyle && (rawStyle.includes("linear-gradient") || rawStyle.includes("radial-gradient"))
      ? rawStyle
      : null;

  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items: AiCanvasItem[] = rawItems
    .slice(0, 15)
    .map((item) => sanitizeItem(item as Record<string, unknown>, req.canvasWidth, req.canvasHeight, validProductIds))
    .filter((item): item is AiCanvasItem => item !== null);

  return { background_color, background_style, items };
}

function resolveImageSize(canvasWidth: number, canvasHeight: number): "1024x1024" | "1536x1024" | "1024x1536" {
  const ratio = canvasWidth / canvasHeight;
  if (ratio >= 1.3)  return "1536x1024";
  if (ratio <= 0.77) return "1024x1536";
  return "1024x1024";
}

const STYLE_BG_DESC: Record<AiCanvasRequest["style"], string> = {
  minimal:    "minimalist background, soft pastel gradient, clean abstract texture, airy light tones",
  bold:       "bold graphic background, high contrast geometric pattern, vivid accent colors, energetic composition",
  editorial:  "sophisticated editorial texture, luxury material feel, muted earthy palette, fine grain film look",
  playful:    "colorful playful background, confetti or geometric shapes, bright cheerful palette, fun pattern",
  luxury:     "luxury background, black and gold gradient, subtle metallic sheen, premium dark ambiance",
  artisanal:  "artisanal background, warm earth tones, organic linen texture, handcrafted natural feel",
};

async function generateBackgroundImage(
  req: AiCanvasRequest,
): Promise<{ base64: string; contentType: "image/png" } | null> {
  try {
    const styleDesc = STYLE_BG_DESC[req.style];
    const size = resolveImageSize(req.canvasWidth, req.canvasHeight);

    const imagePrompt =
      `Professional marketing canvas background. ${styleDesc}. ` +
      `Seller: ${req.sellerName}. Collection: ${req.title}. Theme: ${req.prompt}. ` +
      `No text, no logos, no people. Seamless background for product photography overlay. ` +
      `High quality commercial photography style.`;

    let b64: string | null = null;
    try {
      const resp = await (openai.images as any).generate({
        model: "gpt-image-1",
        prompt: imagePrompt,
        size,
        quality: "standard",
        output_format: "png",
        n: 1,
      });
      b64 = resp.data?.[0]?.b64_json ?? null;
    } catch {
      const dalleSize = size === "1536x1024" ? "1792x1024" : size === "1024x1536" ? "1024x1792" : "1024x1024";
      const resp = await openai.images.generate({
        model: "dall-e-3",
        prompt: imagePrompt,
        size: dalleSize as any,
        quality: "standard",
        response_format: "b64_json",
        n: 1,
      });
      b64 = resp.data?.[0]?.b64_json ?? null;
    }

    return b64 ? { base64: b64, contentType: "image/png" } : null;
  } catch (err) {
    console.error("[canvasAi] background image generation failed:", err);
    return null;
  }
}

export async function generateCanvas(req: AiCanvasRequest): Promise<AiCanvasResult> {
  const validProductIds = new Set(req.products.map((p) => p.id));

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: buildSystemPrompt(req),
    messages: [{ role: "user", content: `Create the canvas for the "${req.title}" collection. ${req.prompt}` }],
    tools: [
      {
        name: "set_canvas",
        description: "Output the complete canvas design layout",
        input_schema: {
          type: "object" as const,
          properties: {
            background_color: { type: "string" as const, description: "Hex background color (#RRGGBB)" },
            background_style: { type: "string" as const, description: "CSS gradient string, or omit for solid color" },
            items: {
              type: "array" as const,
              description: "Canvas elements",
              items: {
                type: "object" as const,
                properties: {
                  element_type: { type: "string" as const, enum: ["text", "shape", "product"] },
                  pos_x:      { type: "number" as const },
                  pos_y:      { type: "number" as const },
                  width:      { type: "number" as const },
                  height:     { type: "number" as const },
                  z_index:    { type: "number" as const },
                  product_id: { type: "string" as const },
                  content:    { type: "object" as const },
                },
                required: ["element_type", "pos_x", "pos_y", "width", "height", "z_index", "content"],
              },
            },
          },
          required: ["background_color", "items"],
        },
      },
    ],
    tool_choice: { type: "tool" as const, name: "set_canvas" },
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("AI did not return a canvas layout");
  }

  const layout = sanitizeResult(toolBlock.input as Record<string, unknown>, req, validProductIds);

  let background_image_base64: string | null = null;
  let background_image_content_type: "image/png" | "image/jpeg" | null = null;

  if (req.generateBgImage) {
    const imgResult = await generateBackgroundImage(req);
    if (imgResult) {
      background_image_base64 = imgResult.base64;
      background_image_content_type = imgResult.contentType;
    }
  }

  return { ...layout, background_image_base64, background_image_content_type };
}
