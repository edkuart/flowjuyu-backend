/**
 * Runway ML provider — image-to-video vía Runway API v1.
 *
 * Modelos soportados:
 *   gen3a_turbo  → Runway Gen-3 Alpha Turbo (5-10s, rápido)
 *   gen-3        → Runway Gen-3 Alpha (máxima calidad)
 *
 * Variable de entorno requerida: RUNWAY_API_KEY
 * NUNCA exponer esta key al frontend.
 *
 * Docs: https://docs.dev.runwayml.com/
 */

import type { VideoProvider, GenerateInput, GenerateResult, JobStatus, VideoFormat } from "./types";

const RUNWAY_BASE = "https://api.dev.runwayml.com/v1";
const RUNWAY_VERSION = "2024-11-06";

const SUPPORTED_MODELS = new Set(["gen3a_turbo", "gen-3"]);

// Centavos USD estimados por generación (independiente de duración — Runway cobra por "run")
const COST_CENTS_PER_RUN: Record<string, number> = {
  "gen3a_turbo": 20,   // ~$0.20
  "gen-3": 35,         // ~$0.35
};

function getApiKey(): string {
  const key = process.env.RUNWAY_API_KEY;
  if (!key) throw new Error("RUNWAY_API_KEY no configurada en el entorno del servidor");
  return key;
}

function runwayHeaders(): Record<string, string> {
  return {
    "Authorization": `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
    "X-Runway-Version": RUNWAY_VERSION,
  };
}

function mapRatio(format: VideoFormat): "1280:720" | "720:1280" | "1080:1080" {
  const map: Record<VideoFormat, "1280:720" | "720:1280" | "1080:1080"> = {
    "16:9": "1280:720",
    "9:16": "720:1280",
    "1:1": "1080:1080",
  };
  return map[format] ?? "720:1280";
}

interface RunwayTaskResponse {
  id: string;
  status: string;
  error?: string;
}

interface RunwayStatusResponse {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  output?: string[];
  error?: string;
  failure?: string;
}

export class RunwayProvider implements VideoProvider {
  readonly name = "runway" as const;
  readonly defaultModel = "gen3a_turbo";

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const model = input.model ?? this.defaultModel;
    if (!SUPPORTED_MODELS.has(model)) {
      throw new Error(`Modelo Runway no soportado: ${model}`);
    }

    const imageUrl = input.imageUrls[0];
    if (!imageUrl) throw new Error("Runway requiere al menos una imagen del producto");

    const body: Record<string, unknown> = {
      promptImage: imageUrl,
      promptText: input.prompt,
      model,
      ratio: mapRatio(input.format),
      duration: Math.min(input.durationSeconds, 10) <= 5 ? 5 : 10,
    };

    const res = await fetch(`${RUNWAY_BASE}/image_to_video`, {
      method: "POST",
      headers: runwayHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Runway error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as RunwayTaskResponse;
    const estimatedCostCents = this.estimateCostCents(input.durationSeconds);

    return { jobId: data.id, status: "queued", estimatedCostCents };
  }

  async getStatus(jobId: string): Promise<JobStatus> {
    const res = await fetch(`${RUNWAY_BASE}/tasks/${jobId}`, {
      headers: runwayHeaders(),
    });

    if (!res.ok) return { status: "failed", errorCode: `HTTP_${res.status}` };

    const data = (await res.json()) as RunwayStatusResponse;

    switch (data.status) {
      case "PENDING": return { status: "queued" };
      case "RUNNING": return { status: "generating" };
      case "SUCCEEDED": {
        const outputUrl = data.output?.[0] ?? null;
        return {
          status: "completed",
          outputUrl,
          previewUrl: outputUrl,
          actualCostCents: COST_CENTS_PER_RUN[this.defaultModel] ?? 20,
        };
      }
      case "FAILED":
      case "CANCELLED":
        return {
          status: data.status === "CANCELLED" ? "cancelled" : "failed",
          errorCode: "RUNWAY_FAILED",
          errorMessage: data.failure ?? data.error ?? "El proveedor reportó un error",
        };
      default:
        return { status: "generating" };
    }
  }

  estimateCostCents(durationSeconds: number): number {
    // Runway cobra por run, no por segundo
    const model = this.defaultModel;
    return COST_CENTS_PER_RUN[model] ?? 20;
  }
}
