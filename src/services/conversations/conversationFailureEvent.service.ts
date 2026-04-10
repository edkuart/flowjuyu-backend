import ConversationFailureEvent from "../../models/ConversationFailureEvent.model";
import type ConversationSession from "../../models/ConversationSession.model";
import { logger } from "../../config/logger";
import type { ConversationEventSignal, FailureSignal } from "./conversationFailureDetector.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PersistFailureEventParams = {
  session: ConversationSession;
  /** Accepts both failure signals and informational signals (e.g. faq_resolved). */
  signal: ConversationEventSignal;
  waMessageId?: string | null;
  userText?: string | null;
  botText?: string | null;
  metadata?: Record<string, unknown>;
};

const FAILURE_EVENTS_RECHECK_MS = 5 * 60 * 1000;

let failureEventsPersistenceEnabled = true;
let failureEventsDisabledReason: string | null = null;
let failureEventsDisabledAt = 0;
let skippedLogCount = 0;

function getErrorCode(error: any): string | null {
  return (
    error?.original?.code ??
    error?.parent?.code ??
    error?.code ??
    null
  );
}

function getErrorMessage(error: any): string {
  return String(
    error?.original?.message ??
      error?.parent?.message ??
      error?.message ??
      error
  );
}

export function isInfrastructureMissingError(error: unknown): boolean {
  const err = error as any;
  const code = getErrorCode(err);
  const message = getErrorMessage(err).toLowerCase();

  return (
    code === "42P01" ||
    message.includes("relation") && message.includes("does not exist") ||
    message.includes("undefined table") ||
    message.includes("conversation_failure_events") && message.includes("does not exist") ||
    message.includes("schema") && message.includes("does not exist")
  );
}

export function disableFailurePersistence(reason: string): void {
  if (!failureEventsPersistenceEnabled && failureEventsDisabledReason === reason) {
    return;
  }

  failureEventsPersistenceEnabled = false;
  failureEventsDisabledReason = reason;
  failureEventsDisabledAt = Date.now();
  skippedLogCount = 0;

  logger.error(
    { reason },
    "[failure-intel][persistence.disabled]"
  );
}

export function resetFailurePersistenceGuard(): void {
  failureEventsPersistenceEnabled = true;
  failureEventsDisabledReason = null;
  failureEventsDisabledAt = 0;
  skippedLogCount = 0;

  logger.info("[failure-intel][persistence.enabled]");
}

export function getFailurePersistenceGuardStatus(): {
  enabled: boolean;
  reason: string | null;
  disabledAt: number | null;
} {
  return {
    enabled: failureEventsPersistenceEnabled,
    reason: failureEventsDisabledReason,
    disabledAt: failureEventsDisabledAt || null,
  };
}

function shouldSkipBecauseDisabled(params: PersistFailureEventParams): boolean {
  if (failureEventsPersistenceEnabled) return false;

  const disabledForMs = Date.now() - failureEventsDisabledAt;
  if (disabledForMs >= FAILURE_EVENTS_RECHECK_MS) {
    logger.info(
      {
        session_id: params.session.id,
        signal: params.signal,
        disabled_for_ms: disabledForMs,
      },
      "[failure-intel][persistence.recheck]"
    );
    failureEventsPersistenceEnabled = true;
    return false;
  }

  skippedLogCount++;
  if (skippedLogCount === 1 || skippedLogCount % 100 === 0) {
    logger.info(
      {
        session_id: params.session.id,
        signal: params.signal,
        reason: failureEventsDisabledReason,
        skipped_count: skippedLogCount,
      },
      "[failure-intel][persistence.skipped]"
    );
  }

  return true;
}

// ---------------------------------------------------------------------------
// Service
//
// All writes are wrapped in try/catch. Failure event persistence must NEVER
// crash or throw into the calling orchestrator — it is always secondary to
// the main conversation flow.
// ---------------------------------------------------------------------------

export async function persistFailureEvent(
  params: PersistFailureEventParams
): Promise<void> {
  if (shouldSkipBecauseDisabled(params)) return;

  try {
    await ConversationFailureEvent.create({
      session_id: params.session.id,
      seller_user_id: params.session.linked_seller_user_id ?? null,
      wa_message_id: params.waMessageId ?? null,
      signal: params.signal,
      user_text: params.userText ?? null,
      bot_text: params.botText ?? null,
      current_step: params.session.current_step ?? null,
      expected_input_type: params.session.expected_input_type ?? null,
      command_context: (params.session.command_context_json as object) ?? null,
      metadata: params.metadata ?? null,
    });

    logger.info(
      {
        session_id: params.session.id,
        seller_user_id: params.session.linked_seller_user_id ?? null,
        wa_message_id: params.waMessageId ?? null,
        signal: params.signal,
        current_step: params.session.current_step ?? null,
        expected_input_type: params.session.expected_input_type ?? null,
      },
      "[conversation][failure.event_persisted]"
    );
  } catch (err: any) {
    if (isInfrastructureMissingError(err)) {
      logger.error(
        {
          session_id: params.session.id,
          signal: params.signal,
          error_code: getErrorCode(err),
          error: getErrorMessage(err),
        },
        "[failure-intel][infra.missing]"
      );
      disableFailurePersistence("conversation_failure_events_missing");
      return;
    }

    // Log and swallow — this must not affect the conversation flow.
    logger.error(
      {
        session_id: params.session.id,
        signal: params.signal,
        error_code: getErrorCode(err),
        error: getErrorMessage(err),
      },
      "[failure-intel][event.persist.failed]"
    );
  }
}

/**
 * Persist multiple signals in parallel. All failures are swallowed individually.
 */
export async function persistFailureEvents(
  params: Omit<PersistFailureEventParams, "signal"> & { signals: ConversationEventSignal[] }
): Promise<void> {
  const { signals, ...rest } = params;
  await Promise.all(signals.map((signal) => persistFailureEvent({ ...rest, signal })));
}
