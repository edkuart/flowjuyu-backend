// migrations/basic/20260323-add-social-links-vendedor-perfil.ts
// Adds instagram, facebook, tiktok columns to vendedor_perfil.
// Safe to re-run: each ALTER is guarded by a column existence check.

import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  async up(qi: QueryInterface): Promise<void> {
    const table = await qi.describeTable("vendedor_perfil");

    if (!table.instagram) {
      await qi.addColumn("vendedor_perfil", "instagram", {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
      });
      console.log("✅ Added column: vendedor_perfil.instagram");
    }

    if (!table.facebook) {
      await qi.addColumn("vendedor_perfil", "facebook", {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
      });
      console.log("✅ Added column: vendedor_perfil.facebook");
    }

    if (!table.tiktok) {
      await qi.addColumn("vendedor_perfil", "tiktok", {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
      });
      console.log("✅ Added column: vendedor_perfil.tiktok");
    }
  },

  async down(qi: QueryInterface): Promise<void> {
    const table = await qi.describeTable("vendedor_perfil");
    if (table.instagram) await qi.removeColumn("vendedor_perfil", "instagram");
    if (table.facebook)  await qi.removeColumn("vendedor_perfil", "facebook");
    if (table.tiktok)    await qi.removeColumn("vendedor_perfil", "tiktok");
  },
};
