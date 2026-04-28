/**
 * Provider factory para Video Studio.
 *
 * Uso:
 *   const provider = getVideoProvider("fal");
 *   const result = await provider.generate(input);
 *
 * Agregar un provider nuevo:
 *   1. Crear MyProvider implements VideoProvider en ./myProvider.service.ts
 *   2. Agregar al mapa _providers abajo
 *   3. Agregar modelos a PROVIDER_MODELS en types.ts
 */

import type { VideoProvider, SupportedProvider } from "./types";
import { isAllowedCombination, PROVIDER_MODELS } from "./types";
import { MockProvider }   from "./mockProvider.service";
import { FalProvider }    from "./falProvider.service";
import { RunwayProvider } from "./runwayProvider.service";

// Singleton por provider — no recrear en cada request
const _providers: Record<SupportedProvider, VideoProvider> = {
  mock:   new MockProvider(),
  fal:    new FalProvider(),
  runway: new RunwayProvider(),
};

/**
 * Devuelve el provider correcto o lanza si el nombre no está permitido.
 * Fallback: "fal" si el nombre es undefined/vacío.
 */
export function getVideoProvider(providerName?: string): VideoProvider {
  const name = (providerName?.trim().toLowerCase() ?? "fal") as SupportedProvider;
  const provider = _providers[name];
  if (!provider) throw new Error(`Provider de video no soportado: "${name}". Usa: mock, fal, runway`);
  return provider;
}

/**
 * Valida que la combinación (provider, model) esté en la whitelist.
 * Lanza si no está permitida.
 */
export function assertAllowedCombination(provider: string, model: string): void {
  if (!isAllowedCombination(provider, model)) {
    throw new Error(`Combinación no permitida: provider="${provider}" model="${model}"`);
  }
}

/**
 * Estimación de costo en centavos USD para mostrar en UI.
 * No hace llamadas externas.
 */
export function estimateCostCents(
  provider: string,
  model: string,
  durationSeconds: number,
): number {
  const config = PROVIDER_MODELS.find((m) => m.provider === provider && m.model === model);
  if (!config) return 0;
  // Interpolación lineal entre min y max según duración (base: 10s)
  const scale = durationSeconds / 10;
  return Math.round(((config.costCentsMin + config.costCentsMax) / 2) * scale);
}

// Re-exportar tipos y configuración para uso en el controller
export type { VideoProvider, GenerateInput, GenerateResult, JobStatus, SupportedProvider } from "./types";
export { PROVIDER_MODELS, isAllowedCombination } from "./types";
