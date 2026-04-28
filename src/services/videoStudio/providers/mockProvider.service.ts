import type { VideoProvider, GenerateInput, GenerateResult, JobStatus } from "./types";
import { sequelize } from "../../../config/db";

const PROGRESSION: Array<{ status: string; delayMs: number }> = [
  { status: "validating",        delayMs: 1_500 },
  { status: "generating",        delayMs: 6_000 },
  { status: "processing_output", delayMs: 4_000 },
  { status: "completed",         delayMs: 2_000 },
];

// Mapa en memoria para soportar getStatus() en el mock
const _jobs = new Map<string, { status: string; outputUrl: string | null }>();

async function advanceJob(jobId: string, imageUrl: string | null): Promise<void> {
  for (const step of PROGRESSION) {
    await new Promise<void>((r) => setTimeout(r, step.delayMs));
    const outputUrl = step.status === "completed" ? imageUrl : null;
    _jobs.set(jobId, { status: step.status, outputUrl });

    // Actualizar DB directamente (mock no usa webhook ni polling externo)
    const sets: string[] = ["status = :status"];
    const replacements: Record<string, unknown> = { jobId, status: step.status };
    if (step.status === "generating") sets.push("started_at = NOW()");
    if (step.status === "completed") {
      sets.push("completed_at = NOW()", "output_url = :url", "preview_url = :url", "cost_actual_cents = 0");
      replacements.url = outputUrl;
    }
    await sequelize
      .query(`UPDATE video_generations SET ${sets.join(", ")} WHERE provider_job_id = :jobId`, { replacements })
      .catch(() => {});
  }
  _jobs.delete(jobId);
}

export class MockProvider implements VideoProvider {
  readonly name = "mock" as const;
  readonly defaultModel = "default";

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const jobId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    _jobs.set(jobId, { status: "queued", outputUrl: null });
    // Fire-and-forget — no bloquea la respuesta HTTP
    setImmediate(() => advanceJob(jobId, input.imageUrls[0] ?? null).catch(() => {}));
    return { jobId, status: "queued", estimatedCostCents: 0 };
  }

  async getStatus(jobId: string): Promise<JobStatus> {
    const job = _jobs.get(jobId);
    if (!job) return { status: "completed" };
    return { status: job.status as any, outputUrl: job.outputUrl, previewUrl: job.outputUrl };
  }

  estimateCostCents(_durationSeconds: number): number {
    return 0;
  }
}
