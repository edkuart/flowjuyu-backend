import type ConversationSession from "../../models/ConversationSession.model";
import type ListingDraft from "../../models/ListingDraft.model";
import type ConversationFailureEvent from "../../models/ConversationFailureEvent.model";
import { getSessionRiskLevel, type RiskLevel } from "./conversationScoring.service";
import type { ConversationMemorySnapshot } from "./conversationMemory.service";
import type { FailureSignal } from "./conversationFailureDetector.service";

export type ConversationAiDraftSnapshot = {
  id: string;
  status: string;
  has_images: boolean;
  image_count: number;
  title: string | null;
  description: string | null;
  price: number | null;
  stock: number | null;
  measures_text: string | null;
  category: string | null;
  class_id: number | null;
};

export type ConversationAiFailureEventSnapshot = {
  signal: string;
  current_step: string | null;
  expected_input_type: string | null;
  user_text: string | null;
  created_at: string;
};

export type ConversationAiContext = {
  session_id: string;
  current_step: string;
  expected_input_type: string | null;
  failure_score: number;
  frustration_score: number;
  safe_mode: boolean;
  risk_level: RiskLevel;
  last_user_messages: readonly string[];
  last_bot_messages: readonly string[];
  last_actions: readonly string[];
  draft: ConversationAiDraftSnapshot | null;
  failure_signals_history: ConversationAiFailureEventSnapshot[];
};

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function buildDraftSnapshot(
  draft: ListingDraft | null | undefined
): ConversationAiDraftSnapshot | null {
  if (!draft) return null;
  const images = Array.isArray(draft.images_json) ? draft.images_json : [];

  return {
    id: draft.id,
    status: draft.status,
    has_images: images.length > 0,
    image_count: images.length,
    title: draft.suggested_title ?? null,
    description: draft.suggested_description ?? null,
    price: toNumber(draft.price),
    stock: toNumber(draft.stock),
    measures_text: draft.measures_text ?? null,
    category: draft.categoria_custom ?? (draft.categoria_id != null ? String(draft.categoria_id) : null),
    class_id: draft.clase_id ?? null,
  };
}

export function buildAiContext(
  session: ConversationSession,
  memory: ConversationMemorySnapshot,
  failureEvents: ConversationFailureEvent[] = [],
  draft?: ListingDraft | null
): ConversationAiContext {
  return {
    session_id: session.id,
    current_step: session.current_step,
    expected_input_type: session.expected_input_type ?? null,
    failure_score: session.failure_score ?? 0,
    frustration_score: session.frustration_score ?? 0,
    safe_mode: Boolean(session.safe_mode),
    risk_level: getSessionRiskLevel(session),
    last_user_messages: memory.lastUserMessages.slice(0, 5),
    last_bot_messages: memory.lastBotMessages.slice(0, 3),
    last_actions: memory.lastActions.slice(0, 5),
    draft: buildDraftSnapshot(draft),
    failure_signals_history: failureEvents.slice(0, 10).map((event) => ({
      signal: event.signal,
      current_step: event.current_step ?? null,
      expected_input_type: event.expected_input_type ?? null,
      user_text: event.user_text ?? null,
      created_at: event.created_at instanceof Date
        ? event.created_at.toISOString()
        : String(event.created_at),
    })),
  };
}

export function buildPrompt(context: ConversationAiContext): string {
  const payload = JSON.stringify(context, null, 2);

  return [
    "Eres un asistente de soporte para vendedores de Flowjuyu en WhatsApp.",
    "La plataforma ya tiene reglas, pasos y comandos. Tu trabajo NO es ejecutar acciones.",
    "",
    "Reglas estrictas:",
    "- No confirmes publicaciones, eliminaciones, guardados ni cambios.",
    "- No digas que borraste, publicaste, guardaste o modificaste datos.",
    "- No inventes politicas, precios, comisiones, categorias ni datos del producto.",
    "- No pidas datos sensibles.",
    "- No uses mas de 500 caracteres.",
    "- Responde en espanol claro, calmado y breve.",
    "- Guia a la persona de vuelta al paso actual.",
    "- Si el paso espera un tipo especifico de dato, pide solo ese dato.",
    "",
    "Devuelve SOLO JSON valido con esta forma:",
    '{"text":"mensaje para WhatsApp","confidence":0.0,"intent":"clarify|guide|calm|unknown"}',
    "",
    "Contexto de la conversacion:",
    payload,
  ].join("\n");
}

export function getRecentFailureSignals(
  events: readonly ConversationFailureEvent[]
): FailureSignal[] {
  return events
    .map((event) => event.signal)
    .filter((signal): signal is FailureSignal =>
      [
        "bot_repeated_itself",
        "user_repeated_input",
        "frustration_detected",
        "step_mismatch",
        "silent_outbound_failure",
        "invalid_transition",
        "context_loop",
      ].includes(signal)
    );
}
