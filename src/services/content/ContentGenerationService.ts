// src/services/content/ContentGenerationService.ts
//
// Calls the Anthropic API using adaptive DB-backed templates (Phase 5).
// Template selection: 80% exploitation (highest-scoring active template),
//                     20% exploration (random from other active templates).
// Falls back to hardcoded prompts when no DB templates exist yet.
// Creates the AiContentVariant record regardless of success or failure.

import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import { Op } from "sequelize";

import AiContentItem from "../../models/AiContentItem.model";
import AiContentVariant from "../../models/AiContentVariant.model";
import type { ContentType, RejectionReason } from "../../types/content.types";

// ─── LLM client ──────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// MVS: all generation uses haiku for cost efficiency.
// Sonnet is reserved for editorial content (Phase 3).
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

// ─── Cost computation ────────────────────────────────────────────────────────

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
  "claude-sonnet-4-6":         { input: 3.0, output: 15.0 },
};

function computeCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const p = MODEL_PRICING[model] ?? { input: 3.0, output: 15.0 };
  return (
    (promptTokens / 1_000_000) * p.input +
    (completionTokens / 1_000_000) * p.output
  );
}

// ─── Hashing ─────────────────────────────────────────────────────────────────

export function computeContentHash(
  body: string,
  language: string,
  contentType: string
): string {
  return crypto
    .createHash("sha256")
    .update(`${body}|${language}|${contentType}`)
    .digest("hex");
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ─── Hardcoded fallback template slugs ───────────────────────────────────────
// Used when the ai_content_templates table is empty or unavailable.
// These slugs match the seeded base templates in the Phase 5 migration.

const FALLBACK_SLUGS: Record<ContentType, string> = {
  caption:             "product_caption_v1",
  product_description: "product_description_v1",
  image_prompt_brief:  "product_image_brief_v1",
};

// Exploration rate: 20% of selections pick a non-dominant template.
// Prevents template monoculture and provides comparison data.
const TEMPLATE_EXPLORATION_RATE = 0.20;

// ─── User prompt renderer ────────────────────────────────────────────────────
// Replaces {{variable}} placeholders. Lines where the variable is null/empty
// are dropped entirely. Consecutive blank lines are collapsed.

function renderUserPrompt(
  template: string,
  ctx: { nombre: string; precio: number; categoria?: string | null; region?: string | null; descripcion?: string | null }
): string {
  const vars: Record<string, string | null> = {
    nombre:      ctx.nombre,
    precio:      String(Math.round(ctx.precio * 100) / 100),
    categoria:   ctx.categoria ?? null,
    region:      ctx.region ?? null,
    descripcion: ctx.descripcion ?? null,
  };

  let result = template;

  for (const [key, value] of Object.entries(vars)) {
    if (value != null && value !== "") {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    } else {
      // Drop the entire line that contains this unresolved placeholder
      result = result.replace(new RegExp(`^[^\n]*\\{\\{${key}\\}\\}[^\n]*\n?`, "gm"), "");
    }
  }

  // Safety net: remove any remaining unresolved placeholders
  result = result.replace(/^[^\n]*\{\{[^}]+\}\}[^\n]*\n?/gm, "");

  // Collapse multiple consecutive blank lines to one
  result = result.replace(/\n{3,}/g, "\n\n");

  return result.trim();
}

// ─── Adaptive template selector ──────────────────────────────────────────────

interface SelectedTemplate {
  slug:         string;
  systemPrompt: string;
  userPrompt:   string;
  fromDb:       boolean;
}

async function selectTemplate(
  content_type: ContentType,
  ctx: ProductContext
): Promise<SelectedTemplate> {
  try {
    // Lazy import to avoid circular dependency at module load time
    const { default: AiContentTemplate } = await import("../../models/AiContentTemplate.model");

    const activeTemplates = await AiContentTemplate.findAll({
      where: {
        content_type,
        is_active:     true,
        health_status: { [Op.in]: ["active", "degraded"] },
      },
      order: [
        // Active ranks above degraded; within same status, higher score first
        ["health_status", "ASC"],          // 'active' < 'degraded' alphabetically
        ["generation_score_avg", "DESC"],
        ["template_version", "DESC"],
      ],
    });

    if (activeTemplates.length === 0) {
      return { slug: FALLBACK_SLUGS[content_type], systemPrompt: BRAND_SYSTEM_PROMPT, userPrompt: buildUserPrompt(content_type, ctx), fromDb: false };
    }

    // Exploration: 20% chance to pick randomly from non-top templates
    let chosen = activeTemplates[0];
    if (activeTemplates.length > 1 && Math.random() < TEMPLATE_EXPLORATION_RATE) {
      const explorationPool = activeTemplates.slice(1);
      chosen = explorationPool[Math.floor(Math.random() * explorationPool.length)];
    }

    return {
      slug:         chosen.slug,
      systemPrompt: chosen.system_prompt,
      userPrompt:   renderUserPrompt(chosen.user_prompt_template, ctx),
      fromDb:       true,
    };
  } catch {
    // DB unavailable — fall back to hardcoded without crashing
    return {
      slug:         FALLBACK_SLUGS[content_type],
      systemPrompt: BRAND_SYSTEM_PROMPT,
      userPrompt:   buildUserPrompt(content_type, ctx),
      fromDb:       false,
    };
  }
}

