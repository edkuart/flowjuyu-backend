import type ConversationSession from "../../models/ConversationSession.model";
import type ListingDraft from "../../models/ListingDraft.model";
import type ConversationFailureEvent from "../../models/ConversationFailureEvent.model";
import { getSessionRiskLevel, type RiskLevel } from "./conversationScoring.service";
import type { ConversationMemorySnapshot } from "./conversationMemory.service";
import type { FailureSignal } from "./conversationFailureDetector.service";

export type ConversationAiRecoveryState = {
  activeFailureSignals: readonly string[];
  triggerReason?: string;
  priorRecoveryAttempts: number;
  ruleRecoveryText?: string;
};

export type ConversationAiDraftSnapshot = {
  status: string;
  has_images: boolean;
  image_count: number;
  has_title: boolean;
  has_description: boolean;
  has_price: boolean;
  has_stock: boolean;
  measures_text: string | null;
  category: string | null;
};

export type ConversationAiContext = {
  session_id: string;
  current_step: string;
  expected_input_type: string | null;
  risk_level: RiskLevel;
  safe_mode: boolean;
  last_user_messages: readonly string[];
  last_bot_messages: readonly string[];
  active_failure_signals: readonly string[];
  draft: ConversationAiDraftSnapshot | null;
  recent_recovery_attempts: number;
  trigger_reason?: string;
  rule_recovery_text?: string;
};

function buildDraftSnapshot(draft: ListingDraft | null): ConversationAiDraftSnapshot | null {
  if (!draft) return null;
  const images = Array.isArray(draft.images_json) ? draft.images_json : [];

  return {
    status: draft.status,
    has_images: images.length > 0,
    image_count: images.length,
    has_title: Boolean(draft.suggested_title?.trim()),
    has_description: Boolean(draft.suggested_description?.trim()),
    has_price: draft.price != null,
    has_stock: draft.stock != null,
    measures_text: draft.measures_text ?? null,
    category: draft.categoria_custom ?? (draft.categoria_id != null ? String(draft.categoria_id) : null),
  };
}

export function countRecentRecoveryAttempts(
  failureEvents: readonly ConversationFailureEvent[]
): number {
  return failureEvents.filter((event) => Boolean(event.bot_text)).length;
}

export function buildAiContext(
  session: ConversationSession,
  memory: ConversationMemorySnapshot,
  draft: ListingDraft | null,
  failureEvents: ConversationFailureEvent[],
  recoveryState: ConversationAiRecoveryState
): ConversationAiContext {
  return {
    session_id: session.id,
    current_step: session.current_step,
    expected_input_type: session.expected_input_type ?? null,
    risk_level: getSessionRiskLevel(session),
    safe_mode: Boolean(session.safe_mode),
    last_user_messages: memory.lastUserMessages.slice(0, 5),
    last_bot_messages: memory.lastBotMessages.slice(0, 3),
    active_failure_signals: recoveryState.activeFailureSignals.slice(0, 8),
    draft: buildDraftSnapshot(draft),
    recent_recovery_attempts:
      recoveryState.priorRecoveryAttempts || countRecentRecoveryAttempts(failureEvents),
    trigger_reason: recoveryState.triggerReason,
    rule_recovery_text: recoveryState.ruleRecoveryText,
  };
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
    )
    .slice(0, 10);
}
