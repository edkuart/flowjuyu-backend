import type { FailureSignal } from "./conversationFailureDetector.service";
import type { ConversationMemorySnapshot } from "./conversationMemory.service";
import type { ConversationStep } from "./conversationState";
import type { NormalizedInboundMessage } from "../integrations/whatsapp/whatsapp.types";

export type ConversationAiGateContext = {
  failure_score: number;
  frustration_score: number;
  failure_signals: FailureSignal[];
  current_step: ConversationStep | string | null;
  expected_input_type: string | null;
  safe_mode: boolean;
  message_type: NormalizedInboundMessage["type"];
  last_user_messages: ConversationMemorySnapshot["lastUserMessages"];
  last_actions?: ConversationMemorySnapshot["lastActions"];
  recovery_attempted?: boolean;
};

export type ConversationAiGateDecision = {
  useAi: boolean;
  reason?: string;
};

const STRICT_STEPS = new Set(["awaiting_price", "awaiting_stock"]);
const STRICT_INPUT_TYPES = new Set(["price", "number"]);

function countSignal(signals: readonly FailureSignal[], signal: FailureSignal): number {
  return signals.filter((item) => item === signal).length;
}

function hasRepeatedInputWithoutProgress(context: ConversationAiGateContext): boolean {
  if (!context.failure_signals.includes("user_repeated_input")) return false;
  const [latest, previous] = context.last_user_messages;
  const repeatedText = Boolean(latest && previous && latest === previous);
  const recentActions = context.last_actions ?? [];
  const noRecentProgress =
    recentActions.length === 0 || recentActions.every((action) => action === recentActions[0]);
  return repeatedText || noRecentProgress;
}

export function shouldUseAiFallback(
  context: ConversationAiGateContext
): ConversationAiGateDecision {
  if (context.message_type !== "text" && context.message_type !== "audio") {
    return { useAi: false, reason: "unsupported_message_type" };
  }

  if (
    (context.current_step && STRICT_STEPS.has(String(context.current_step))) ||
    (context.expected_input_type && STRICT_INPUT_TYPES.has(context.expected_input_type))
  ) {
    return { useAi: false, reason: "strict_structured_step" };
  }

  const criticalOverride = context.failure_score >= 81;
  if (context.safe_mode && !criticalOverride) {
    return { useAi: false, reason: "safe_mode_blocks_free_interpretation" };
  }

  const hasHighFailureScore = context.failure_score >= 50;
  const hasRepeatedFrustration =
    countSignal(context.failure_signals, "frustration_detected") >= 2 ||
    (context.frustration_score >= 40 &&
      context.failure_signals.includes("frustration_detected"));
  const hasRepeatedNoProgress = hasRepeatedInputWithoutProgress(context);
  const hasInvalidTransitionAfterRecovery =
    context.failure_signals.includes("invalid_transition") &&
    Boolean(context.recovery_attempted);
  const hasContextLoopWithRisk =
    context.failure_signals.includes("context_loop") && context.failure_score >= 21;

  if (hasHighFailureScore) return { useAi: true, reason: "high_failure_score" };
  if (hasRepeatedFrustration) return { useAi: true, reason: "repeated_frustration" };
  if (hasRepeatedNoProgress) return { useAi: true, reason: "repeated_input_no_progress" };
  if (hasInvalidTransitionAfterRecovery) {
    return { useAi: true, reason: "invalid_transition_after_recovery" };
  }
  if (hasContextLoopWithRisk) return { useAi: true, reason: "context_loop_with_risk" };

  return { useAi: false, reason: "friction_below_ai_threshold" };
}
