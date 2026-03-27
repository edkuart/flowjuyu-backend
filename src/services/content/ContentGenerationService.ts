// src/services/content/ContentGenerationService.ts
//
// Calls the Anthropic API using adaptive DB-backed templates (Phase 5).
// Template selection: 80% exploitation (highest-scoring active template),
//                     20% exploration (random from other active templates).
// Falls back to hardcoded prompts when no DB templates exist yet.
// Creates the AiContentVariant record regardless of success or failure.
//
// Retry policy (Phase 6):
//   If attempt 1 scores below SCORE_THRESHOLDS.QUEUE_MIN, a second attempt is
//   made automatically using an enriched prompt with storytelling, cultural
//   context, and a soft call-to-action layer. The first attempt's variant is
//   marked discarded/below_threshold for audit purposes.
//   Max attempts: MAX_GENERATION_ATTEMPTS (2).
//   generation_count on the parent item is incremented once per pipeline
//   invocation by the caller (ContentItemService.stampGeneration); internal
//   retry LLM calls are transparent at that level.

import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import { Op } from "sequelize";

import AiContentItem from "../../models/AiContentItem.model";
import AiContentVariant from "../../models/AiContentVariant.model";
import { scoreContent } from "./ContentScoringService";
import type { ContentType, RejectionReason } from "../../types/content.types";
import { SCORE_THRESHOLDS } from "../../types/content.types";

// ─── LLM client ──────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// MVS: all generation uses haiku for cost efficiency.
// Sonnet is reserved for editorial content (Phase 3).
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

