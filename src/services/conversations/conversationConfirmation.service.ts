import type ListingDraft from "../../models/ListingDraft.model";
import type ConversationSession from "../../models/ConversationSession.model";
import type { DraftPatch } from "../listing-drafts/listingDraft.types";

export type ConfirmationTargetField = "category" | "class";

export type PendingConfirmation = {
  targetField: ConfirmationTargetField;
  promptText: string;
  confidence?: number;
  sourceSignals?: string[];
  suggestedCategoryName?: string;
  suggestedCategoryId?: number | null;
  suggestedClassName?: string;
  suggestedClassId?: number | null;
};

export type ConfirmationIntent = "yes" | "no" | "unknown";

const YES_WORDS = new Set([
  "si",
  "sí",
  "correcto",
  "correcta",
  "esta bien",
  "está bien",
  "dale",
  "ok",
  "okay",
  "asi dejalo",
  "así déjalo",
  "dejalo asi",
  "déjalo así",
  "dejalo asi",
  "va",
]);

const NO_WORDS = new Set([
  "no",
  "no es eso",
  "cambia eso",
  "eso no",
  "incorrecto",
  "incorrecta",
  "no correcto",
  "no está bien",
  "no esta bien",
]);

function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function getPendingConfirmation(
  session: ConversationSession
): PendingConfirmation | null {
  const value = session.pending_confirmation_json;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as PendingConfirmation;
}

export function parseConfirmationIntent(text: string): ConfirmationIntent {
  const normalized = normalizeText(text);
  if (!normalized) return "unknown";
  if (YES_WORDS.has(normalized)) return "yes";
  if (NO_WORDS.has(normalized)) return "no";
  return "unknown";
}

export function buildConfirmationClarification(
  pending: PendingConfirmation
): string {
  const label = pending.targetField === "category" ? "categoría" : "clase";
  return `Solo necesito confirmar la ${label}. Responde sí o no, o escribe la opción correcta.`;
}

export function buildPatchFromConfirmation(
  pending: PendingConfirmation
): DraftPatch {
  if (pending.targetField === "category") {
    return {
      categoria_id: pending.suggestedCategoryId ?? null,
      categoria_custom: pending.suggestedCategoryId
        ? null
        : pending.suggestedCategoryName ?? null,
      suggested_title: pending.suggestedCategoryName ?? null,
    };
  }

  return {
    clase_id: pending.suggestedClassId ?? null,
  };
}
