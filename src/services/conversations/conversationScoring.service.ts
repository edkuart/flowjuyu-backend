import ConversationSession from "../../models/ConversationSession.model";
import { logger } from "../../config/logger";
import type { FailureSignal } from "./conversationFailureDetector.service";

// ---------------------------------------------------------------------------
// Risk levels
// ---------------------------------------------------------------------------

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** Returns the risk level for a session or a given failure_score value (0–100). */
export function getSessionRiskLevel(
  sessionOrFailureScore: ConversationSession | number
): RiskLevel {
  const failureScore =
    typeof sessionOrFailureScore === "number"
      ? sessionOrFailureScore
      : sessionOrFailureScore.failure_score ?? 0;
  if (failureScore <= 20) return "LOW";
  if (failureScore <= 50) return "MEDIUM";
  if (failureScore <= 80) return "HIGH";
  return "CRITICAL";
}

// ---------------------------------------------------------------------------
// Score increments per signal
// ---------------------------------------------------------------------------

type ScoreDelta = {
  failure: number;
  frustration: number;
};

const SIGNAL_INCREMENTS: Partial<Record<FailureSignal, ScoreDelta>> = {
  frustration_detected: { failure: 20, frustration: 20 },
  user_repeated_input: { failure: 10, frustration: 5 },
  bot_repeated_itself: { failure: 15, frustration: 0 },
  invalid_transition: { failure: 25, frustration: 0 },
  context_loop: { failure: 30, frustration: 10 },
  step_mismatch: { failure: 5, frustration: 0 },
  silent_outbound_failure: { failure: 5, frustration: 0 },
};

/** Points to subtract from failure_score after each successful step completion. */
const SUCCESS_FAILURE_DECAY = 10;

/** Points to subtract from frustration_score after each successful step completion. */
const SUCCESS_FRUSTRATION_DECAY = 5;

// ---------------------------------------------------------------------------
// Score mutation helpers
// ---------------------------------------------------------------------------

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function currentScores(session: ConversationSession): {
  failure: number;
  frustration: number;
} {
  return {
    failure: session.failure_score ?? 0,
    frustration: session.frustration_score ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ScoreSnapshot = {
  failure_score: number;
  frustration_score: number;
  risk_level: RiskLevel;
};

/**
 * Applies signal increments to the session's failure and frustration scores,
 * persists the updated values, and returns a snapshot with the new risk level.
 *
 * Safe to call with an empty signals array (no-op persistence is avoided).
 */
export async function updateSessionScore(
  session: ConversationSession,
  signals: FailureSignal[]
): Promise<ScoreSnapshot> {
  if (signals.length === 0) {
    const scores = currentScores(session);
    return {
      failure_score: scores.failure,
      frustration_score: scores.frustration,
      risk_level: getSessionRiskLevel(scores.failure),
    };
  }

  let { failure, frustration } = currentScores(session);

  for (const signal of signals) {
    const delta = SIGNAL_INCREMENTS[signal];
    if (delta) {
      failure = clamp(failure + delta.failure);
      frustration = clamp(frustration + delta.frustration);
    }
  }

  await session.update({ failure_score: failure, frustration_score: frustration });
  session.failure_score = failure;
  session.frustration_score = frustration;

  const risk_level = getSessionRiskLevel(failure);

  logger.info(
    {
      session_id: session.id,
      failure_score: failure,
      frustration_score: frustration,
      risk_level,
      signals,
    },
    "[conversation][score.updated]"
  );

  return { failure_score: failure, frustration_score: frustration, risk_level };
}

/**
 * Reduces scores when the user completes a step successfully.
 * Signals positive engagement — small decay to reward progress.
 */
export async function applySuccessfulStepDecay(
  session: ConversationSession
): Promise<void> {
  const { failure, frustration } = currentScores(session);
  const newFailure = clamp(failure - SUCCESS_FAILURE_DECAY);
  const newFrustration = clamp(frustration - SUCCESS_FRUSTRATION_DECAY);

  if (newFailure === failure && newFrustration === frustration) return;

  await session.update({
    failure_score: newFailure,
    frustration_score: newFrustration,
  });
  session.failure_score = newFailure;
  session.frustration_score = newFrustration;

  logger.info(
    {
      session_id: session.id,
      previous_failure_score: failure,
      failure_score: newFailure,
      previous_frustration_score: frustration,
      frustration_score: newFrustration,
      risk_level: getSessionRiskLevel(newFailure),
    },
    "[conversation][score.updated]"
  );
}

/**
 * Evaluates whether to enter or exit safe mode based on the current failure score.
 *
 * Enter condition : failure_score > 80 (CRITICAL) and safe_mode is false
 * Exit condition  : failure_score < 40 and safe_mode is true
 *
 * Returns true if safe_mode state changed (for logging at the call site).
 */
export async function evaluateSafeMode(
  session: ConversationSession
): Promise<boolean> {
  const score = session.failure_score ?? 0;
  const riskLevel = getSessionRiskLevel(score);

  if (riskLevel === "CRITICAL" && !session.safe_mode) {
    await session.update({ safe_mode: true });
    session.safe_mode = true;
    logger.info(
      { session_id: session.id, failure_score: score, risk_level: riskLevel },
      "[conversation][safe_mode.enter]"
    );
    return true;
  }

  if (session.safe_mode && score < 40) {
    await session.update({ safe_mode: false });
    session.safe_mode = false;
    logger.info(
      { session_id: session.id, failure_score: score, risk_level: riskLevel },
      "[conversation][safe_mode.exit]"
    );
    return true;
  }

  return false;
}
