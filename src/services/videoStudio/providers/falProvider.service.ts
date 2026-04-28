/**
 * fal.ai provider — image-to-video vía fal Queue API.
 *
 * Modelos soportados:
 *   fal-ai/luma-dream-machine   → luma-dream-machine
 *   fal-ai/kling-video/v1/standard/image-to-video → kling-video
 *
 * Variable de entorno requerida: FAL_API_KEY
 * NUNCA exponer esta key al frontend.
 *
 * Docs: https://fal.ai/docs/queue
 */

import type { VideoProvider, GenerateInput, GenerateResult, JobStatus, VideoFormat } from "./types";

const FAL_BASE = "https://queue.fal.run";

const MODEL_ENDPOINTS: Record<string, string> = {
  "luma-dream-machine": "fal-ai/luma-dream-machine",
  "kling-video": "fal-ai/kling-video/v1/standard/image-to-video",
};

// Costo estimado en centavos USD por segundo de video
const COST_CENTS_PER_SECOND: Record<string, number> = {
  "luma-dream-machine": 0.5,   // ~$0.05 / 10s
  "kling-video": 0.2,          // ~$0.02 / 10s
};

function getApiKey(): string {
  const key = process.env.FAL_KEY ?? process.env.FAL_API_KEY;
  if (!key) throw new Error("FAL_KEY no configurada en el entorno del servidor");
  return key;
}

function logFal(msg: string, data?: unknown) {
  const prefix = "[fal.ai]";
  if (data !== undefined) console.log(prefix, msg, JSON.stringify(data));
  else console.log(prefix, msg);
}

function falHeaders(): Record<string, string> {
  return {
    "Authorization": `Key ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

function mapAspectRatio(format: VideoFormat): string {
  const map: Record<VideoFormat, string> = {
    "9:16": "9:16",
    "1:1": "1:1",
    "16:9": "16:9",
  };
  return map[format] ?? "9:16";
}

function buildFalInput(input: GenerateInput, model: string): Record<string, unknown> {
  const imageUrl = input.imageUrls[0];
  const base = {
    prompt: input.prompt,
    aspect_ratio: mapAspectRatio(input.format),
  };

  if (model === "luma-dream-machine") {
    return imageUrl
      ? { ...base, image_url: imageUrl, loop: false }
      : { ...base };
  }

  if (model === "kling-video") {
    return imageUrl
      ? { ...base, image_url: imageUrl, duration: Math.min(input.durationSeconds, 10) }
      : { ...base, duration: Math.min(input.durationSeconds, 10) };
  }

  return { ...base, image_url: imageUrl };
}

interface FalQueueResponse {
  request_id: string;
  status: string;
  status_url?: string;
  response_url?: string;
  cancel_url?: string;
}

interface FalStatusResponse {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  logs?: unknown[];
  error?: string;
}

interface FalResultResponse {
  video?: { url: string };
  error?: string;
}

export class FalProvider implements VideoProvider {
  readonly name = "fal" as const;
  readonly defaultModel = "luma-dream-machine";

  private endpoint(model: string): string {
    const ep = MODEL_ENDPOINTS[model];
    if (!ep) throw new Error(`Modelo fal no soportado: ${model}`);
    return `${FAL_BASE}/${ep}`;
  }

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const model = input.model ?? this.defaultModel;
    const body = buildFalInput(input, model);
    const url = this.endpoint(model);
    const key = getApiKey();

    logFal(`generate() → POST ${url}`);
    logFal(`  model=${model}  key=${key.slice(0, 8)}...${key.slice(-4)}  imageUrls=${input.imageUrls.length}`);
    logFal(`  body=`, body);

    const res = await fetch(url, {
      method: "POST",
      headers: falHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logFal(`  ERROR ${res.status}: ${text}`);
      throw new Error(`fal.ai error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as FalQueueResponse;
    logFal(`  queued OK → request_id=${data.request_id}  status=${data.status}`);

    const estimatedCostCents = this.estimateCostCents(input.durationSeconds);

    // Prefix model so getStatus() knows which endpoint to poll
    return { jobId: `${model}|${data.request_id}`, status: "queued", estimatedCostCents };
  }

  async getStatus(jobId: string): Promise<JobStatus> {
    // jobId format: "{model}|{request_id}" para saber qué endpoint consultar
    const [modelKey, requestId] = jobId.includes("|")
      ? jobId.split("|", 2)
      : ["luma-dream-machine", jobId];

    const endpoint = this.endpoint(modelKey);
    const statusUrl = `${endpoint}/requests/${requestId}/status`;

    logFal(`getStatus(${jobId}) → GET ${statusUrl}`);

    const statusRes = await fetch(statusUrl, { headers: falHeaders() });
    if (!statusRes.ok) {
      logFal(`  status HTTP ${statusRes.status}`);
      return { status: "failed", errorCode: `HTTP_${statusRes.status}` };
    }

    const statusData = (await statusRes.json()) as FalStatusResponse;
    logFal(`  fal status=${statusData.status}`);

    if (statusData.status === "IN_QUEUE") return { status: "queued" };
    if (statusData.status === "IN_PROGRESS") return { status: "generating" };

    if (statusData.status === "FAILED") {
      logFal(`  FAILED: ${statusData.error}`);
      return {
        status: "failed",
        errorCode: "FAL_FAILED",
        errorMessage: typeof statusData.error === "string" ? statusData.error : "El proveedor reportó un error",
      };
    }

    if (statusData.status === "COMPLETED") {
      const resultUrl = `${endpoint}/requests/${requestId}`;
      logFal(`  COMPLETED → fetching result from ${resultUrl}`);
      const resultRes = await fetch(resultUrl, { headers: falHeaders() });
      if (!resultRes.ok) {
        logFal(`  result fetch HTTP ${resultRes.status}`);
        return { status: "processing_output" };
      }

      const result = (await resultRes.json()) as FalResultResponse;
      logFal(`  video_url=${result.video?.url ?? "null"}`);
      return {
        status: "completed",
        outputUrl: result.video?.url ?? null,
        previewUrl: result.video?.url ?? null,
        actualCostCents: this.estimateCostCents(10),
      };
    }

    logFal(`  unhandled fal status=${statusData.status}`);
    return { status: "generating" };
  }

  estimateCostCents(durationSeconds: number): number {
    return Math.round((COST_CENTS_PER_SECOND["luma-dream-machine"] ?? 0.5) * durationSeconds);
  }
}
