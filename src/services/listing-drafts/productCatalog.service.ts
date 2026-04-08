import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db";

export type ProductClassOption = {
  id: number;
  nombre: string;
  alias: string | null;
};

export type ProductCategoryOption = {
  id: number;
  nombre: string;
};

export async function listProductClasses(): Promise<ProductClassOption[]> {
  return sequelize.query<ProductClassOption>(
    `SELECT id, nombre, alias FROM clases ORDER BY nombre ASC`,
    { type: QueryTypes.SELECT }
  );
}

export async function listProductCategories(): Promise<ProductCategoryOption[]> {
  return sequelize.query<ProductCategoryOption>(
    `SELECT id, nombre FROM categorias ORDER BY nombre ASC`,
    { type: QueryTypes.SELECT }
  );
}

export async function getProductCategoryById(
  id: number
): Promise<ProductCategoryOption | null> {
  const rows = await sequelize.query<ProductCategoryOption>(
    `SELECT id, nombre FROM categorias WHERE id = :id LIMIT 1`,
    {
      replacements: { id },
      type: QueryTypes.SELECT,
    }
  );

  return rows[0] ?? null;
}

export async function getProductClassById(
  id: number
): Promise<ProductClassOption | null> {
  const rows = await sequelize.query<ProductClassOption>(
    `SELECT id, nombre, alias FROM clases WHERE id = :id LIMIT 1`,
    {
      replacements: { id },
      type: QueryTypes.SELECT,
    }
  );

  return rows[0] ?? null;
}

export async function resolveProductClassFromText(
  input: string
): Promise<ProductClassOption | null> {
  const normalized = String(input || "").trim().toLowerCase();
  if (!normalized) return null;

  const rows = await sequelize.query<ProductClassOption>(
    `
    SELECT id, nombre, alias
    FROM clases
    WHERE LOWER(nombre) = :normalized
       OR LOWER(COALESCE(alias, '')) = :normalized
       OR LOWER(nombre) LIKE :likeMatch
       OR LOWER(COALESCE(alias, '')) LIKE :likeMatch
    ORDER BY
      CASE
        WHEN LOWER(nombre) = :normalized THEN 0
        WHEN LOWER(COALESCE(alias, '')) = :normalized THEN 1
        ELSE 2
      END,
      nombre ASC
    LIMIT 1
    `,
    {
      replacements: {
        normalized,
        likeMatch: `%${normalized}%`,
      },
      type: QueryTypes.SELECT,
    }
  );

  return rows[0] ?? null;
}

export async function resolveProductCategoryFromText(
  input: string
): Promise<ProductCategoryOption | null> {
  const normalized = String(input || "").trim().toLowerCase();
  if (!normalized) return null;

  const rows = await sequelize.query<ProductCategoryOption>(
    `
    SELECT id, nombre
    FROM categorias
    WHERE LOWER(nombre) = :normalized
       OR LOWER(nombre) LIKE :likeMatch
    ORDER BY
      CASE
        WHEN LOWER(nombre) = :normalized THEN 0
        ELSE 1
      END,
      nombre ASC
    LIMIT 1
    `,
    {
      replacements: {
        normalized,
        likeMatch: `%${normalized}%`,
      },
      type: QueryTypes.SELECT,
    }
  );

  return rows[0] ?? null;
}
