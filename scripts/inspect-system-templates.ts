import { sequelize } from "../src/config/db";
import { QueryTypes } from "sequelize";

async function main() {
  const rows = await sequelize.query(`
    SELECT id, name, items_snapshot, background_style, canvas_width, canvas_height
    FROM collection_templates
    WHERE seller_id IS NULL
    ORDER BY name ASC
  `, { type: QueryTypes.SELECT });
  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => {});
  });
