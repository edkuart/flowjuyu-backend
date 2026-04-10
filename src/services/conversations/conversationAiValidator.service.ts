import type ConversationSession from "../../models/ConversationSession.model";
import type { AiFallbackResponse } from "../ai/aiFallback.interface";

export type AiValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

const MAX_AI_RESPONSE_CHARS = 500;

const FORBIDDEN_PATTERNS: RegExp[] = [
  /\b(ya\s+)?(borre|borré|elimine|eliminé|publique|publiqué|guarde|guardé|actualice|actualicé|modifique|modifiqué)\b/i,
  /\b(confirmado|confirmada|listo,\s*(publique|publiqué|borre|borré|elimine|eliminé|guarde|guardé))\b/i,
  /\b(voy\s+a\s+)?(borrar|eliminar|publicar|guardar|modificar|actualizar)\b/i,
  /\bcomando\s+ejecutado\b/i,
  /\b(accion|acción)\s+(realizada|completada|ejecutada)\b/i,
  /\b(ya\s+quedo|ya\s+quedó)\b/i,
];

function contradictsCurrentStep(
  responseText: string,
  session: ConversationSession
): boolean {
  const text = responseText.toLowerCase();

  if (session.current_step === "awaiting_price") {
    return /\b(foto|imagen|categoria|categoría|stock|cantidad)\b/.test(text);
  }

  if (session.current_step === "awaiting_stock") {
    return /\b(foto|imagen|precio|categoria|categoría)\b/.test(text);
  }

  if (session.expected_input_type === "image") {
    return /\b(precio|stock|cantidad|publicar)\b/.test(text);
  }

  return false;
}

export function validateAiFallbackResponse(
  response: AiFallbackResponse,
  session: ConversationSession
): AiValidationResult {
  const text = response.text?.trim();

  if (!text) {
    return { valid: false, reason: "empty_response" };
  }

  if (text.length > MAX_AI_RESPONSE_CHARS) {
    return { valid: false, reason: "response_too_long" };
  }

  if (response.confidence < 0.5) {
    return { valid: false, reason: "low_confidence" };
  }

  if (FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text))) {
    return { valid: false, reason: "forbidden_action" };
  }

  if (contradictsCurrentStep(text, session)) {
    return { valid: false, reason: "contradicts_current_step" };
  }

  return { valid: true };
}
