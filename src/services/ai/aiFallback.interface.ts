/**
 * aiFallback.interface.ts
 *
 * Clean interface contract for an AI-powered fallback response generator.
 *
 * STATUS: INTERFACE ONLY — no model calls are made anywhere in this file.
 *
 * PURPOSE:
 *   Define the shape that any future AI adapter must implement, so the
 *   orchestrator can call it without knowing which model backs it.
 *   This decouples the conversation flow from the AI provider entirely.
 *
 * WHEN TO WIRE A REAL ADAPTER:
 *   1. Create a class that implements AiFallbackAdapter
 *      (e.g., ClaudeAiFallbackAdapter, OpenAiAiFallbackAdapter)
 *   2. Register it via setActiveFallbackAdapter(adapter)
 *   3. The orchestrator will start using it automatically at CRITICAL risk level
 *
 * CURRENT BEHAVIOR:
 *   NoopAiFallbackAdapter is active. It always returns confidence=0 and an
 *   empty text, so the orchestrator falls back to rule-based recovery.
 */

import { openAiFallbackAdapter } from "./openAiFallbackAdapter.service";
import type { FailureSignal } from "../conversations/conversationFailureDetector.service";
import type { ConversationMemorySnapshot } from "../conversations/conversationMemory.service";

// ---------------------------------------------------------------------------
// Input context passed to the AI adapter
// ---------------------------------------------------------------------------

export type AiFallbackContext = {
  /** Session metadata needed for contextualisation. */
  session: {
    id: string;
    current_step: string;
    expected_input_type: string | null;
    failure_score: number;
    frustration_score: number;
    safe_mode: boolean;
  };

  /** Short-term memory snapshot from conversationMemory.service. */
  memory: ConversationMemorySnapshot;

  /** The current user input (normalized text). */
  currentUserText: string;

  /** Failure signals detected for this turn. */
  failureSignals: FailureSignal[];

  /** Full prompt prepared by the conversation AI builder. */
  prompt?: string;
  systemPrompt?: string;
  userPrompt?: string;

  /**
   * The risk level at the moment of the call.
   * Adapters can use this to adjust tone (CRITICAL → simpler, calmer language).
   */
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

// ---------------------------------------------------------------------------
// Output returned by the AI adapter
// ---------------------------------------------------------------------------

export type AiFallbackResponse = {
  /** The reply text to send to the user. Empty string = adapter declined. */
  text: string;

  /**
   * Confidence score 0–1.
   * < 0.5 → orchestrator should prefer rule-based recovery over this response.
   * >= 0.5 → orchestrator may use this response directly.
   */
  confidence: number;

  /**
   * Non-executable interpretation of the user's need.
   * This must never be used to route commands or mutate state.
   */
  intent?: string;
  notes?: string[];

  metadata?: {
    /** Model identifier used (e.g. "claude-sonnet-4-6", "gpt-4o"). */
    model?: string;
    /** Why this response was generated or declined. */
    reason?: string;
    /** Latency in ms. */
    durationMs?: number;
  };
};

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface AiFallbackAdapter {
  /**
   * Generate a response for a user who is in a failed/confused state.
   * Must never throw — return confidence=0 and empty text on any error.
   */
  generateResponse(context: AiFallbackContext): Promise<AiFallbackResponse>;

  /**
   * Returns true if the adapter is configured and ready.
   * The orchestrator checks this before calling generateResponse.
   */
  isAvailable(): boolean;
}

// ---------------------------------------------------------------------------
// Noop adapter (default — safe, no external calls)
// ---------------------------------------------------------------------------

/**
 * Default adapter. Always declines with confidence=0.
 * Swap this out when an AI provider is ready.
 */
export class NoopAiFallbackAdapter implements AiFallbackAdapter {
  async generateResponse(
    _context: AiFallbackContext
  ): Promise<AiFallbackResponse> {
    return {
      text: "",
      confidence: 0,
      metadata: { reason: "ai_fallback_not_configured" },
    };
  }

  isAvailable(): boolean {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Adapter registry
// ---------------------------------------------------------------------------

let activeAdapter: AiFallbackAdapter | null = null;
const noopAdapter = new NoopAiFallbackAdapter();

/**
 * Register the active AI fallback adapter.
 * Call once at app startup when a real adapter is available.
 *
 * Example:
 *   setActiveFallbackAdapter(new ClaudeAiFallbackAdapter({ apiKey, model }));
 */
export function setActiveFallbackAdapter(adapter: AiFallbackAdapter): void {
  activeAdapter = adapter;
}

/**
 * Returns the currently active adapter.
 * The orchestrator calls this to get a reference to whatever adapter is live.
 */
export function getActiveFallbackAdapter(): AiFallbackAdapter {
  if (activeAdapter) return activeAdapter;
  return openAiFallbackAdapter.isAvailable() ? openAiFallbackAdapter : noopAdapter;
}
