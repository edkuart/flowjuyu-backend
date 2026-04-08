import type ConversationSession from "../../models/ConversationSession.model";
import type ListingDraft from "../../models/ListingDraft.model";
import type { NormalizedInboundMessage } from "../integrations/whatsapp/whatsapp.types";
import type { DraftPatch } from "../listing-drafts/listingDraft.types";
import {
  getProductCategoryById,
  getProductClassById,
  resolveProductCategoryFromText,
  resolveProductClassFromText,
} from "../listing-drafts/productCatalog.service";

export type AutoFillResult = {
  updatedFields: string[];
  inferredData: {
    category?: string;
    class?: string;
    price?: number;
    measures?: string;
    description?: string;
    stock?: number;
  };
  confidence: number;
  sourceSignals: string[];
  draftPatch: DraftPatch;
};

function normalizeText(input: string | undefined): string {
  return String(input ?? "").trim();
}

function hasExplicitChangeIntent(text: string): boolean {
  return /\b(cambia|cambiar|corrige|actualiza|agrega|agregar|ponle|pon|deja|ahora es|no es)\b/i.test(text);
}

function parsePrice(text: string): number | null {
  const patterns = [
    /\bq\s*(\d+(?:[.,]\d{1,2})?)\b/i,
    /\b(\d+(?:[.,]\d{1,2})?)\s*(?:quetzales|qtz)\b/i,
    /\b(?:vale|cuesta|precio(?: es| de)?|sale en)\s*q?\s*(\d+(?:[.,]\d{1,2})?)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const value = Number(match[1].replace(",", "."));
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return null;
}

function parseStock(text: string): number | null {
  const patterns = [
    /\b(?:tengo|hay|quedan|son|stock(?: de)?|cantidad(?: de)?|disponibles?)\s*(\d{1,4})\b/i,
    /\b(\d{1,4})\s*(?:unidades|unidad|piezas|pieza)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const value = Number(match[1]);
    if (Number.isInteger(value) && value > 0) {
      return value;
    }
  }

  return null;
}

function parseMeasures(text: string): string | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  const dimensionMatch = normalized.match(
    /\b\d+(?:[.,]\d+)?\s*[xX]\s*\d+(?:[.,]\d+)?(?:\s*[xX]\s*\d+(?:[.,]\d+)?)?\s*(?:cm|mm|m|mts|metros?)?\b/i
  );
  if (dimensionMatch?.[0]) {
    return dimensionMatch[0].replace(/\s+/g, " ").trim();
  }

  const unitMatch = normalized.match(
    /\b\d+(?:[.,]\d+)?\s*(?:cm|mm|m|mts|metros?)\b/i
  );
  if (unitMatch?.[0]) {
    return unitMatch[0].replace(/\s+/g, " ").trim();
  }

  const sizeTextMatch = normalized.match(
    /\b(?:tamano|tamaño)\s+(?:grande|mediano|mediana|pequeno|pequeño)\b/i
  );
  if (sizeTextMatch?.[0]) {
    return sizeTextMatch[0].replace(/\s+/g, " ").trim();
  }

  return null;
}

function parseDescriptionCandidate(text: string): string | null {
  const normalized = normalizeText(text);
  if (normalized.length < 20) return null;
  if (/^\d+(?:[.,]\d+)?$/.test(normalized)) return null;
  if (/^(si|sí|no|ok|correcto|incorrecto)$/i.test(normalized)) return null;
  return normalized.slice(0, 900);
}

function extractOverrideValue(text: string): string {
  const match = text.match(/\b(?:no es .+?,?\s*es|es|cambia(?: lo)? a|cambia(?: el| la)? [a-záéíóúñ ]+ a|pon(?:lo|la)? como)\s+(.+)$/i);
  if (match?.[1]) {
    return normalizeText(match[1]);
  }

  return normalizeText(text);
}

function averageConfidence(count: number): number {
  if (count <= 0) return 0;
  return Math.min(1, 0.45 + count * 0.18);
}

