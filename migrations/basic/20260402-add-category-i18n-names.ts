// Migration: add multilingual name columns to categorias
// Safe to run multiple times (uses ADD COLUMN IF NOT EXISTS via raw SQL)

import { QueryInterface, DataTypes } from "sequelize";

export async function up(queryInterface: QueryInterface): Promise<void> {
  const tableDesc = await queryInterface.describeTable("categorias");

  if (!tableDesc["nombre_kiche"]) {
    await queryInterface.addColumn("categorias", "nombre_kiche", {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
    });
  }

  if (!tableDesc["nombre_kaqchikel"]) {
    await queryInterface.addColumn("categorias", "nombre_kaqchikel", {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
    });
  }

  if (!tableDesc["nombre_qeqchi"]) {
    await queryInterface.addColumn("categorias", "nombre_qeqchi", {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
    });
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn("categorias", "nombre_kiche");
  await queryInterface.removeColumn("categorias", "nombre_kaqchikel");
  await queryInterface.removeColumn("categorias", "nombre_qeqchi");
}
