import type ListingDraft from "../../models/ListingDraft.model";
import {
  getDraftImages,
  getVisionSuggestion,
} from "../listing-drafts/listingDraft.service";
import {
  getProductCategoryById,
  getProductClassById,
} from "../listing-drafts/productCatalog.service";

type BuildListingPromptOptions = {
  reason: "preview" | "regenerate";
};

export type ListingPromptBuildResult = {
  systemPrompt: string;
  userPrompt: string;
};

const MAX_TEXT_FIELD_LENGTH = 500;
const MAX_MEDIA_REFERENCES = 2;

function sanitizeText(value: string | null | undefined, maxLength = MAX_TEXT_FIELD_LENGTH): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export async function buildListingPrompt(
  draft: ListingDraft,
  options: BuildListingPromptOptions
): Promise<ListingPromptBuildResult> {
  const category = draft.categoria_id
    ? await getProductCategoryById(draft.categoria_id).catch(() => null)
    : null;
  const productClass = draft.clase_id
    ? await getProductClassById(draft.clase_id).catch(() => null)
    : null;
  const vision = getVisionSuggestion(draft);

  const images = getDraftImages(draft);
  const imageReferences = images
    .map((image) => image.uploadedPublicUrl)
    .filter((value): value is string => Boolean(value))
    .slice(0, MAX_MEDIA_REFERENCES);

  const systemPrompt = [
    "Eres un asistente editorial de Flowjuyu.",
    "Escribes para un marketplace de textiles, indumentaria y productos artesanales de Guatemala.",
    "Debes respetar el origen cultural del producto y evitar exageraciones vacías.",
    "No inventes materiales, técnicas, regiones, medidas ni historias que no estén presentes en el contexto.",
    "La salida debe estar en español y seguir exactamente este formato:",
    "TITLE:",
    "<titulo>",
    "DESCRIPTION:",
    "<descripcion>",
    "El título debe ser claro, concreto y útil para venta.",
    "La descripción debe sonar natural, atractiva y respetuosa, sin parecer texto genérico de IA.",
  ].join("\n");

  const userPrompt = [
    `Motivo de generación: ${options.reason === "regenerate" ? "mejora solicitada por el vendedor" : "preview final antes de publicar"}`,
    "",
    "Contexto disponible del producto:",
    `- Título actual: ${sanitizeText(draft.suggested_title) || "No definido"}`,
    `- Descripción actual: ${sanitizeText(draft.suggested_description, 900) || "No definida"}`,
    `- Categoría confirmada: ${sanitizeText(category?.nombre || draft.categoria_custom) || "No definida"}`,
    `- Clase de producto: ${sanitizeText(productClass?.nombre) || `ID ${draft.clase_id ?? "No definido"}`}`,
    `- Medidas: ${sanitizeText(draft.measures_text) || "No definidas"}`,
    `- Precio: ${draft.price != null ? `Q${Number(draft.price).toFixed(2)}` : "No definido"}`,
    `- Stock: ${draft.stock ?? "No definido"}`,
    `- Cantidad de imágenes: ${images.length}`,
    `- Referencias de imagen disponibles: ${imageReferences.length > 0 ? imageReferences.join(", ") : "No disponibles"}`,
    `- Señales visuales no confirmadas: ${
      vision
        ? [
            vision.probableProductType ? `tipo probable ${vision.probableProductType}` : null,
            vision.suggestedCategoryName ? `categoría sugerida ${vision.suggestedCategoryName}` : null,
            vision.suggestedClassName ? `clase sugerida ${vision.suggestedClassName}` : null,
            vision.visibleAttributes?.length ? `atributos visibles ${vision.visibleAttributes.join(", ")}` : null,
          ]
            .filter(Boolean)
            .join("; ") || "No disponibles"
        : "No disponibles"
    }`,
    "",
    "Instrucciones obligatorias:",
    "- Usa solo la información confirmada en el contexto para afirmaciones explícitas.",
    "- Las señales visuales no confirmadas solo pueden ayudarte a elegir redacción prudente; no las conviertas en hechos si no están confirmadas por texto.",
    "- Si falta un dato, simplemente no lo menciones.",
    "- Evita palabras vacías como 'único', 'auténtico' o 'exclusivo' si no aportan precisión.",
    "- Mantén un tono cálido, comercial y respetuoso de la tradición textil guatemalteca.",
    "- No menciones que esto fue generado por IA.",
    "- No uses viñetas ni JSON.",
  ].join("\n");

  return {
    systemPrompt,
    userPrompt,
  };
}
