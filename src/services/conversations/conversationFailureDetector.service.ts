import { Op } from "sequelize";
import ConversationMessage from "../../models/ConversationMessage.model";
import type ConversationSession from "../../models/ConversationSession.model";
import type { NormalizedInboundMessage } from "../integrations/whatsapp/whatsapp.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FailureSignal =
  | "bot_repeated_itself"
  | "user_repeated_input"
  | "frustration_detected"
  | "step_mismatch"
  | "silent_outbound_failure"
  | "invalid_transition"
  | "context_loop";

/**
 * Broader event signal type that includes both failure signals and
 * success/informational signals (e.g. faq_resolved).
 * Use this type for persistence via conversationFailureEvent.service.
 */
export type ConversationEventSignal =
  | FailureSignal
  | "faq_resolved"
  | "ai_used"
  | "ai_rejected";

export type FailureDetectionResult = {
  signals: FailureSignal[];
  /** Signals that should interrupt the normal flow and trigger recovery */
  intercepting: FailureSignal[];
};

// ---------------------------------------------------------------------------
// Frustration patterns
//
// All patterns are tested against the NFD-normalized, diacritics-stripped,
// lowercased text (same normalization used by the command matcher).
// Keep patterns concise — prefer specific phrases over broad tokens.
// ---------------------------------------------------------------------------

const FRUSTRATION_PATTERNS: RegExp[] = [
  /^\?+$/, // standalone question marks
  /^que\??$/, // bare "que" or "que?"
  /\bno entiendo\b/,
  /\bno sirve\b/,
  /\bno funciona\b/,
  /\bno me ayuda\b/,
  /\bno me sirve\b/,
  /\besto no funciona\b/,
  /\bno se puede\b/,
  /\bno puedo\b/,
  /\bconfuso\b/,
  /\bconfundido\b/,
  /\bno entend/,
  /\bpor que no\b/,
  /\bpor que no funciona\b/,
  /\bque esta pasando\b/,
  /\bque paso\b/,
  /\bque hago\b/,
  /\bno se que\b/,
  /\bno se como\b/,
];

export function detectFrustrationFromText(normalizedText: string): boolean {
  if (!normalizedText) return false;
  return FRUSTRATION_PATTERNS.some((pattern) => pattern.test(normalizedText));
}

// ---------------------------------------------------------------------------
// Step mismatch detection
//
// Fires when expected_input_type is "image" but the user sent text that is not
// a command. This means the user typed something instead of sending a photo.
// The orchestrator already sends buildUnexpectedInputMessage in this case, so
// this signal is recorded for analytics — it does NOT trigger an extra reply.
// ---------------------------------------------------------------------------

export function detectStepMismatch(
  session: ConversationSession,
  messageType: NormalizedInboundMessage["type"]
): boolean {
  return session.expected_input_type === "image" && messageType === "text";
}

// ---------------------------------------------------------------------------
// Async (DB-backed) signal detectors
//
// These are non-intercepting by default — they persist events for analysis
// but do not change the bot's reply. Called fire-and-forget from orchestrator.
// ---------------------------------------------------------------------------

/**
 * Returns true if the user sent the exact same normalized text as their
 * most recent previous inbound message in this session.
 */
export async function detectUserRepeatedInput(
  session: ConversationSession,
  normalizedText: string,
  currentWaMessageId: string
): Promise<boolean> {
  if (!normalizedText) return false;

  try {
    const previous = await ConversationMessage.findOne({
      where: {
        session_id: session.id,
        direction: "inbound",
        message_type: "text",
        wa_message_id: { [Op.ne]: currentWaMessageId },
      },
      order: [["created_at", "DESC"]],
      attributes: ["content_text"],
    });

    if (!previous?.content_text) return false;

    // Compare against the stored (already normalized at save time) text
    const prevNormalized = previous.content_text.trim().toLowerCase();
    return prevNormalized === normalizedText;
  } catch {
    return false;
  }
}

/**
 * Returns true if the two most recent outbound messages in this session
 * have identical text content — the bot is looping.
 */
export async function detectBotRepeatedItself(
  session: ConversationSession
): Promise<boolean> {
  try {
    const recent = await ConversationMessage.findAll({
      where: {
        session_id: session.id,
        direction: "outbound",
        status: "sent",
      },
      order: [["created_at", "DESC"]],
      limit: 2,
      attributes: ["content_text"],
    });

    if (recent.length < 2) return false;

    const [latest, previous] = recent;
    return (
      Boolean(latest.content_text) &&
      latest.content_text === previous.content_text
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main detection entry point
//
// Returns a FailureDetectionResult with two buckets:
//   signals     — all detected signals (for persistence / analysis)
//   intercepting — signals that should stop normal flow and trigger recovery
//
// Design intent:
//   - frustration_detected → INTERCEPTING (show recovery, do not process step)
//   - step_mismatch        → NOT intercepting (bot already handles this path)
//   - user_repeated_input  → NOT intercepting (log only, avoid double-reply)
//   - bot_repeated_itself  → NOT intercepting (detected post-send, log only)
//
// The orchestrator checks `intercepting` to decide whether to short-circuit.
// ---------------------------------------------------------------------------

export function detectSyncFailureSignals(params: {
  session: ConversationSession;
  normalizedText: string;
  messageType: NormalizedInboundMessage["type"];
}): FailureDetectionResult {
  const signals: FailureSignal[] = [];
  const intercepting: FailureSignal[] = [];

  if (
    params.messageType === "text" &&
    detectFrustrationFromText(params.normalizedText)
  ) {
    signals.push("frustration_detected");
    intercepting.push("frustration_detected");
  }

  if (detectStepMismatch(params.session, params.messageType)) {
    // step_mismatch is logged only — orchestrator already sends the right reply
    signals.push("step_mismatch");
  }

  return { signals, intercepting };
}

/**
 * Fire-and-forget async signal detection.
 * Called without await from the orchestrator — failures here never surface.
 * Returns the detected async signals for callers that do await it.
 */
export async function detectAsyncFailureSignals(params: {
  session: ConversationSession;
  normalizedText: string;
  waMessageId: string;
}): Promise<FailureSignal[]> {
  const signals: FailureSignal[] = [];

  const [userRepeated, botRepeated] = await Promise.all([
    detectUserRepeatedInput(
      params.session,
      params.normalizedText,
      params.waMessageId
    ),
    detectBotRepeatedItself(params.session),
  ]);

  if (userRepeated) signals.push("user_repeated_input");
  if (botRepeated) signals.push("bot_repeated_itself");

  return signals;
}
