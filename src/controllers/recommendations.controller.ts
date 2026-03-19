// src/controllers/recommendations.controller.ts
//
// Rule-based recommendation engine.
//
// Algorithm (no ML):
//   1. Build category affinity from user's favorites
//   2. Score all eligible products:
//        score = (rating_avg * 2) * LN(rating_count + 1)   ← quality signal
//                + 2.0  if category matches user's affinity  ← relevance bonus
//                + 1.0  if created within last 7 days        ← freshness bonus
//   3. Exclude already-favorited products
//   4. Fallback to top-rated when user has no favorites

import { RequestHandler } from "express";
import { sequelize } from "../config/db";
import { QueryTypes } from "sequelize";
import { buildPublicProductCardDTO } from "../utils/buildPublicProductCardDTO";

/* ============================================================
   GET /api/products/recommended
   Requires auth — any logged-in role
============================================================ */
export const getRecommendedProducts: RequestHandler = async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    // ── Check whether the user has any favorites ──────────────────────
    const [hasFavs] = await sequelize.query<{ has_favorites: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM favorites
         WHERE user_id = :userId AND product_id IS NOT NULL
       ) AS has_favorites`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );

    const rows =
      hasFavs?.has_favorites
        ? await personalizedQuery(userId)
        : await fallbackQuery();

    const data = rows.map(buildPublicProductCardDTO);

    res.json({ success: true, data, personalized: hasFavs?.has_favorites ?? false });
  } catch (err) {
    console.error("getRecommendedProducts error:", err);
    res.status(500).json({ message: "Error interno" });
  }
};

// ─── Personalized: scored by category affinity + quality ─────────────────────

async function personalizedQuery(userId: number) {
  return sequelize.query<Record<string, any>>(
    `
    WITH user_categories AS (
      -- Derive category affinity from the user's favorites
      SELECT
        p.categoria_id,
        COUNT(*)::int AS freq
      FROM favorites f
      JOIN productos p ON p.id = f.product_id
      WHERE f.user_id  = :userId
        AND p.categoria_id IS NOT NULL
      GROUP BY p.categoria_id
    ),
    scored AS (
      SELECT
        p.id,
        p.nombre,
        p.precio,
        p.imagen_url,
        p.departamento,
        p.municipio,
        COALESCE(p.rating_avg, 0)   AS rating_avg,
        COALESCE(p.rating_count, 0) AS rating_count,
        p.created_at,
        c.id   AS categoria_id,
        c.nombre AS categoria_nombre,
        -- Composite score ─────────────────────────────────────────────
        -- quality:   bayesian-style product of avg × log(count+1)
        -- relevance: flat bonus when product is in a favorited category
        -- freshness: flat bonus when product is less than 7 days old
        (
          COALESCE(p.rating_avg, 0) * 2.0
          * LN(COALESCE(p.rating_count, 0) + 1)
          + CASE WHEN uc.categoria_id IS NOT NULL THEN 2.0 ELSE 0.0 END
          + CASE WHEN p.created_at >= NOW() - INTERVAL '7 days' THEN 1.0 ELSE 0.0 END
        ) AS rec_score
      FROM productos p
      JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      LEFT JOIN categorias  c ON c.id   = p.categoria_id
      LEFT JOIN user_categories uc ON uc.categoria_id = p.categoria_id
      WHERE
        p.activo = true
        AND v.estado_validacion = 'aprobado'
        AND v.estado_admin = 'activo'
        AND NOT EXISTS (
          -- Exclude products the user already saved
          SELECT 1 FROM favorites f2
          WHERE f2.product_id = p.id AND f2.user_id = :userId
        )
    )
    SELECT
      id, nombre, precio, imagen_url,
      rating_avg, rating_count,
      departamento, municipio,
      categoria_id, categoria_nombre
    FROM scored
    ORDER BY rec_score DESC, created_at DESC
    LIMIT 24
    `,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
}

// ─── Fallback: top-rated products (no user signal available) ─────────────────

async function fallbackQuery() {
  return sequelize.query<Record<string, any>>(
    `
    SELECT
      p.id,
      p.nombre,
      p.precio,
      p.imagen_url,
      COALESCE(p.rating_avg, 0)   AS rating_avg,
      COALESCE(p.rating_count, 0) AS rating_count,
      p.departamento,
      p.municipio,
      c.id     AS categoria_id,
      c.nombre AS categoria_nombre
    FROM productos p
    JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
    LEFT JOIN categorias c ON c.id = p.categoria_id
    WHERE
      p.activo = true
      AND v.estado_validacion = 'aprobado'
      AND v.estado_admin = 'activo'
    ORDER BY
      COALESCE(p.rating_avg, 0) * 2.0 * LN(COALESCE(p.rating_count, 0) + 1) DESC,
      p.created_at DESC
    LIMIT 24
    `,
    { type: QueryTypes.SELECT }
  );
}
