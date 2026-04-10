import type ConversationSession from "../../models/ConversationSession.model";
import type { FailureSignal } from "./conversationFailureDetector.service";
import { getSessionRiskLevel } from "./conversationScoring.service";
import type { ConversationMemorySnapshot } from "./conversationMemory.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecoveryResponse = {
  message: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildShortMenu(): string {
  return [
    "Puedes escribir:",
    "👉 nuevo — publicar un producto",
    "👉 mis productos — ver tu catálogo",
    "👉 perfil — ver tu información",
    "👉 cancelar — salir del proceso actual",
  ].join("\n");
}

function buildStepGuidance(session: ConversationSession): string {
  switch (session.expected_input_type) {
    case "image":
      return "Envíame una foto del producto para continuar.";
    case "price":
      return "Escribe el precio así: Q250 (solo el número con la Q).";
    case "number":
      return "Escribe la cantidad disponible como número entero. Ejemplo: 5";
    case "category":
      return "Escribe el tipo de producto que quieres publicar. Ejemplo: huipil, güipil, corte.";
    case "text":
    default:
      return "Responde con texto según la pregunta anterior.";
  }
}

// ---------------------------------------------------------------------------
// Per-signal recovery messages
// ---------------------------------------------------------------------------

function buildFrustrationRecovery(session: ConversationSession): string {
  const stepGuidance = session.expected_input_type
    ? `\nActualmente estoy esperando: ${buildStepGuidance(session)}\n`
    : "";

  return [
    "Entiendo que puede ser confuso. Estoy aquí para ayudarte.",
    stepGuidance,
    buildShortMenu(),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildRepeatInputRecovery(session: ConversationSession): string {
  if (session.expected_input_type) {
    return [
      "Parece que enviaste el mismo mensaje varias veces.",
      "",
      buildStepGuidance(session),
    ].join("\n");
  }

  return [
    "Parece que enviaste el mismo mensaje varias veces.",
    "",
    buildShortMenu(),
  ].join("\n");
}

function buildBotRepeatRecovery(): string {
  return [
    "Parece que estamos dando vueltas. Permíteme ayudarte mejor.",
    "",
    "¿Qué quieres hacer?",
    "👉 nuevo — empezar a publicar un producto",
    "👉 mis productos — ver tus publicaciones",
    "👉 cancelar — limpiar y empezar de cero",
  ].join("\n");
}

function buildStepMismatchRecovery(session: ConversationSession): string {
  return [
    "El mensaje que enviaste no coincide con lo que espero en este momento.",
    "",
    buildStepGuidance(session),
    "",
    "Escribe 'cancelar' si deseas salir del proceso.",
  ].join("\n");
}

function buildContextLoopRecovery(): string {
  return [
    "Noté que reiniciamos varias veces. Empecemos con calma.",
    "",
    "¿Qué deseas hacer?",
    "👉 nuevo — publicar un producto",
    "👉 mis productos — ver tu catálogo",
    "👉 menu — ver todas las opciones disponibles",
  ].join("\n");
}

function buildInvalidTransitionRecovery(): string {
  return [
    "Hubo un problema interno. Tu progreso fue conservado en la medida posible.",
    "",
    buildShortMenu(),
  ].join("\n");
}

function buildSilentOutboundFailureRecovery(): string {
  return [
    "Hubo un problema al enviar la respuesta anterior.",
    "Por favor intenta tu acción nuevamente.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Phase 2: Adaptive recovery
// ---------------------------------------------------------------------------

/**
 * Shown when safe_mode=true blocks free-text input.
 * Intentionally minimal — only 3 safe options to reduce cognitive load.
 */
export function buildSafeModeGuidance(): string {
  return [
    "Estoy aquí para ayudarte paso a paso.",
    "",
    "Por favor escribe solo una de estas opciones:",
    "👉 nuevo — publicar un producto",
    "👉 mis productos — ver tu catálogo",
    "👉 cancelar — salir del proceso actual",
  ].join("\n");
}

/**
 * Context-aware recovery that adapts message complexity to the current risk level.
 *
 * CRITICAL → minimal guided menu (3 options, calm tone)
 * HIGH     → simplified 2-option menu relevant to current step
 * MEDIUM   → step guidance + short menu
 * LOW      → delegates to per-signal buildRecoveryResponse
 */
export function buildAdaptiveRecovery(
  session: ConversationSession,
  signals: FailureSignal[],
  _memory: ConversationMemorySnapshot
): RecoveryResponse {
  const riskLevel = getSessionRiskLevel(session.failure_score ?? 0);

  switch (riskLevel) {
    case "CRITICAL": {
      return {
        message: [
          "Veo que está siendo difícil. Te ayudo paso a paso.",
          "",
          "Escribe solo una de estas opciones:",
          "1️⃣ nuevo",
          "2️⃣ mis productos",
          "3️⃣ cancelar",
        ].join("\n"),
      };
    }

    case "HIGH": {
      const isInStep = Boolean(session.expected_input_type);
      if (isInStep) {
        return {
          message: [
            "Parece que hay algo que no está funcionando bien.",
            "",
            buildStepGuidance(session),
            "",
            "O escribe 'cancelar' para salir.",
          ].join("\n"),
        };
      }
      return {
        message: [
          "Parece que hay algo que no está funcionando bien.",
          "",
          "👉 nuevo — publicar un producto",
          "👉 cancelar — limpiar y empezar de cero",
        ].join("\n"),
      };
    }

    case "MEDIUM": {
      const stepGuidance = session.expected_input_type
        ? `\nEn este momento espero: ${buildStepGuidance(session)}\n`
        : "";
      return {
        message: [
          "Parece que hay algo confuso. Déjame orientarte.",
          stepGuidance,
          buildShortMenu(),
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }

    case "LOW":
    default: {
      const primarySignal = signals[0];
      if (!primarySignal) {
        return { message: buildShortMenu() };
      }
      return buildRecoveryResponse(session, primarySignal);
    }
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function buildRecoveryResponse(
  session: ConversationSession,
  signal: FailureSignal
): RecoveryResponse {
  switch (signal) {
    case "frustration_detected":
      return { message: buildFrustrationRecovery(session) };

    case "user_repeated_input":
      return { message: buildRepeatInputRecovery(session) };

    case "bot_repeated_itself":
      return { message: buildBotRepeatRecovery() };

    case "step_mismatch":
      return { message: buildStepMismatchRecovery(session) };

    case "context_loop":
      return { message: buildContextLoopRecovery() };

    case "invalid_transition":
      return { message: buildInvalidTransitionRecovery() };

    case "silent_outbound_failure":
      return { message: buildSilentOutboundFailureRecovery() };

    default: {
      const _exhaustive: never = signal;
      return {
        message: ["Ocurrió algo inesperado.", "", buildShortMenu()].join("\n"),
      };
    }
  }
}
