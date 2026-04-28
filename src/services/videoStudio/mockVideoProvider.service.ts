// Simula el ciclo de vida de una generación de video sin llamar APIs externas.
// Diseñado para ser reemplazado por RunwayProvider, LumaProvider o FalProvider.

import { sequelize } from "../../config/db";

const MOCK_PROGRESSION_MS = [
  { status: "validating",         delay: 1_500  },
  { status: "generating",         delay: 6_000  },
  { status: "processing_output",  delay: 4_000  },
  { status: "completed",          delay: 2_000  },
];

async function updateGenerationStatus(
  generationId: string,
  status: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const sets: string[] = ["status = :status"];
  const replacements: Record<string, unknown> = { generationId, status };

  if (status === "generating") {
    sets.push("started_at = NOW()");
  }
  if (status === "completed") {
    sets.push("completed_at = NOW()");
    sets.push("output_url = :outputUrl");
    sets.push("preview_url = :previewUrl");
    sets.push("cost_actual_cents = :cost");
    replacements.outputUrl = extra.outputUrl ?? null;
    replacements.previewUrl = extra.previewUrl ?? null;
    replacements.cost = extra.cost ?? 0;
  }
  if (status === "failed") {
    sets.push("error_code = :errorCode");
    sets.push("error_message = :errorMessage");
    replacements.errorCode = extra.errorCode ?? "MOCK_ERROR";
    replacements.errorMessage = extra.errorMessage ?? "Mock failure";
  }

  await sequelize.query(
    `UPDATE video_generations SET ${sets.join(", ")} WHERE id = :generationId`,
    { replacements }
  );
}

export async function runMockGeneration(
  generationId: string,
  thumbnailUrl: string | null
): Promise<void> {
  let elapsed = 0;
  for (const step of MOCK_PROGRESSION_MS) {
    await new Promise<void>((r) => setTimeout(r, step.delay));
    elapsed += step.delay;

    const extra: Record<string, unknown> = {};
    if (step.status === "completed") {
      extra.outputUrl = thumbnailUrl ?? null;
      extra.previewUrl = thumbnailUrl ?? null;
      extra.cost = 0;
    }

    await updateGenerationStatus(generationId, step.status, extra).catch(() => {});
  }
}
