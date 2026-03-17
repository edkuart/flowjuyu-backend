// src/services/ai/ai.intelligence.service.ts
//
// Analyzes the marketplace via DB queries and stores insights
// in flow-ai/memory/marketplace.json.

import path from "path";
import { Op, QueryTypes } from "sequelize";

import { sequelize } from "../../config/db";
import Product      from "../../models/product.model";
import { VendedorPerfil } from "../../models/VendedorPerfil";

import {
  MEMORY_DIR,
  safeReadJson,
  safeWriteJson,
  appendToMemoryArray,
  todayStr,
  nowIso,
} from "./ai.fs.utils";

import type {
  MarketplaceIntelligence,
  TrendingProduct,
  TrendingCategory,
  MarketplaceMemoryEntry,
} from "../../types/ai.types";

// ─────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────

async function countProductsWithoutImages(): Promise<number> {
  return Product.count({
    where: {
      activo:     true,
      imagen_url: { [Op.or]: [null, ""] },
    },
  });
}

async function countProductsWithoutViews(): Promise<number> {
  const [rows] = await sequelize.query<{ cnt: string }>(`
    SELECT COUNT(DISTINCT p.id)::int AS cnt
    FROM   productos p
    WHERE  p.activo = true
      AND  NOT EXISTS (
             SELECT 1 FROM purchase_intentions pi
             WHERE  pi.product_id = p.id
           )
  `, { type: QueryTypes.SELECT });

  return Number(rows?.cnt ?? 0);
}

async function countInactiveSellers(): Promise<number> {
  return VendedorPerfil.count({
    where: { estado_admin: "inactivo" },
  });
}

async function getTrendingProducts(limit = 10): Promise<TrendingProduct[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const rows = await sequelize.query<{
    product_id: string;
    nombre:     string;
    cnt:        string;
  }>(`
    SELECT   pi.product_id,
             p.nombre,
             COUNT(pi.id)::int AS cnt
    FROM     purchase_intentions pi
    JOIN     productos p ON p.id = pi.product_id
    WHERE    pi.created_at >= :since
      AND    pi.product_id IS NOT NULL
    GROUP BY pi.product_id, p.nombre
    ORDER BY cnt DESC
    LIMIT    :limit
  `, {
    type:        QueryTypes.SELECT,
    replacements: { since: sevenDaysAgo, limit },
  });

  return rows.map((r) => ({
    product_id:      r.product_id,
    nombre:          r.nombre,
    intention_count: Number(r.cnt),
  }));
}

async function getTrendingCategories(limit = 5): Promise<TrendingCategory[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const rows = await sequelize.query<{
    categoria_id: string;
    nombre:       string;
    cnt:          string;
  }>(`
    SELECT   p.categoria_id,
             c.nombre,
             COUNT(pi.id)::int AS cnt
    FROM     purchase_intentions pi
    JOIN     productos p  ON p.id  = pi.product_id
    JOIN     categorias c ON c.id  = p.categoria_id
    WHERE    pi.created_at >= :since
      AND    pi.product_id IS NOT NULL
      AND    p.categoria_id IS NOT NULL
    GROUP BY p.categoria_id, c.nombre
    ORDER BY cnt DESC
    LIMIT    :limit
  `, {
    type:        QueryTypes.SELECT,
    replacements: { since: sevenDaysAgo, limit },
  });

  return rows.map((r) => ({
    categoria_id:    Number(r.categoria_id),
    nombre:          r.nombre,
    intention_count: Number(r.cnt),
  }));
}

// ─────────────────────────────────────────────────────────
// Memory helpers
// ─────────────────────────────────────────────────────────

async function storeIntelligenceMemory(
  intel: MarketplaceIntelligence
): Promise<void> {
  // 1. Update the live intelligence snapshot
  const snapshotPath = path.join(MEMORY_DIR, "intelligence.json");
  await safeWriteJson(snapshotPath, intel);

  // 2. Append a summarised entry to the historical marketplace array
  const entry: MarketplaceMemoryEntry = {
    date:     todayStr(),
    insights: [
      `${intel.products_total} products total`,
      `${intel.products_without_images} missing images`,
      `${intel.products_without_views} without views`,
      `${intel.inactive_sellers} inactive sellers`,
      `Top trending: ${intel.trending_products[0]?.nombre ?? "none"}`,
    ],
  };

  const marketplacePath = path.join(MEMORY_DIR, "marketplace.json");
  const existing = await safeReadJson<MarketplaceMemoryEntry[]>(marketplacePath, []);
  const updated  = [entry, ...existing].slice(0, 90);
  await safeWriteJson(marketplacePath, updated);
}

// ─────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────

export async function analyzeMarketplace(): Promise<MarketplaceIntelligence> {
  console.log("[intelligence] Starting marketplace analysis…");

  const [
    productsTotal,
    productsWithoutImages,
    productsWithoutViews,
    inactiveSellers,
    trendingProducts,
    trendingCategories,
  ] = await Promise.all([
    Product.count({ where: { activo: true } }),
    countProductsWithoutImages(),
    countProductsWithoutViews(),
    countInactiveSellers(),
    getTrendingProducts(10),
    getTrendingCategories(5),
  ]);

  const intel: MarketplaceIntelligence = {
    products_total:          productsTotal,
    products_without_images: productsWithoutImages,
    products_without_views:  productsWithoutViews,
    inactive_sellers:        inactiveSellers,
    trending_products:       trendingProducts,
    trending_categories:     trendingCategories,
    generated_at:            nowIso(),
  };

  await storeIntelligenceMemory(intel);

  console.log(
    `[intelligence] Done — ${productsTotal} products, ` +
    `${trendingProducts.length} trending products, ` +
    `${trendingCategories.length} trending categories`
  );

  return intel;
}
