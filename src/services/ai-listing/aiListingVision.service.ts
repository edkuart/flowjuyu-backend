import type ListingDraft from "../../models/ListingDraft.model";
import {
  createOpenAIMultimodalCompletion,
  isOpenAIConfigured,
} from "../../lib/openai";
import { downloadMediaBuffer } from "../integrations/whatsapp/whatsappMedia.service";
import {
  getDraftImages,
  type VisionSuggestion,
} from "../listing-drafts/listingDraft.service";
import {
  resolveProductCategoryFromText,
  resolveProductClassFromText,
} from "../listing-drafts/productCatalog.service";
import { buildVisionPrompt } from "./aiListingVisionPromptBuilder.service";
import { parseVisionSuggestion } from "./aiListingVisionParser.service";

type VisionAnalysisResult = {
  suggestion: VisionSuggestion | null;
  metadata: {
    provider: "openai" | "fallback";
    model: string | null;
    durationMs: number;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    usedFallback: boolean;
    error: string | null;
  };
  promptPreview: string;
};

const MAX_IMAGES_PER_ANALYSIS = 2;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DEFAULT_VISION_MODEL = process.env.OPENAI_MODEL_VISION || "gpt-4.1-mini";
const DEFAULT_VISION_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS_VISION || 12000);

function buildDataUrl(mimeType: string, buffer: Buffer): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function isUsableImageMimeType(mimeType: string | null | undefined): boolean {
  const normalized = String(mimeType ?? "").toLowerCase();
  return normalized.startsWith("image/");
}

function sanitizeVisionSuggestion(input: VisionSuggestion): VisionSuggestion {
  const clean = (value: string | undefined): string | undefined => {
    const next = String(value ?? "")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);
    return next || undefined;
  };

  return {
    probableProductType: clean(input.probableProductType),
    suggestedCategoryName: clean(input.suggestedCategoryName),
    suggestedClassName: clean(input.suggestedClassName),
    visibleAttributes: (input.visibleAttributes ?? []).map(clean).filter(Boolean) as string[],
    confidence:
      input.confidence != null && Number.isFinite(input.confidence)
        ? Math.max(0, Math.min(input.confidence, 1))
        : undefined,
    notes: (input.notes ?? []).map(clean).filter(Boolean) as string[],
    mappedCategoryId: input.mappedCategoryId ?? null,
    mappedCategoryName: clean(input.mappedCategoryName ?? undefined) ?? null,
    mappedClassId: input.mappedClassId ?? null,
    mappedClassName: clean(input.mappedClassName ?? undefined) ?? null,
  };
}

async function mapVisionSuggestion(
  suggestion: VisionSuggestion
): Promise<VisionSuggestion> {
  const category = suggestion.suggestedCategoryName
    ? await resolveProductCategoryFromText(suggestion.suggestedCategoryName).catch(() => null)
    : null;
  const productClass = suggestion.suggestedClassName
    ? await resolveProductClassFromText(suggestion.suggestedClassName).catch(() => null)
    : null;

  return sanitizeVisionSuggestion({
    ...suggestion,
    mappedCategoryId: category?.id ?? null,
    mappedCategoryName: category?.nombre ?? null,
    mappedClassId: productClass?.id ?? null,
    mappedClassName: productClass?.nombre ?? null,
  });
}

export async function analyzeListingImages(
  draft: ListingDraft
): Promise<VisionAnalysisResult> {
  const prompt = buildVisionPrompt(draft);
  const promptPreview = `${prompt.systemPrompt}\n\n---\n\n${prompt.userPrompt}`;
  const startedAt = Date.now();

  if (!isOpenAIConfigured()) {
    return {
      suggestion: null,
      metadata: {
        provider: "fallback",
        model: null,
        durationMs: Date.now() - startedAt,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        usedFallback: true,
        error: "OPENAI_API_KEY is not configured",
      },
      promptPreview,
    };
  }

  try {
    const draftImages = getDraftImages(draft)
      .filter((image) => image.mediaId && isUsableImageMimeType(image.mimeType))
      .slice(0, MAX_IMAGES_PER_ANALYSIS);

    if (draftImages.length === 0) {
      return {
        suggestion: null,
        metadata: {
          provider: "fallback",
          model: null,
          durationMs: Date.now() - startedAt,
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          usedFallback: true,
          error: "No usable images for vision analysis",
        },
        promptPreview,
      };
    }

    const imageParts: Array<{ type: "image_url"; image_url: { url: string } }> = [];

    for (const image of draftImages) {
      const media = await downloadMediaBuffer(image.mediaId);
      if (media.buffer.length > MAX_IMAGE_BYTES) {
        continue;
      }

      imageParts.push({
        type: "image_url",
        image_url: {
          url: buildDataUrl(media.mimeType, media.buffer),
        },
      });
    }

    if (imageParts.length === 0) {
      return {
        suggestion: null,
        metadata: {
          provider: "fallback",
          model: null,
          durationMs: Date.now() - startedAt,
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          usedFallback: true,
          error: "No images passed size validation for vision analysis",
        },
        promptPreview,
      };
    }

    const response = await createOpenAIMultimodalCompletion({
      model: DEFAULT_VISION_MODEL,
      timeoutMs: DEFAULT_VISION_TIMEOUT_MS,
      temperature: 0.1,
      maxTokens: 500,
      messages: [
        {
          role: "system",
          content: [{ type: "text", text: prompt.systemPrompt }],
        },
        {
          role: "user",
          content: [{ type: "text", text: prompt.userPrompt }, ...imageParts],
        },
      ],
    });

    const parsed = parseVisionSuggestion(response.text);
    const mapped = await mapVisionSuggestion(parsed);

    return {
      suggestion: mapped,
      metadata: {
        provider: "openai",
        model: response.model,
        durationMs: Date.now() - startedAt,
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
        usedFallback: false,
        error: null,
      },
      promptPreview,
    };
  } catch (error: any) {
    return {
      suggestion: null,
      metadata: {
        provider: "fallback",
        model: DEFAULT_VISION_MODEL,
        durationMs: Date.now() - startedAt,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        usedFallback: true,
        error: error?.message ?? String(error),
      },
      promptPreview,
    };
  }
}
