import { QueryTypes } from "sequelize";
import { sequelize } from "../src/config/db";

const CURATED_SYSTEM_TEMPLATE_NAMES = [
  "Crafted Heritage / Landscape",
  "Lookbook Grid / Landscape",
] as const;

async function pruneSystemTemplates() {
  const staleTemplates = await sequelize.query<{ id: number; name: string }>(
    `
    SELECT id, name
    FROM collection_templates
    WHERE seller_id IS NULL
      AND name NOT IN (:keepNames)
    ORDER BY created_at DESC
    `,
    {
      replacements: { keepNames: [...CURATED_SYSTEM_TEMPLATE_NAMES] },
      type: QueryTypes.SELECT,
    },
  );

  if (!staleTemplates.length) {
    console.log("No stale system templates found.");
    return;
  }

  await sequelize.query(
    `
    DELETE FROM collection_templates
    WHERE seller_id IS NULL
      AND name NOT IN (:keepNames)
    `,
    {
      replacements: { keepNames: [...CURATED_SYSTEM_TEMPLATE_NAMES] },
      type: QueryTypes.DELETE,
    },
  );

  console.log(
    `Deleted ${staleTemplates.length} stale system templates: ${staleTemplates
      .map((template) => `${template.name} (#${template.id})`)
      .join(", ")}`,
  );
}

pruneSystemTemplates()
  .catch((error) => {
    console.error("Failed to prune system templates:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => {});
  });
