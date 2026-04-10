import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db";

/**
 * conversationFailureAnalytics.service.ts
 *
 * Backend-only analytics over the conversation_failure_events table.
 * Intended for admin panel integration, dashboards, and ML training data prep.
 *
 * NO UI is built here — these are pure data-retrieval functions.
 *
 * Design:
 *   - All queries are read-only and include LIMIT guards.
 *   - All time windows default to "last 24 hours" but are configurable.
 *   - "faq_resolved" events are excluded from failure aggregations by default
 *     (they are success signals, not failures). Pass includeResolved=true to override.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FailureSignalSummary = {
  signal: string;
  count: number;
  /** Percentage of total failure events in the time window. */
  pct: number;
};

export type FailingStepSummary = {
  current_step: string;
  count: number;
  /** Most common signal at this step. */
  top_signal: string | null;
};

export type CommonInputSummary = {
  user_text: string;
  count: number;
  /** Most common signal triggered by this text. */
  top_signal: string | null;
};

export type AnalyticsTimeRange = {
  lastHours?: number;
  since?: Date;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSinceDate(range: AnalyticsTimeRange): Date {
  if (range.since) return range.since;
  const hours = range.lastHours ?? 24;
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

const EXCLUDE_RESOLVED = `AND signal NOT IN ('faq_resolved', 'ai_used', 'ai_rejected')`;

// ---------------------------------------------------------------------------
// Query 1: Top failure signals
// ---------------------------------------------------------------------------

/**
 * Returns failure signals ranked by frequency within the time window.
 * Useful for identifying which signal type is most common.
 */
export async function getTopFailureSignals(
  range: AnalyticsTimeRange = {},
  limit = 20
): Promise<FailureSignalSummary[]> {
  const since = buildSinceDate(range);

  type Row = { signal: string; count: string };

  const rows = await sequelize.query<Row>(
    `SELECT signal, COUNT(*) AS count
     FROM conversation_failure_events
     WHERE created_at >= :since
       ${EXCLUDE_RESOLVED}
     GROUP BY signal
     ORDER BY count DESC
     LIMIT :limit`,
    { replacements: { since, limit }, type: QueryTypes.SELECT }
  );

  const total = rows.reduce((sum, r) => sum + Number(r.count), 0);

  return rows.map((r) => ({
    signal: r.signal,
    count: Number(r.count),
    pct: total > 0 ? Math.round((Number(r.count) / total) * 100) : 0,
  }));
}

// ---------------------------------------------------------------------------
// Query 2: Top failing steps
// ---------------------------------------------------------------------------

/**
 * Returns conversation steps ranked by total failure events at that step.
 * Useful for identifying which parts of the draft flow cause the most friction.
 */
export async function getTopFailingSteps(
  range: AnalyticsTimeRange = {},
  limit = 20
): Promise<FailingStepSummary[]> {
  const since = buildSinceDate(range);

  type Row = { current_step: string; count: string; top_signal: string | null };

  const rows = await sequelize.query<Row>(
    `SELECT
       current_step,
       COUNT(*) AS count,
       (
         SELECT signal
         FROM conversation_failure_events AS inner_e
         WHERE inner_e.current_step = outer_e.current_step
           AND inner_e.created_at >= :since
           ${EXCLUDE_RESOLVED}
         GROUP BY signal
         ORDER BY COUNT(*) DESC
         LIMIT 1
       ) AS top_signal
     FROM conversation_failure_events AS outer_e
     WHERE created_at >= :since
       AND current_step IS NOT NULL
       ${EXCLUDE_RESOLVED}
     GROUP BY current_step
     ORDER BY count DESC
     LIMIT :limit`,
    { replacements: { since, limit }, type: QueryTypes.SELECT }
  );

  return rows.map((r) => ({
    current_step: r.current_step,
    count: Number(r.count),
    top_signal: r.top_signal,
  }));
}

// ---------------------------------------------------------------------------
// Query 3: Most common user inputs causing failures
// ---------------------------------------------------------------------------

/**
 * Returns the most frequent user texts that triggered failure events.
 * Useful for identifying exact phrases the bot consistently fails to handle,
 * which can drive FAQ expansion or NL rule improvements.
 */
export async function getMostCommonUserInputsCausingFailure(
  range: AnalyticsTimeRange = {},
  limit = 20
): Promise<CommonInputSummary[]> {
  const since = buildSinceDate(range);

  type Row = { user_text: string; count: string; top_signal: string | null };

  const rows = await sequelize.query<Row>(
    `SELECT
       user_text,
       COUNT(*) AS count,
       (
         SELECT signal
         FROM conversation_failure_events AS inner_e
         WHERE inner_e.user_text = outer_e.user_text
           AND inner_e.created_at >= :since
           ${EXCLUDE_RESOLVED}
         GROUP BY signal
         ORDER BY COUNT(*) DESC
         LIMIT 1
       ) AS top_signal
     FROM conversation_failure_events AS outer_e
     WHERE created_at >= :since
       AND user_text IS NOT NULL
       AND TRIM(user_text) != ''
       ${EXCLUDE_RESOLVED}
     GROUP BY user_text
     ORDER BY count DESC
     LIMIT :limit`,
    { replacements: { since, limit }, type: QueryTypes.SELECT }
  );

  return rows.map((r) => ({
    user_text: r.user_text,
    count: Number(r.count),
    top_signal: r.top_signal,
  }));
}

// ---------------------------------------------------------------------------
// Query 4: Session-level risk summary
// ---------------------------------------------------------------------------

export type SessionRiskSummary = {
  total_sessions: number;
  sessions_in_safe_mode: number;
  sessions_critical: number;
  sessions_high: number;
  sessions_medium: number;
  sessions_low: number;
  avg_failure_score: number;
};

/**
 * Returns an aggregate risk snapshot across all active sessions.
 * Useful for real-time operations monitoring.
 */
export async function getSessionRiskSummary(): Promise<SessionRiskSummary> {
  type Row = {
    total_sessions: string;
    sessions_in_safe_mode: string;
    sessions_critical: string;
    sessions_high: string;
    sessions_medium: string;
    sessions_low: string;
    avg_failure_score: string;
  };

  const [row] = await sequelize.query<Row>(
    `SELECT
       COUNT(*) AS total_sessions,
       COUNT(*) FILTER (WHERE safe_mode = true) AS sessions_in_safe_mode,
       COUNT(*) FILTER (WHERE failure_score > 80) AS sessions_critical,
       COUNT(*) FILTER (WHERE failure_score > 50 AND failure_score <= 80) AS sessions_high,
       COUNT(*) FILTER (WHERE failure_score > 20 AND failure_score <= 50) AS sessions_medium,
       COUNT(*) FILTER (WHERE failure_score <= 20) AS sessions_low,
       ROUND(AVG(failure_score), 1) AS avg_failure_score
     FROM conversation_sessions
     WHERE status = 'active'`,
    { type: QueryTypes.SELECT }
  );

  return {
    total_sessions: Number(row?.total_sessions ?? 0),
    sessions_in_safe_mode: Number(row?.sessions_in_safe_mode ?? 0),
    sessions_critical: Number(row?.sessions_critical ?? 0),
    sessions_high: Number(row?.sessions_high ?? 0),
    sessions_medium: Number(row?.sessions_medium ?? 0),
    sessions_low: Number(row?.sessions_low ?? 0),
    avg_failure_score: Number(row?.avg_failure_score ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Query 5: FAQ hit rate
// ---------------------------------------------------------------------------

export type FaqHitSummary = {
  total_faq_hits: number;
  total_failures: number;
  faq_resolution_rate_pct: number;
};

/**
 * Compares FAQ hits (faq_resolved events) to actual failure events
 * to estimate how well the FAQ layer is deflecting failures.
 */
export async function getFaqHitRate(
  range: AnalyticsTimeRange = {}
): Promise<FaqHitSummary> {
  const since = buildSinceDate(range);

  type Row = { signal: string; count: string };

  const rows = await sequelize.query<Row>(
    `SELECT signal, COUNT(*) AS count
     FROM conversation_failure_events
     WHERE created_at >= :since
       AND signal IN ('faq_resolved', 'frustration_detected', 'user_repeated_input',
                      'bot_repeated_itself', 'step_mismatch', 'invalid_transition',
                      'context_loop', 'silent_outbound_failure')
     GROUP BY signal`,
    { replacements: { since }, type: QueryTypes.SELECT }
  );

  const countBySignal = Object.fromEntries(
    rows.map((r) => [r.signal, Number(r.count)])
  );

  const faqHits = countBySignal["faq_resolved"] ?? 0;
  const failures = Object.entries(countBySignal)
    .filter(([k]) => k !== "faq_resolved")
    .reduce((sum, [, v]) => sum + v, 0);

  const total = faqHits + failures;

  return {
    total_faq_hits: faqHits,
    total_failures: failures,
    faq_resolution_rate_pct:
      total > 0 ? Math.round((faqHits / total) * 100) : 0,
  };
}