// ─── Brand voice system prompt (shared across all product content types) ─────

const BRAND_SYSTEM_PROMPT = `Eres la voz de Flowjuyu, un mercado cultural dedicado a los textiles tradicionales guatemaltecos y a los artesanos que los crean.

Tu tono es: cálido, preciso, respetuoso de la herencia artesanal, y accesible para compradores internacionales.

Reglas de escritura obligatorias:
- Nunca comiences con "Descubre", "Presentamos", "Conoce", "Introducing" o "Meet"
- Nunca uses las palabras "único", "auténtico" o "artesanal" como adjetivos vacíos — muéstralo, no lo declares
- Nunca uses lenguaje de urgencia ("últimas unidades", "oferta limitada", "precio especial")
- Nunca inventes técnicas, orígenes o historias biográficas que no estén en los datos proporcionados
- Si un campo está vacío, omite esa información completamente — no especules ni rellenes
- El artesano es el sujeto; el producto es secundario a quien lo creó
- El precio representa un intercambio justo, no una ganga ni un lujo
- Incluye al menos un detalle específico y concreto que el lector no esperaría
- Varía la longitud de las oraciones de forma natural — evita el ritmo uniforme
- Máximo un guión largo (—) por pieza`;

// ─── Product context ─────────────────────────────────────────────────────────
// Lazy import to avoid circular dependency at module load time.

interface ProductContext {
  nombre: string;
  descripcion: string | null;
  precio: number;
  categoria: string | null;
  region: string | null;
}

async function fetchProductContext(productId: string): Promise<ProductContext> {
  // Dynamic import avoids loading the model before associations are set up
  const { default: Product } = await import("../../models/product.model");

  const product = await Product.findByPk(productId, {
    attributes: ["nombre", "descripcion", "precio", "categoria_custom", "region_custom"],
  });

  if (!product) {
    throw Object.assign(new Error("PRODUCT_NOT_FOUND"), { statusCode: 404 });
  }

  return {
    nombre:      product.nombre,
    descripcion: product.descripcion ?? null,
    precio:      Number(product.precio),
    categoria:   product.categoria_custom ?? null,
    region:      product.region_custom ?? null,
  };
}

// ─── User prompt builders ────────────────────────────────────────────────────

function buildUserPrompt(
  content_type: ContentType,
  ctx: ProductContext
): string {
  const lines: string[] = [
    `Nombre: ${ctx.nombre}`,
    `Precio: Q${ctx.precio}`,
  ];
  if (ctx.categoria) lines.push(`Categoría: ${ctx.categoria}`);
  if (ctx.region) lines.push(`Región: ${ctx.region}`);
  if (ctx.descripcion) lines.push(`Descripción existente: ${ctx.descripcion}`);

  const productBlock = lines.join("\n");

  if (content_type === "caption") {
    return `Genera un caption para este producto artesanal guatemalteco. Máximo 280 caracteres. Solo prosa, sin bullets, sin hashtags. Tiempo presente para describir procesos de creación.

Datos del producto:
${productBlock}

Devuelve únicamente el texto del caption. Sin comillas ni explicaciones adicionales.`;
  }

  if (content_type === "product_description") {
    return `Genera una descripción de producto para este textil artesanal guatemalteco. Entre 120 y 180 palabras. Estructura en tres párrafos cortos: (1) material o proceso de creación, (2) origen o artesano, (3) uso práctico o valor de la pieza. Sin headers ni bullets.

Datos del producto:
${productBlock}

Devuelve únicamente la descripción. Sin comillas ni prefijos.`;
  }

  if (content_type === "image_prompt_brief") {
    return `Genera un brief de prompt de imagen para este producto artesanal. Usa exactamente este formato estructurado — cada campo en su propia línea:

STYLE: [taller_vivo | detalle | territorio]
SUBJECT: [descripción específica del sujeto visual]
LIGHT: [calidad, dirección, hora del día]
BACKGROUND: [superficie o ambiente específico]
COLOR_ANCHOR: [color dominante del textil o producto]
HANDS: [present | absent | partial]
AVOID: [lista de elementos a evitar, separados por comas]
REFERENCE_NOTE: [nota opcional para dirección de arte]

Datos del producto:
${productBlock}

Devuelve únicamente el brief con ese formato exacto. Sin prefijos ni explicaciones.`;
  }

  throw new Error(`Unknown content_type: ${content_type}`);
}

