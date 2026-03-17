// src/services/ai/ai.growth.service.ts
//
// Detects growth opportunities in the marketplace and writes
// a growth report to flow-ai/reports/daily/.

import { QueryTypes } from "sequelize";

import { sequelize } from "../../config/db";

import {
  writeReport,
  appendToMemoryArray,
  todayStr,
  nowIso,
} from "./ai.fs.utils";

import type {
  GrowthOpportunity,
  GrowthReport,
  AiDecision,
} from "../../types/ai.types";

// ─────────────────────────────────────────────────────────
// Opportunity detectors
// ─────────────────────────────────────────────────────────

/** Categories with high demand (intentions) but few products — supply gap. */
async function findCategoryGaps(limit = 10): Promise<GrowthOpportunity[]> {
  const rows = await sequelize.query<{
    cat_id:          string;
    nombre:          string;
    product_count:   string;
    intention_count: string;
  }>(`
    SELECT
      c.id                            AS cat_id,
      c.nombre,
      COUNT(DISTINCT p.id)::int       AS product_count,
      COUNT(pi.id)::int               AS intention_count
    FROM   categorias c
    LEFT   JOIN productos p  ON p.categoria_id = c.id  AND p.activo = true
    LEFT   JOIN purchase_intentions pi ON pi.product_id = p.id
    GROUP  BY c.id, c.nombre
    HAVING COUNT(pi.id) > 0
    ORDER  BY (COUNT(pi.id)::float / GREATEST(COUNT(DISTINCT p.id), 1)) DESC
    LIMIT  :limit
  `, { type: QueryTypes.SELECT, replacements: { limit } });

  return rows.map((r) => {
    const demand = Number(r.intention_count);
    const supply = Number(r.product_count);
    const ratio  = demand / Math.max(supply, 1);

    return {
      type:         "category_opportunity",
      category:     r.nombre,
      demand_score: demand,
      supply_score: supply,
      suggestion:   ratio > 5
        ? `"${r.nombre}" has very high demand vs supply (${demand} intentions / ${supply} products). ` +
          "Actively recruit sellers in this category."
        : `"${r.nombre}" shows solid demand. ` +
          "Consider featuring it on the homepage to boost supply.",
    };
  }).filter((o) => o.demand_score > 0 && o.demand_score / Math.max(o.supply_score, 1) > 1.5);
}

/** Products trending in views (most intentions in last 14 days). */
async function findTrendingProducts(limit = 5): Promise<GrowthOpportunity[]> {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

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
    replacements: { since: fourteenDaysAgo, limit },
  });

  return rows.map((r) => ({
    type:         "trending_product",
    category:     undefined,
    demand_score: Number(r.cnt),
    supply_score: 1,
    suggestion:   `"${r.nombre}" has ${r.cnt} purchase intentions in the last 14 days. ` +
                  "Feature it in promotions and notify the seller.",
  }));
}

/** Sellers showing high growth (most new intentions in last 30 days). */
async function findHighGrowthSellers(limit = 5): Promise<GrowthOpportunity[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const rows = await sequelize.query<{
    seller_id:       string;
    nombre_comercio: string;
    intention_count: string;
    product_count:   string;
  }>(`
    SELECT
      vp.id                     AS seller_id,
      vp.nombre_comercio,
      COUNT(pi.id)::int         AS intention_count,
      COUNT(DISTINCT p.id)::int AS product_count
    FROM   vendedor_perfil vp
    JOIN   productos p         ON p.vendedor_id = vp.id AND p.activo = true
    LEFT   JOIN purchase_intentions pi
           ON pi.product_id = p.id AND pi.created_at >= :since
    WHERE  vp.estado_admin = 'activo'
    GROUP  BY vp.id, vp.nombre_comercio
    HAVING COUNT(pi.id) > 0
    ORDER  BY intention_count DESC
    LIMIT  :limit
  `, {
    type:        QueryTypes.SELECT,
    replacements: { since: thirtyDaysAgo, limit },
  });

  return rows.map((r) => ({
    type:         "high_growth_seller",
    seller:       r.nombre_comercio,
    demand_score: Number(r.intention_count),
    supply_score: Number(r.product_count),
    suggestion:   `Seller "${r.nombre_comercio}" received ${r.intention_count} purchase intentions ` +
                  "in 30 days. Consider featuring them or inviting them to upgrade their plan.",
  }));
}

// ─────────────────────────────────────────────────────────
// Report + memory writer
// ─────────────────────────────────────────────────────────

function buildReportMarkdown(opportunities: GrowthOpportunity[], date: string): string {
  const lines: string[] = [
    `# Growth Opportunities Report — ${date}`,
    "",
    `> Generated by Flowjuyu AI Brain on ${new Date().toLocaleString()}`,
    "",
    `## Summary`,
    "",
    `${opportunities.length} growth opportunity(ies) detected.`,
    "",
    `## Opportunities`,
    "",
  ];

  opportunities.forEach((o, i) => {
    lines.push(
      `### ${i + 1}. [${o.type.replace(/_/g, " ").toUpperCase()}] ${o.category ?? o.seller ?? ""}`,
      "",
      `- **Demand score**: ${o.demand_score}`,
      `- **Supply score**: ${o.supply_score}`,
      `- **Suggestion**: ${o.suggestion}`,
      "",
    );
  });

  lines.push(
    "---",
    `*Flowjuyu AI Brain — Growth Engine — ${date}*`,
  );

  return lines.join("\n");
}

async function saveDecision(opportunities: GrowthOpportunity[]): Promise<void> {
  if (opportunities.length === 0) return;

  const top = opportunities[0];
  const decision: AiDecision = {
    date:          nowIso(),
    decision_type: "growth_opportunity",
    explanation:   top.suggestion,
    related_data:  { total_opportunities: opportunities.length, top },
  };

  await appendToMemoryArray("decisions.json", decision);
}

// ─────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────

export async function detectGrowthOpportunities(): Promise<GrowthReport> {
  console.log("[growth] Detecting growth opportunities…");

  const [categoryGaps, trendingProducts, growthSellers] = await Promise.all([
    findCategoryGaps(10),
    findTrendingProducts(5),
    findHighGrowthSellers(5),
  ]);

  const opportunities = [...categoryGaps, ...trendingProducts, ...growthSellers];

  // Sort by demand_score descending
  opportunities.sort((a, b) => b.demand_score - a.demand_score);

  const date           = todayStr();
  const filename       = `growth-${date}.md`;
  const reportContent  = buildReportMarkdown(opportunities, date);
  const reportFilename = await writeReport(filename, reportContent);

  await saveDecision(opportunities);

  const result: GrowthReport = {
    opportunities,
    report_filename: reportFilename,
    generated_at:    nowIso(),
  };

  console.log(
    `[growth] Done — ${opportunities.length} opportunity(ies), ` +
    `report: ${reportFilename ?? "failed"}`
  );

  return result;
}
