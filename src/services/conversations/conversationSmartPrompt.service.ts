import type ConversationSession from "../../models/ConversationSession.model";
import type ListingDraft from "../../models/ListingDraft.model";
import {
  getVisionSuggestion,
  type MissingDraftField,
} from "../listing-drafts/listingDraft.service";
import type { PendingConfirmation } from "./conversationConfirmation.service";

export type SmartPromptDecision = {
  mode: "ask" | "confirm";
  targetField:
    | "category"
    | "class"
    | "details"
    | "price"
    | "stock"
    | "measures";
  promptText: string;
  confidence?: number;
  sourceSignals?: string[];
  pendingConfirmation?: PendingConfirmation;
};

const CONFIRMATION_CONFIDENCE_THRESHOLD = 0.72;

function buildCategoryConfirmation(
  draft: ListingDraft
): SmartPromptDecision | null {
  const vision = getVisionSuggestion(draft);
  const suggestion =
    vision?.mappedCategoryName ||
    vision?.suggestedCategoryName ||
    vision?.probableProductType;

  if (!suggestion || (vision?.confidence ?? 0) < CONFIRMATION_CONFIDENCE_THRESHOLD) {
    return null;
  }

  return {
    mode: "confirm",
    targetField: "category",
    confidence: vision?.confidence,
    sourceSignals: [
      "vision",
      vision?.mappedCategoryId ? "catalog-category-match" : "vision-text-suggestion",
    ],
    promptText: `Parece que este producto podría ser "${suggestion}". ¿Lo dejamos en esa categoría? Responde sí o no.`,
    pendingConfirmation: {
      targetField: "category",
      promptText: `Parece que este producto podría ser "${suggestion}". ¿Lo dejamos en esa categoría? Responde sí o no.`,
      confidence: vision?.confidence,
      sourceSignals: [
        "vision",
        vision?.mappedCategoryId ? "catalog-category-match" : "vision-text-suggestion",
      ],
      suggestedCategoryName: vision?.mappedCategoryName || vision?.suggestedCategoryName || vision?.probableProductType,
      suggestedCategoryId: vision?.mappedCategoryId ?? null,
    },
  };
}

function buildClassConfirmation(
  draft: ListingDraft
): SmartPromptDecision | null {
  const vision = getVisionSuggestion(draft);
  const suggestion = vision?.mappedClassName || vision?.suggestedClassName;

  if (
    !suggestion ||
    !vision?.mappedClassId ||
    (vision?.confidence ?? 0) < CONFIRMATION_CONFIDENCE_THRESHOLD
  ) {
    return null;
  }

  return {
    mode: "confirm",
    targetField: "class",
    confidence: vision.confidence,
    sourceSignals: ["vision", "catalog-class-match"],
    promptText: `También parece encajar en la clase "${suggestion}". ¿Te parece bien? Responde sí o no.`,
    pendingConfirmation: {
      targetField: "class",
      promptText: `También parece encajar en la clase "${suggestion}". ¿Te parece bien? Responde sí o no.`,
      confidence: vision.confidence,
      sourceSignals: ["vision", "catalog-class-match"],
      suggestedClassName: suggestion,
      suggestedClassId: vision.mappedClassId,
    },
  };
}

function buildDefaultAskPrompt(
  draft: ListingDraft,
  missingField: MissingDraftField
): SmartPromptDecision {
  if (missingField === "description") {
    return {
      mode: "ask",
      targetField: "details",
      promptText: "Cuéntame qué estás vendiendo. Describe el producto en una o dos frases.",
      sourceSignals: ["missing-description"],
    };
  }

  if (missingField === "category") {
    const vision = getVisionSuggestion(draft);
    const helper = vision?.probableProductType
      ? ` Si quieres, puedes basarte en lo que se ve y responder algo como "${vision.probableProductType}".`
      : "";

    return {
      mode: "ask",
      targetField: "category",
      promptText: `¿En qué categoría lo quieres publicar? Puedes responder con texto libre, por ejemplo: huipil, bolsa, faja o accesorio.${helper}`,
      sourceSignals: vision ? ["vision", "missing-category"] : ["missing-category"],
    };
  }

  if (missingField === "class") {
    const vision = getVisionSuggestion(draft);
    const helper = vision?.mappedClassName || vision?.suggestedClassName
      ? ` Si te sirve, podría parecerse a "${vision.mappedClassName || vision.suggestedClassName}".`
      : "";

    return {
      mode: "ask",
      targetField: "class",
      promptText: `¿Qué tipo o clase de producto es? Responde con una clase existente.${helper}`,
      sourceSignals: vision ? ["vision", "missing-class"] : ["missing-class"],
    };
  }

  if (missingField === "measures") {
    return {
      mode: "ask",
      targetField: "measures",
      promptText: "¿Cuáles son las medidas del producto? Ejemplo: 40 x 30 cm.",
      sourceSignals: ["missing-measures"],
    };
  }

  if (missingField === "price") {
    return {
      mode: "ask",
      targetField: "price",
      promptText: "¿Cuál es el precio? Puedes responder algo como: Q250.",
      sourceSignals: ["missing-price"],
    };
  }

  return {
    mode: "ask",
    targetField: "stock",
    promptText: "¿Cuántas unidades tienes disponibles?",
    sourceSignals: ["missing-stock"],
  };
}

export function decideNextPrompt(
  session: ConversationSession,
  draft: ListingDraft,
  missingField: MissingDraftField,
  options?: { forceAsk?: boolean }
): SmartPromptDecision {
  void session;

  if (!options?.forceAsk && missingField === "category") {
    const confirmation = buildCategoryConfirmation(draft);
    if (confirmation) {
      return confirmation;
    }
  }

  if (!options?.forceAsk && missingField === "class") {
    const confirmation = buildClassConfirmation(draft);
    if (confirmation) {
      return confirmation;
    }
  }

  return buildDefaultAskPrompt(draft, missingField);
}