export async function autoFillDraftFromSignals(
  session: ConversationSession,
  draft: ListingDraft,
  lastMessage: NormalizedInboundMessage
): Promise<AutoFillResult> {
  void session;

  const text = normalizeText(lastMessage.text);
  const explicitChangeIntent = hasExplicitChangeIntent(text);
  const patch: DraftPatch = {};
  const updatedFields: string[] = [];
  const sourceSignals = [`message:${lastMessage.type}`];
  const inferredData: AutoFillResult["inferredData"] = {};

  if (!text) {
    return {
      updatedFields,
      inferredData,
      confidence: 0,
      sourceSignals,
      draftPatch: patch,
    };
  }

  const price = parsePrice(text);
  if (price != null && (!draft.price || explicitChangeIntent)) {
    patch.price = price;
    inferredData.price = price;
    updatedFields.push("price");
    sourceSignals.push("price-parser");
  }

  const stock = parseStock(text);
  if (stock != null && (!draft.stock || explicitChangeIntent)) {
    patch.stock = stock;
    inferredData.stock = stock;
    updatedFields.push("stock");
    sourceSignals.push("stock-parser");
  }

  const measures = parseMeasures(text);
  if (measures && (!draft.measures_text?.trim() || explicitChangeIntent)) {
    patch.measures_text = measures;
    inferredData.measures = measures;
    updatedFields.push("measures_text");
    sourceSignals.push("measures-parser");
  }

  const description = parseDescriptionCandidate(text);
  if (
    description &&
    (
      session.current_step === "awaiting_details" ||
      !draft.suggested_description?.trim() ||
      /\b(?:agrega|agregar|descripcion|descripción)\b/i.test(text)
    )
  ) {
    patch.suggested_description = description;
    inferredData.description = description;
    updatedFields.push("suggested_description");
    sourceSignals.push("description-parser");
  }

  const categoryCandidate =
    session.current_step === "awaiting_category" || explicitChangeIntent
      ? extractOverrideValue(text)
      : text.split(",")[0]?.trim();
  const category = await resolveProductCategoryFromText(categoryCandidate || "").catch(() => null);
  if (category && (!draft.categoria_id && !draft.categoria_custom?.trim() || explicitChangeIntent)) {
    patch.categoria_id = category.id;
    patch.categoria_custom = null;
    inferredData.category = category.nombre;
    updatedFields.push("categoria_id");
    sourceSignals.push("category-catalog-match");
  } else if (
    categoryCandidate &&
    categoryCandidate.length <= 80 &&
    (
      session.current_step === "awaiting_category" ||
      (!draft.categoria_id && !draft.categoria_custom?.trim() && explicitChangeIntent)
    )
  ) {
    patch.categoria_custom = categoryCandidate;
    inferredData.category = categoryCandidate;
    updatedFields.push("categoria_custom");
    sourceSignals.push("category-free-text");
  }

  const classCandidate =
    session.current_step === "awaiting_class" || explicitChangeIntent
      ? extractOverrideValue(text)
      : text.split(",")[0]?.trim();
  const productClass = await resolveProductClassFromText(classCandidate || "").catch(() => null);
  if (productClass && (!draft.clase_id || explicitChangeIntent)) {
    patch.clase_id = productClass.id;
    inferredData.class = productClass.nombre;
    updatedFields.push("clase_id");
    sourceSignals.push("class-catalog-match");
  }

  return {
    updatedFields,
    inferredData,
    confidence: averageConfidence(updatedFields.length),
    sourceSignals,
    draftPatch: patch,
  };
}

export async function buildGroupedConfirmationMessage(
  draft: ListingDraft
): Promise<string> {
  const category = draft.categoria_id
    ? await getProductCategoryById(draft.categoria_id).catch(() => null)
    : null;
  const productClass = draft.clase_id
    ? await getProductClassById(draft.clase_id).catch(() => null)
    : null;

  const lines = [
    "Tengo esto:",
    "",
    `🧵 Producto: ${draft.suggested_title?.trim() || category?.nombre || draft.categoria_custom?.trim() || "Producto artesanal"}`,
    `📦 Clase: ${productClass?.nombre || "Pendiente"}`,
    `🏷️ Categoría: ${category?.nombre || draft.categoria_custom?.trim() || "Pendiente"}`,
    `📏 Medidas: ${draft.measures_text?.trim() || "Pendiente"}`,
    `💰 Precio: ${draft.price != null ? `Q${Number(draft.price).toFixed(2)}` : "Pendiente"}`,
    `📊 Stock: ${draft.stock != null ? String(draft.stock) : "Pendiente"}`,
  ];

  if (draft.suggested_description?.trim()) {
    lines.push(`📝 Descripción: ${draft.suggested_description.trim()}`);
  }

  lines.push("", "¿Quieres publicarlo o cambiar algo?");

  return lines.join("\n");
}
