import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db";

export type FailurePattern = {
  current_step: string | null;
  input_text: string | null;
  failure_signal: string;
  count: number;
};

export type ConversationInsight = {
  type: "step_friction" | "input_confusion" | "signal_cluster";
  message: string;
  current_step: string | null;
  signal: string | null;
  count: number;
};

export type TrainingDataPair = {
  input: {
    current_step: string | null;
    expected_input_type: string | null;
    user_text: string | null;
    signal: string;
  };
  expected_output: {
    response_style: "clarify_and_guide";
    safety: "no_state_change";
    target: string;
  };
};

const FAILURE_ONLY = `
  signal NOT IN ('faq_resolved', 'ai_used', 'ai_rejected')
`;

export async function extractFailurePatterns(
  lastHours = 168,
  limit = 100
): Promise<FailurePattern[]> {
  type Row = {
    current_step: string | null;
    input_text: string | null;
    failure_signal: string;
    count: string;
  };

  const rows = await sequelize.query<Row>(
    `SELECT
       current_step,
       user_text AS input_text,
       signal AS failure_signal,
       COUNT(*) AS count
     FROM conversation_failure_events
     WHERE created_at >= NOW() - (:lastHours * INTERVAL '1 hour')
       AND ${FAILURE_ONLY}
     GROUP BY current_step, user_text, signal
     ORDER BY count DESC
     LIMIT :limit`,
    { replacements: { lastHours, limit }, type: QueryTypes.SELECT }
  );

  return rows.map((row) => ({
    current_step: row.current_step,
    input_text: row.input_text,
    failure_signal: row.failure_signal,
    count: Number(row.count),
  }));
}

export async function generateInsights(
  lastHours = 168
): Promise<ConversationInsight[]> {
  const patterns = await extractFailurePatterns(lastHours, 50);
  const insights: ConversationInsight[] = [];

  for (const pattern of patterns.slice(0, 20)) {
    if (pattern.current_step === "awaiting_price") {
      insights.push({
        type: "step_friction",
        message: "Users often fail at price step; simplify price examples.",
        current_step: pattern.current_step,
        signal: pattern.failure_signal,
        count: pattern.count,
      });
      continue;
    }

    if (pattern.current_step === "awaiting_category") {
      insights.push({
        type: "step_friction",
        message: "Users appear confused by category naming; add clearer category examples.",
        current_step: pattern.current_step,
        signal: pattern.failure_signal,
        count: pattern.count,
      });
      continue;
    }

    if (pattern.failure_signal === "frustration_detected") {
      insights.push({
        type: "signal_cluster",
        message: "Frustration clusters around this step/input; consider earlier guided options.",
        current_step: pattern.current_step,
        signal: pattern.failure_signal,
        count: pattern.count,
      });
      continue;
    }

    if (pattern.input_text) {
      insights.push({
        type: "input_confusion",
        message: "Repeated user input caused failures; consider FAQ or command matcher expansion.",
        current_step: pattern.current_step,
        signal: pattern.failure_signal,
        count: pattern.count,
      });
    }
  }

  return insights;
}

export async function prepareTrainingData(
  lastHours = 168,
  limit = 200
): Promise<TrainingDataPair[]> {
  type Row = {
    current_step: string | null;
    expected_input_type: string | null;
    user_text: string | null;
    signal: string;
  };

  const rows = await sequelize.query<Row>(
    `SELECT current_step, expected_input_type, user_text, signal
     FROM conversation_failure_events
     WHERE created_at >= NOW() - (:lastHours * INTERVAL '1 hour')
       AND user_text IS NOT NULL
       AND TRIM(user_text) != ''
       AND ${FAILURE_ONLY}
     ORDER BY created_at DESC
     LIMIT :limit`,
    { replacements: { lastHours, limit }, type: QueryTypes.SELECT }
  );

  return rows.map((row) => ({
    input: {
      current_step: row.current_step,
      expected_input_type: row.expected_input_type,
      user_text: row.user_text,
      signal: row.signal,
    },
    expected_output: {
      response_style: "clarify_and_guide",
      safety: "no_state_change",
      target: row.expected_input_type
        ? `Guide user to provide ${row.expected_input_type}`
        : "Guide user back to available options",
    },
  }));
}

export async function prepareTrainingPairs(
  lastHours = 168,
  limit = 200
): Promise<TrainingDataPair[]> {
  return prepareTrainingData(lastHours, limit);
}