// Maximum LLM calls per generateVariant() invocation.
// Attempt 1: standard template prompt.
// Attempt 2: enriched prompt with storytelling + cultural context + CTA.
const MAX_GENERATION_ATTEMPTS = 2;

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
  /** Real UUID from ai_content_templates.id. Null when DB is unavailable. */
  templateId:   string | null;
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
      return {
        slug:         FALLBACK_SLUGS[content_type],
        templateId:   null,  // resolved by slug lookup in generateVariant
        systemPrompt: BRAND_SYSTEM_PROMPT,
        userPrompt:   buildUserPrompt(content_type, ctx),
        fromDb:       false,
      };
    }

    // Exploration: 20% chance to pick randomly from non-top templates
    let chosen = activeTemplates[0];
    if (activeTemplates.length > 1 && Math.random() < TEMPLATE_EXPLORATION_RATE) {
      const explorationPool = activeTemplates.slice(1);
      chosen = explorationPool[Math.floor(Math.random() * explorationPool.length)];
    }

    return {
      slug:         chosen.slug,
      templateId:   chosen.id,  // real UUID — used for ai_content_variants.template_id
      systemPrompt: chosen.system_prompt,
      userPrompt:   renderUserPrompt(chosen.user_prompt_template, ctx),
      fromDb:       true,
    };
  } catch {
    // DB unavailable — fall back to hardcoded without crashing
    return {
      slug:         FALLBACK_SLUGS[content_type],
      templateId:   null,  // resolved by slug lookup in generateVariant
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

// ─── Enriched retry prompt builders ──────────────────────────────────────────
// Used on attempt 2 when attempt 1 scored below SCORE_THRESHOLDS.QUEUE_MIN.
// Adds three enrichment layers on top of the standard prompt:
//   1. Emotional storytelling — at least one sensory or visual detail
//   2. Cultural context — anchors the piece to a region or tradition
//   3. Call-to-action — a gentle, non-urgent invitation to engage

function buildEnrichedUserPrompt(
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

Capas de enriquecimiento obligatorias para esta versión:
- STORYTELLING: incluye un detalle sensorial concreto (textura, color, sonido del telar, olor del material) que transporte al lector al lugar de origen
- CONTEXTO CULTURAL: ancla la pieza a una comunidad, tradición o práctica específica que el comprador no encontraría en otro mercado
- LLAMADA A LA ACCIÓN: cierra con una frase que despierte curiosidad o invite a explorar sin urgencia ni imperativo directo

Datos del producto:
${productBlock}

Devuelve únicamente el texto del caption. Sin comillas ni explicaciones adicionales.`;
  }

  if (content_type === "product_description") {
    return `Genera una descripción de producto para este textil artesanal guatemalteco. Entre 130 y 200 palabras. Estructura en tres párrafos: (1) el proceso o material narrado con al menos una imagen sensorial concreta, (2) el contexto cultural, la comunidad o región y su significado dentro de la tradición textil guatemalteca, (3) el valor práctico y simbólico de la pieza con una invitación final a conectar con quien la creó. Sin headers ni bullets.

Capas de enriquecimiento obligatorias para esta versión:
- STORYTELLING: el primer párrafo debe contener una imagen visual o táctil que el lector pueda experimentar mentalmente
- CONTEXTO CULTURAL: el segundo párrafo debe anclar la pieza a una práctica o lugar específico, sin inventar lo que no está en los datos
- LLAMADA A LA ACCIÓN: el tercer párrafo debe cerrar con una frase que invite a explorar, conocer o valorar la pieza, sin lenguaje de urgencia

Datos del producto:
${productBlock}

Devuelve únicamente la descripción. Sin comillas ni prefijos.`;
  }

  if (content_type === "image_prompt_brief") {
    return `Genera un brief de prompt de imagen para este producto artesanal. Usa exactamente este formato estructurado — cada campo en su propia línea:

STYLE: [taller_vivo | detalle | territorio]
SUBJECT: [descripción específica del sujeto visual; incluye textura, color dominante y contexto de uso o elaboración]
LIGHT: [calidad, dirección, hora del día; prefiere luz natural de taller, luz lateral o luz dorada de tarde]
BACKGROUND: [superficie o ambiente con referencia cultural o regional cuando los datos lo permitan]
COLOR_ANCHOR: [color dominante del textil o producto; menciona combinaciones o contrastes si los hay]
HANDS: [present | absent | partial — si present, describe el gesto o acción]
AVOID: [elementos a evitar separados por comas; incluye fondos blancos asépticos, iluminación de estudio, accesorios anacrónicos]
REFERENCE_NOTE: [nota de dirección de arte que conecte la imagen con la tradición visual de la región o comunidad artesana]

Capas de enriquecimiento obligatorias para esta versión:
- STORYTELLING: el campo SUBJECT debe evocar una historia visual, no solo describir un objeto
- CONTEXTO CULTURAL: BACKGROUND y REFERENCE_NOTE deben reflejar el entorno geográfico o cultural cuando los datos lo permitan
- LLAMADA A LA ACCIÓN: REFERENCE_NOTE debe orientar al fotógrafo hacia una imagen que invite al espectador a querer saber más

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
 * Execute one generation pipeline for a content item, with automatic retry.
 *
 * Attempt 1: standard template-selected prompt.
 * Attempt 2 (triggered only when attempt 1 scores below QUEUE_MIN):
 *   enriched prompt with storytelling, cultural context, and CTA layers.
 *   Attempt 1's variant is marked discarded/below_threshold.
 *
 * Always creates a variant record — even on failure — for audit trail completeness.
 * The caller (controller) runs guardrails and scoring on the returned variant.
 */
export async function generateVariant(
  item: AiContentItem
): Promise<GenerationResult> {
  const content_type = item.content_type as ContentType;

  // Fetch product context once — reused across all attempts and internal scoring
  const ctx = await fetchProductContext(item.subject_id);

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    // Determine next variant_number for this attempt
    const existingCount = await AiContentVariant.count({
      where: { content_item_id: item.id },
    });
    const variant_number = existingCount + 1;

    let promptTokens     = 0;
    let completionTokens = 0;
    let content_body     = "";
    let callSucceeded    = false;
    // Real UUID from ai_content_templates.id — null when template table is empty
    let template_uuid: string | null = null;

    // ── LLM call ────────────────────────────────────────────────────────────
    try {
      let systemPrompt: string;
      let userPrompt: string;

      if (attempt === 1) {
        // Standard path: adaptive template selector
        const selected = await selectTemplate(content_type, ctx);

        if (selected.templateId) {
          template_uuid = selected.templateId;
        } else {
          // Fallback: look up seeded base template UUID by slug
          try {
            const { default: AiContentTemplate } = await import("../../models/AiContentTemplate.model");
            const tmpl = await AiContentTemplate.findOne({ where: { slug: selected.slug } });
            template_uuid = tmpl?.id ?? null;
          } catch {
            // Table not yet seeded or DB unavailable — template_uuid stays null
          }
        }

        systemPrompt = selected.systemPrompt;
        userPrompt   = selected.userPrompt;
      } else {
        // Retry path: enriched prompt with storytelling, cultural context, CTA
        // No DB template is linked — this is an ad-hoc recovery prompt
        systemPrompt = BRAND_SYSTEM_PROMPT;
        userPrompt   = buildEnrichedUserPrompt(content_type, ctx);
        template_uuid = null;
      }

      const response = await anthropic.messages.create({
        model:      DEFAULT_MODEL,
        max_tokens: attempt === 1 ? 600 : 750,  // slightly more room for enriched prompt
        system:     systemPrompt,
        messages:   [{ role: "user", content: userPrompt }],
      });

      promptTokens     = response.usage.input_tokens;
      completionTokens = response.usage.output_tokens;

      const firstBlock = response.content[0];
      if (firstBlock?.type === "text" && firstBlock.text.trim()) {
        content_body  = firstBlock.text.trim();
        callSucceeded = true;
      }
    } catch (err: any) {
      console.error(`[ContentGeneration] LLM call failed (attempt ${attempt}):`, err?.message ?? err);
      // Continue to create the failure variant record below
    }

    const cost_usd = computeCost(DEFAULT_MODEL, promptTokens, completionTokens);

    // ── Malformed/empty output ──────────────────────────────────────────────
    if (!callSucceeded || !content_body) {
      const variant = await AiContentVariant.create({
        content_item_id:   item.id,
        variant_number,
        content_body:      "[GENERATION_FAILED]",
        content_hash:      computeContentHash("[GENERATION_FAILED]", "es", content_type),
        language:          "es",
        word_count:        0,
        template_id:       template_uuid,
        model_used:        DEFAULT_MODEL,
        prompt_tokens:     promptTokens,
        completion_tokens: completionTokens,
        cost_usd,
        status:            "discarded",
        rejection_reason:  "malformed_output",
      });
      return { variant, success: false, rejectionReason: "malformed_output" };
    }

    // ── Duplicate check ─────────────────────────────────────────────────────
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
        template_id:       template_uuid,
        model_used:        DEFAULT_MODEL,
        prompt_tokens:     promptTokens,
        completion_tokens: completionTokens,
        cost_usd,
        status:            "discarded",
        rejection_reason:  "duplicate_pattern",
      });
      return { variant, success: false, rejectionReason: "duplicate_pattern" };
    }

    // ── Create variant record ───────────────────────────────────────────────
    const variant = await AiContentVariant.create({
      content_item_id:   item.id,
      variant_number,
      content_body,
      content_hash:      contentHash,
      language:          "es",
      word_count:        countWords(content_body),
      template_id:       template_uuid,
      model_used:        DEFAULT_MODEL,
      prompt_tokens:     promptTokens,
      completion_tokens: completionTokens,
      cost_usd,
      status:            "generated",
    });

    // ── Retry gate: internal score check ───────────────────────────────────
    // Only runs when there are remaining attempts. Avoids an extra score call
    // on the final attempt — the caller (controller) always scores the returned
    // variant as part of the standard pipeline.
    if (attempt < MAX_GENERATION_ATTEMPTS) {
      const scoreResult = scoreContent(content_body, content_type, {
        productName: ctx.nombre,
        precio:      ctx.precio,
      });

      if (scoreResult.generation_score < SCORE_THRESHOLDS.QUEUE_MIN) {
        // Discard this attempt and try again with enriched prompt
        await variant.update({
          status:           "discarded",
          rejection_reason: "below_threshold",
        });
        console.log(
          `[ContentGeneration] attempt ${attempt} score ${scoreResult.generation_score.toFixed(3)} < threshold ${SCORE_THRESHOLDS.QUEUE_MIN} — retrying with enriched prompt`
        );
        continue;
      }
    }

    // Passed threshold (or exhausted attempts) — return to caller
    return { variant, success: true };
  }

  // TypeScript exhaustiveness guard — never reached in practice
  throw new Error("[ContentGeneration] exhausted generation attempts unexpectedly");
}
