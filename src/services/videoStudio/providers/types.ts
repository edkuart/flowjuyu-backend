// Contrato único que todos los providers de video deben cumplir.
// Agregar un provider nuevo = implementar esta interfaz.

export type SupportedProvider = "mock" | "fal" | "runway";
export type VideoFormat = "9:16" | "1:1" | "16:9";

export type GenerationStatus =
  | "queued"
  | "validating"
  | "generating"
  | "processing_output"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

// ─── Input ────────────────────────────────────────────────────────────────────

export interface GenerateInput {
  prompt: string;
  imageUrls: string[];       // source_url de video_assets ordenados por sort_order
  format: VideoFormat;
  durationSeconds: number;
  stylePreset?: string;
  model?: string;
}

// ─── Resultados ───────────────────────────────────────────────────────────────

export interface GenerateResult {
  jobId: string;             // ID asignado por el proveedor; guardado en provider_job_id
  status: "queued" | "generating";
  estimatedCostCents: number;
}

export interface JobStatus {
  status: GenerationStatus;
  outputUrl?: string | null;
  previewUrl?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  actualCostCents?: number;
}

// ─── Interfaz del provider ────────────────────────────────────────────────────

export interface VideoProvider {
  readonly name: SupportedProvider;
  readonly defaultModel: string;

  /**
   * Envía el job al proveedor. Devuelve jobId inmediatamente (async job).
   * El status se consulta después vía getStatus().
   */
  generate(input: GenerateInput): Promise<GenerateResult>;

  /**
   * Consulta el estado actual de un job ya enviado.
   * Se llama en cada tick del polling (frontend → backend → proveedor).
   */
  getStatus(jobId: string): Promise<JobStatus>;

  /**
   * Estimación de costo en centavos USD sin llamar APIs externas.
   * Usada para mostrar al seller antes de confirmar.
   */
  estimateCostCents(durationSeconds: number): number;
}

// ─── Configuración de modelos disponibles ────────────────────────────────────

export interface ProviderModelConfig {
  provider: SupportedProvider;
  model: string;
  label: string;
  badge?: "recommended" | "cheapest" | "premium" | "experimental";
  costCentsMin: number;      // estimación mínima por video de 10s
  costCentsMax: number;      // estimación máxima por video de 10s
  estimatedSeconds: number;  // tiempo de generación estimado en segundos
  supportsI2V: boolean;      // image-to-video
  qualityScore: number;      // 1-5 para UI
}

export const PROVIDER_MODELS: ProviderModelConfig[] = [
  {
    provider: "mock",
    model: "default",
    label: "Simulación (sin costo)",
    badge: undefined,
    costCentsMin: 0,
    costCentsMax: 0,
    estimatedSeconds: 13,
    supportsI2V: false,
    qualityScore: 1,
  },
  {
    provider: "fal",
    model: "luma-dream-machine",
    label: "Luma Dream Machine",
    badge: "recommended",
    costCentsMin: 2,
    costCentsMax: 5,
    estimatedSeconds: 90,
    supportsI2V: true,
    qualityScore: 4,
  },
  {
    provider: "fal",
    model: "kling-video",
    label: "Kling 1.6",
    badge: "cheapest",
    costCentsMin: 1,
    costCentsMax: 3,
    estimatedSeconds: 120,
    supportsI2V: true,
    qualityScore: 3,
  },
  {
    provider: "runway",
    model: "gen3a_turbo",
    label: "Runway Gen-3 Turbo",
    badge: "premium",
    costCentsMin: 15,
    costCentsMax: 30,
    estimatedSeconds: 60,
    supportsI2V: true,
    qualityScore: 5,
  },
];

// Whitelist de (provider, model) permitidos — seguridad contra inputs arbitrarios
export const ALLOWED_COMBINATIONS = new Set(
  PROVIDER_MODELS.map((m) => `${m.provider}:${m.model}`)
);

export function isAllowedCombination(provider: string, model: string): boolean {
  return ALLOWED_COMBINATIONS.has(`${provider}:${model}`);
}
