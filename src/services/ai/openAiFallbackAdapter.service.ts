import { logger } from "../../config/logger";
import {
  createOpenAITextCompletion,
  isOpenAIConfigured,
} from "../../lib/openai";
import type {
  AiFallbackAdapter,
  AiFallbackContext,
  AiFallbackResponse,
} from "./aiFallback.interface";

function parseJsonResponse(rawText: string): AiFallbackResponse {
  const trimmed = rawText.trim();
  const jsonText = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim()
    : trimmed;

  const parsed = JSON.parse(jsonText) as Partial<AiFallbackResponse>;
  return {
    text: String(parsed.text ?? "").trim(),
    confidence: Number(parsed.confidence ?? 0),
    intent: typeof parsed.intent === "string" ? parsed.intent : "unknown",
    notes: Array.isArray(parsed.notes)
      ? parsed.notes.filter((note): note is string => typeof note === "string").slice(0, 5)
      : undefined,
  };
}

export class OpenAiFallbackAdapter implements AiFallbackAdapter {
  isAvailable(): boolean {
    return process.env.CONVERSATION_AI_ENABLED === "true" && isOpenAIConfigured();
  }

  async generateResponse(
    context: AiFallbackContext
  ): Promise<AiFallbackResponse> {
    if (!this.isAvailable()) {
      return {
        text: "",
        confidence: 0,
        metadata: { reason: "openai_not_configured" },
      };
    }

    const startedAt = Date.now();

    try {
      const completion = await createOpenAITextCompletion({
        model: process.env.CONVERSATION_AI_MODEL || process.env.OPENAI_MODEL_TEXT,
        temperature: 0.2,
        maxTokens: 180,
        messages: [
          {
            role: "system",
            content:
              context.systemPrompt ??
              "You return only compact valid JSON. You never execute actions or claim state changes.",
          },
          {
            role: "user",
            content: context.userPrompt ?? context.prompt ?? JSON.stringify(context),
          },
        ],
      });

      const parsed = parseJsonResponse(completion.text);

      return {
        ...parsed,
        metadata: {
          model: completion.model,
          durationMs: Date.now() - startedAt,
        },
      };
    } catch (error: any) {
      logger.info(
        {
          session_id: context.session.id,
          error: error?.message ?? String(error),
          duration_ms: Date.now() - startedAt,
        },
        "[conversation][ai.fallback]"
      );

      return {
        text: "",
        confidence: 0,
        metadata: {
          reason: error?.message ?? "openai_fallback_error",
          durationMs: Date.now() - startedAt,
        },
      };
    }
  }
}

export const openAiFallbackAdapter = new OpenAiFallbackAdapter();
