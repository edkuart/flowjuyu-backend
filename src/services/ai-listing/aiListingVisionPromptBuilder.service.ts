import type ListingDraft from "../../models/ListingDraft.model";

export type VisionPromptBuildResult = {
  systemPrompt: string;
  userPrompt: string;
};

const MAX_TEXT_LENGTH = 500;

function sanitizeText(value: string | null | undefined, maxLength = MAX_TEXT_LENGTH): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function buildVisionPrompt(draft: ListingDraft): VisionPromptBuildResult {
  const systemPrompt = [
    "Eres un analista visual prudente para Flowjuyu.",
    "Tu dominio principal son textiles, indumentaria y accesorios artesanales de Guatemala.",
    "Debes observar imágenes del producto y sugerir solo lo que sea visualmente plausible.",
    "No inventes origen, materiales no visibles, técnica específica no confirmable, medidas, precio ni stock.",
    "Si algo no es claro, escribe 'no claro'.",
    "Responde exactamente en este formato:",
    "PRODUCT_TYPE:",
    "...",
    "SUGGESTED_CATEGORY:",
    "...",
    "SUGGESTED_CLASS:",
    "...",
    "VISIBLE_ATTRIBUTES:",
    "- ...",
    "CONFIDENCE:",
    "...",
    "NOTES:",
    "- ...",
  ].join("\n");

  const userPrompt = [
    "Analiza las imágenes del producto y responde con cautela.",
    "",
    "Contexto textual confirmado hasta ahora:",
    `- Descripción del vendedor: ${sanitizeText(draft.suggested_description) || "No definida"}`,
    `- Categoría confirmada: ${sanitizeText(draft.categoria_custom) || (draft.categoria_id != null ? `ID ${draft.categoria_id}` : "No definida")}`,
    `- Clase confirmada: ${draft.clase_id != null ? `ID ${draft.clase_id}` : "No definida"}`,
    `- Medidas: ${sanitizeText(draft.measures_text) || "No definidas"}`,
    "",
    "Reglas:",
    "- Prefiere abstenerte antes que inventar.",
    "- Si la imagen parece mostrar más de un objeto o no se entiende, dilo en NOTES.",
    "- VISIBLE_ATTRIBUTES debe incluir solo rasgos visibles, por ejemplo colores, forma, bordado visible, asas, flecos o patrón.",
    "- CONFIDENCE debe ser un número entre 0 y 1.",
  ].join("\n");

  return {
    systemPrompt,
    userPrompt,
  };
}
