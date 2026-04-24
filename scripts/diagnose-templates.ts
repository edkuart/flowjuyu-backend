import { QueryTypes } from "sequelize";
import { sequelize } from "../src/config/db";

async function diagnose() {
  const names = [
    "Crafted Heritage / Landscape",
    "Lookbook Grid / Landscape",
    "Maison Editorial / Landscape",
    "Modern Atelier / Landscape",
    "Noir Studio / Landscape",
    "Premium Offer / Landscape",
    "Signature Drop / Landscape",
    "Vivid Market / Landscape",
    "Color Block / Landscape",
  ];

  console.log("=== ALL rows for curated template names ===\n");

  const rows = await sequelize.query<{
    id: number;
    seller_id: string | null;
    name: string;
    is_public: boolean;
    created_at: string;
    updated_at: string;
    text_preview: string;
  }>(
    `
    SELECT
      id,
      seller_id,
      name,
      is_public,
      created_at,
      updated_at,
      LEFT(items_snapshot::text, 120) AS text_preview
    FROM collection_templates
    WHERE name IN (:names)
    ORDER BY name, updated_at DESC
    `,
    { replacements: { names }, type: QueryTypes.SELECT },
  );

  for (const row of rows) {
    console.log(`[id #${row.id}] seller_id=${row.seller_id ?? "NULL"} | name="${row.name}"`);
    console.log(`  is_public=${row.is_public} | created_at=${row.created_at} | updated_at=${row.updated_at}`);
    console.log(`  items_preview: ${row.text_preview}`);
    console.log();
  }

  console.log(`=== DISTINCT ON result (what getMyCollectionTemplates returns) ===\n`);

  const distinctRows = await sequelize.query<{
    id: number;
    seller_id: string | null;
    name: string;
    updated_at: string;
  }>(
    `
    SELECT DISTINCT ON (name) id, seller_id, name, updated_at
    FROM collection_templates
    WHERE seller_id IS NULL
      AND name IN (:names)
    ORDER BY name, updated_at DESC
    `,
    { replacements: { names }, type: QueryTypes.SELECT },
  );

  for (const row of distinctRows) {
    console.log(`[id #${row.id}] name="${row.name}" | updated_at=${row.updated_at}`);
  }

  console.log("\n=== Seller-owned templates ===\n");

  const sellerRows = await sequelize.query<{
    id: number;
    seller_id: string;
    name: string;
    created_at: string;
  }>(
    `
    SELECT id, seller_id, name, created_at
    FROM collection_templates
    WHERE seller_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 20
    `,
    { type: QueryTypes.SELECT },
  );

  if (sellerRows.length === 0) {
    console.log("No seller-owned templates.");
  } else {
    for (const row of sellerRows) {
      console.log(`[id #${row.id}] seller_id=${row.seller_id} | name="${row.name}" | created_at=${row.created_at}`);
    }
  }
}

diagnose()
  .catch((err) => {
    console.error("Diagnose failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => {});
  });
