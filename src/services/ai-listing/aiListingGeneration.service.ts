import type ListingDraft from "../../models/ListingDraft.model";
import { isOpenAIConfigured } from "../../lib/openai";
import { requestAiListingContent } from "./aiListingClient.service";
import { buildFallbackListingContent } from "./aiListingFallback.service";
import { buildListingPrompt } from "./aiListingPromptBuilder.service";

type GenerationReason = "preview" | "regenerate";

export type ListingGenerationMetadata = {
  provider: "openai" | "fallback";
  model: string | null;
  durationMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  error: string | null;
  usedFallback: boolean;
};

export type ListingGenerationResult = {
  title: string;
  description: string;
  metadata: ListingGenerationMetadata;
  promptPreview: string;
};

const MAX_TITLE_LENGTH = 140;
const MAX_DESCRIPTION_LENGTH = 1200;

function cleanGeneratedText(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, maxLength);
}

export async function generateListingContent(
  draft: ListingDraft,
  options: { reason: GenerationReason }
): Promise<ListingGenerationResult> {
  const prompt = await buildListingPrompt(draft, options);
  const promptPreview = `${prompt.systemPrompt}\n\n---\n\n${prompt.userPrompt}`;
  const startedAt = Date.now();

  if (!isOpenAIConfigured()) {
    const fallback = buildFallbackListingContent(draft);
    return {
      ...fallback,
      metadata: {
        provider: "fallback",
        model: null,
        durationMs: Date.now() - startedAt,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        error: "OPENAI_API_KEY is not configured",
        usedFallback: true,
      },
      promptPreview,
    };
  }

  try {
    const result = await requestAiListingContent(prompt);

    return {
      title: cleanGeneratedText(result.title, MAX_TITLE_LENGTH),
      description: cleanGeneratedText(result.description, MAX_DESCRIPTION_LENGTH),
      metadata: {
        provider: "openai",
        model: result.model,
        durationMs: Date.now() - startedAt,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        error: null,
        usedFallback: false,
      },
      promptPreview,
    };
  } catch (error: any) {
    const fallback = buildFallbackListingContent(draft);

    return {
      ...fallback,
      metadata: {
        provider: "fallback",
        model: process.env.OPENAI_MODEL_TEXT || "gpt-4.1-mini",
        durationMs: Date.now() - startedAt,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        error: error?.message ?? String(error),
        usedFallback: true,
      },
      promptPreview,
    };
  }
}
