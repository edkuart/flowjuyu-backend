// src/services/ai/ai.seller.service.ts
//
// Analyzes seller performance metrics from the database.

import { Op, QueryTypes } from "sequelize";

import { sequelize }      from "../../config/db";
import { VendedorPerfil } from "../../models/VendedorPerfil";

import { nowIso } from "./ai.fs.utils";

import type { SellerMetrics, SellerIntelligence } from "../../types/ai.types";

// ─────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────

async function getTopSellers(limit = 10): Promise<SellerMetrics[]> {
  const rows = await sequelize.query<{
    id:              string;
    nombre_comercio: string;
    product_count:   string;
    intention_count: string;
    last_active:     string | null;
  }>(`
    SELECT
      vp.id,
      vp.nombre_comercio,
      COUNT(DISTINCT p.id)::int  AS product_count,
      COUNT(pi.id)::int          AS intention_count,
      MAX(pi.created_at)         AS last_active
    FROM   vendedor_perfil vp
    JOIN   productos p
           ON p.vendedor_id = vp.id AND p.activo = true
    LEFT   JOIN purchase_intentions pi
           ON pi.product_id = p.id
    WHERE  vp.estado_admin = 'activo'
    GROUP  BY vp.id, vp.nombre_comercio
    ORDER  BY intention_count DESC, product_count DESC
    LIMIT  :limit
  `, { type: QueryTypes.SELECT, replacements: { limit } });

  return rows.map((r) => ({
    id:              Number(r.id),
    nombre_comercio: r.nombre_comercio,
    product_count:   Number(r.product_count),
    intention_count: Number(r.intention_count),
    last_active:     r.last_active ?? null,
  }));
}

/**
 * Risky sellers: active sellers whose products have suspicious signals —
 * many missing images or very low prices indicating data-quality risk.
 */
async function getRiskySellers(limit = 10): Promise<SellerMetrics[]> {
  const rows = await sequelize.query<{
    id:              string;
    nombre_comercio: string;
    product_count:   string;
    bad_products:    string;
  }>(`
    SELECT
      vp.id,
      vp.nombre_comercio,
      COUNT(DISTINCT p.id)::int                                      AS product_count,
      COUNT(DISTINCT CASE WHEN p.imagen_url IS NULL THEN p.id END)::int AS bad_products
    FROM   vendedor_perfil vp
    JOIN   productos p ON p.vendedor_id = vp.id AND p.activo = true
    WHERE  vp.estado_admin = 'activo'
    GROUP  BY vp.id, vp.nombre_comercio
    HAVING COUNT(DISTINCT CASE WHEN p.imagen_url IS NULL THEN p.id END) >= 3
    ORDER  BY bad_products DESC
    LIMIT  :limit
  `, { type: QueryTypes.SELECT, replacements: { limit } });

  return rows.map((r) => ({
    id:              Number(r.id),
    nombre_comercio: r.nombre_comercio,
    product_count:   Number(r.product_count),
    intention_count: 0,
    last_active:     null,
  }));
}

async function getInactiveSellers(limit = 20): Promise<SellerMetrics[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const rows = await VendedorPerfil.findAll({
    where: {
      estado_admin: "activo",
      updatedAt:    { [Op.lt]: thirtyDaysAgo },
    },
    attributes: ["id", "nombre_comercio", "updatedAt"],
    order:      [["updatedAt", "ASC"]],
    limit,
  });

  return rows.map((s) => ({
    id:              s.id,
    nombre_comercio: s.nombre_comercio,
    product_count:   0,
    intention_count: 0,
    last_active:     s.updatedAt?.toISOString() ?? null,
  }));
}

// ─────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────

export async function analyzeSellerPerformance(): Promise<SellerIntelligence> {
  console.log("[sellers] Analyzing seller performance…");

  const [top_sellers, risky_sellers, inactive_sellers] = await Promise.all([
    getTopSellers(10),
    getRiskySellers(10),
    getInactiveSellers(20),
  ]);

  const result: SellerIntelligence = {
    top_sellers,
    risky_sellers,
    inactive_sellers,
    generated_at: nowIso(),
  };

  console.log(
    `[sellers] Done — top: ${top_sellers.length}, ` +
    `risky: ${risky_sellers.length}, ` +
    `inactive: ${inactive_sellers.length}`
  );

  return result;
}
