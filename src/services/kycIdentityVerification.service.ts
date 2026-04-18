import {
  createOpenAIMultimodalCompletion,
  isOpenAIConfigured,
} from "../lib/openai";
import type {
  KycDocumentAssessment,
  KycDocumentExtraction,
} from "./kyc.service";

type SupportedKycProvider = "internal" | "openai_vision" | "external_api";

type KycIdentityFile = {
  buffer: Buffer;
  mimeType: string;
  originalName?: string | null;
};

type ResolveSignalsInput = {
  sellerName: string;
  dpi: string;
  fotoFrente?: KycIdentityFile | null;
  fotoReverso?: KycIdentityFile | null;
  selfie?: KycIdentityFile | null;
};

export type KycIdentitySignals = {
  provider: string;
  providerStatus: "not_configured" | "pending_manual_review" | "verified" | "failed";
  extractedDocument: KycDocumentExtraction | null;
  documentAssessment: KycDocumentAssessment | null;
  faceMatch: boolean | null;
  faceMatchScore: number | null;
  diagnostics: string[];
};

const DEFAULT_KYC_PROVIDER = (
  process.env.KYC_IDENTITY_PROVIDER?.trim().toLowerCase()
  || (isOpenAIConfigured() ? "openai_vision" : "internal")
) as SupportedKycProvider;
const DEFAULT_VISION_MODEL = process.env.KYC_OPENAI_VISION_MODEL?.trim()
  || process.env.OPENAI_MODEL_VISION
  || "gpt-4.1-mini";
const DEFAULT_VISION_TIMEOUT_MS = Number(
  process.env.KYC_OPENAI_VISION_TIMEOUT_MS
  || process.env.OPENAI_TIMEOUT_MS_VISION
  || 12000
);

function isUsableImage(file?: KycIdentityFile | null): file is KycIdentityFile {
  return Boolean(file?.buffer?.length) && String(file?.mimeType ?? "").startsWith("image/");
}

function buildDataUrl(mimeType: string, buffer: Buffer): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function coerceNullableString(value: unknown, maxLength = 200): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, maxLength);
  return normalized || null;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const direct = trimmed.startsWith("{") ? trimmed : trimmed.slice(trimmed.indexOf("{"));
  const lastBrace = direct.lastIndexOf("}");
  const jsonCandidate = lastBrace >= 0 ? direct.slice(0, lastBrace + 1) : direct;
  return JSON.parse(jsonCandidate) as Record<string, unknown>;
}

async function resolveWithOpenAiVision(
  input: ResolveSignalsInput
): Promise<KycIdentitySignals> {
  const diagnostics: string[] = [];

  if (!isOpenAIConfigured()) {
    return {
      provider: "openai_vision",
      providerStatus: "not_configured",
      extractedDocument: null,
      documentAssessment: null,
      faceMatch: null,
      faceMatchScore: null,
      diagnostics: ["OPENAI_API_KEY is not configured"],
    };
  }

  const documentImages = [input.fotoFrente, input.fotoReverso]
    .filter(isUsableImage)
    .slice(0, 2)
    .map((file) => ({
      type: "image_url" as const,
      image_url: { url: buildDataUrl(file.mimeType, file.buffer) },
    }));

  if (documentImages.length === 0) {
    return {
      provider: "openai_vision",
      providerStatus: "failed",
      extractedDocument: null,
      documentAssessment: null,
      faceMatch: null,
      faceMatchScore: null,
      diagnostics: ["No usable DPI images were provided to the OCR provider"],
    };
  }

  try {
    const response = await createOpenAIMultimodalCompletion({
      model: DEFAULT_VISION_MODEL,
      timeoutMs: DEFAULT_VISION_TIMEOUT_MS,
      temperature: 0,
      maxTokens: 450,
      messages: [
        {
          role: "system",
          content: [
            {
              type: "text",
              text:
                "Eres un analista KYC para DPI de Guatemala. " +
                "Lee solo lo visible en las imágenes del DPI y responde JSON estricto con este esquema: " +
                "{\"frontLooksLikeId\":boolean|null,\"backLooksLikeId\":boolean|null,\"likelyDocumentType\":string|null,\"documentConfidence\":number|null,\"documentReason\":string|null,\"fullName\":string|null,\"dpi\":string|null,\"birthDate\":string|null,\"expiryDate\":string|null,\"confidence\":number|null}. " +
                "No inventes datos. Si no puedes leer un campo, usa null.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `Nombre declarado por el usuario: ${input.sellerName}\n` +
                `DPI declarado por el usuario: ${input.dpi}\n` +
                "Primero determina si las imágenes realmente parecen un documento oficial tipo DPI/cédula, no una selfie o una persona sosteniendo otro objeto. " +
                "Luego extrae el nombre completo y el número de DPI/CUI visibles en el documento.",
            },
            ...documentImages,
          ],
        },
      ],
    });

    const parsed = parseJsonObject(response.text);
    const extractedDocument: KycDocumentExtraction = {
      fullName: coerceNullableString(parsed.fullName, 160),
      dpi: coerceNullableString(parsed.dpi, 32),
      birthDate: coerceNullableString(parsed.birthDate, 32),
      expiryDate: coerceNullableString(parsed.expiryDate, 32),
      confidence:
        typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
          ? Math.max(0, Math.min(parsed.confidence, 1))
          : null,
    };
    const documentAssessment: KycDocumentAssessment = {
      frontLooksLikeId:
        typeof parsed.frontLooksLikeId === "boolean" ? parsed.frontLooksLikeId : null,
      backLooksLikeId:
        typeof parsed.backLooksLikeId === "boolean" ? parsed.backLooksLikeId : null,
      likelyDocumentType: coerceNullableString(parsed.likelyDocumentType, 80),
      confidence:
        typeof parsed.documentConfidence === "number" && Number.isFinite(parsed.documentConfidence)
          ? Math.max(0, Math.min(parsed.documentConfidence, 1))
          : null,
      reason: coerceNullableString(parsed.documentReason, 200),
    };

    diagnostics.push(`model=${response.model}`);
    diagnostics.push(
      `usage_prompt_tokens=${response.usage.promptTokens ?? "n/a"}`
    );

    return {
      provider: "openai_vision",
      providerStatus: "pending_manual_review",
      extractedDocument,
      documentAssessment,
      faceMatch: null,
      faceMatchScore: null,
      diagnostics,
    };
  } catch (error: any) {
    return {
      provider: "openai_vision",
      providerStatus: "failed",
      extractedDocument: null,
      documentAssessment: null,
      faceMatch: null,
      faceMatchScore: null,
      diagnostics: [error?.message ?? String(error)],
    };
  }
}

export async function resolveKycIdentitySignals(
  input: ResolveSignalsInput
): Promise<KycIdentitySignals> {
  if (DEFAULT_KYC_PROVIDER === "openai_vision") {
    return resolveWithOpenAiVision(input);
  }

  if (DEFAULT_KYC_PROVIDER === "external_api") {
    return {
      provider: "external_api",
      providerStatus: "not_configured",
      extractedDocument: null,
      documentAssessment: null,
      faceMatch: null,
      faceMatchScore: null,
      diagnostics: ["External KYC provider adapter is not implemented yet"],
    };
  }

  return {
    provider: "internal_consistency_v1",
    providerStatus: "pending_manual_review",
    extractedDocument: null,
    documentAssessment: null,
    faceMatch: null,
    faceMatchScore: null,
    diagnostics: ["Internal-only mode: OCR and face match are disabled"],
  };
}