// ─── Public interface ────────────────────────────────────────────────────────

export interface GenerationResult {
  variant: AiContentVariant;
  success: boolean;
  rejectionReason?: RejectionReason;
}

/**
 * Execute one generation attempt for a content item.
 * Always creates a variant record — even on failure — for audit trail completeness.
 */
export async function generateVariant(
  item: AiContentItem
): Promise<GenerationResult> {
  const content_type = item.content_type as ContentType;

  // Determine next variant_number
  const existingCount = await AiContentVariant.count({
    where: { content_item_id: item.id },
  });
  const variant_number = existingCount + 1;

  let promptTokens     = 0;
  let completionTokens = 0;
  let content_body     = "";
  let callSucceeded    = false;
  let selected_template_slug = FALLBACK_SLUGS[content_type];

  // ── LLM call ──────────────────────────────────────────────────────────────
  try {
    const ctx      = await fetchProductContext(item.subject_id);
    const selected = await selectTemplate(content_type, ctx);
    selected_template_slug = selected.slug;

    const response = await anthropic.messages.create({
      model:      DEFAULT_MODEL,
      max_tokens: 600,
      system:     selected.systemPrompt,
      messages:   [{ role: "user", content: selected.userPrompt }],
    });

    promptTokens     = response.usage.input_tokens;
    completionTokens = response.usage.output_tokens;

    const firstBlock = response.content[0];
    if (firstBlock?.type === "text" && firstBlock.text.trim()) {
      content_body  = firstBlock.text.trim();
      callSucceeded = true;
    }
  } catch (err: any) {
    console.error("[ContentGeneration] LLM call failed:", err?.message ?? err);
    // Continue to create the failure variant record below
  }

  const cost_usd = computeCost(DEFAULT_MODEL, promptTokens, completionTokens);

  // ── Malformed/empty output ────────────────────────────────────────────────
  if (!callSucceeded || !content_body) {
    const variant = await AiContentVariant.create({
      content_item_id:   item.id,
      variant_number,
      content_body:      "[GENERATION_FAILED]",
      content_hash:      computeContentHash("[GENERATION_FAILED]", "es", content_type),
      language:          "es",
      word_count:        0,
      template_id:       selected_template_slug,
      model_used:        DEFAULT_MODEL,
      prompt_tokens:     promptTokens,
      completion_tokens: completionTokens,
      cost_usd,
      status:            "discarded",
      rejection_reason:  "malformed_output",
    });
    return { variant, success: false, rejectionReason: "malformed_output" };
  }

  // ── Duplicate check ───────────────────────────────────────────────────────
  const contentHash = computeContentHash(content_body, "es", content_type);
  const duplicate   = await AiContentVariant.findOne({
    where: { content_item_id: item.id, content_hash: contentHash },
  });

  if (duplicate) {
    // Store with a modified hash so the unique constraint doesn't block the insert
    const dedupHash = computeContentHash(
      `${content_body}_dup_${Date.now()}`,
      "es",
      content_type
    );
    const variant = await AiContentVariant.create({
      content_item_id:   item.id,
      variant_number,
      content_body,
      content_hash:      dedupHash,
      language:          "es",
      word_count:        countWords(content_body),
      template_id:       selected_template_slug,
      model_used:        DEFAULT_MODEL,
      prompt_tokens:     promptTokens,
      completion_tokens: completionTokens,
      cost_usd,
      status:            "discarded",
      rejection_reason:  "duplicate_pattern",
    });
    return { variant, success: false, rejectionReason: "duplicate_pattern" };
  }

  // ── Success: create variant ready for guardrail check ────────────────────
  const variant = await AiContentVariant.create({
    content_item_id:   item.id,
    variant_number,
    content_body,
    content_hash:      contentHash,
    language:          "es",
    word_count:        countWords(content_body),
    template_id:       selected_template_slug,
    model_used:        DEFAULT_MODEL,
    prompt_tokens:     promptTokens,
    completion_tokens: completionTokens,
    cost_usd,
    status: "generated",
  });

  return { variant, success: true };
}
