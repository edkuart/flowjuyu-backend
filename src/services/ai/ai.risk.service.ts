// src/services/ai/ai.risk.service.ts
//
// Detects marketplace risks and auto-creates tasks for
// high-severity findings.

import { Op, QueryTypes } from "sequelize";

import { sequelize } from "../../config/db";
import Product       from "../../models/product.model";

import {
  createTask,
  taskId,
  nowIso,
} from "./ai.fs.utils";

import type {
  MarketplaceRisk,
  RiskReport,
  IssueSeverity,
} from "../../types/ai.types";

// ─────────────────────────────────────────────────────────
// Risk detectors
// ─────────────────────────────────────────────────────────

async function detectDuplicateProducts(): Promise<MarketplaceRisk[]> {
  const rows = await sequelize.query<{
    vendedor_id: string;
    nombre:      string;
    cnt:         string;
  }>(`
    SELECT vendedor_id, nombre, COUNT(*)::int AS cnt
    FROM   productos
    WHERE  activo = true
    GROUP  BY vendedor_id, nombre
    HAVING COUNT(*) > 1
    ORDER  BY cnt DESC
    LIMIT  20
  `, { type: QueryTypes.SELECT });

  return rows.map((r) => ({
    type:        "duplicate_product",
    severity:    Number(r.cnt) > 3 ? ("high" as IssueSeverity) : ("medium" as IssueSeverity),
    description: `Seller ${r.vendedor_id} has ${r.cnt} products with the same title: "${r.nombre}"`,
    seller_id:   Number(r.vendedor_id),
    product_id:  null,
    count:       Number(r.cnt),
  }));
}

async function detectUnusualPricing(): Promise<MarketplaceRisk[]> {
  const rows = await Product.findAll({
    where: {
      activo: true,
      [Op.or]: [
        { precio: { [Op.lt]:  1       } },
        { precio: { [Op.gt]:  100_000 } },
      ],
    },
    attributes: ["id", "nombre", "precio", "vendedor_id"],
    limit: 30,
  });

  if (rows.length === 0) return [];

  return [{
    type:        "unusual_pricing",
    severity:    "high",
    description: `${rows.length} products have prices below Q1 or above Q100,000.`,
    seller_id:   null,
    product_id:  null,
    count:       rows.length,
  }];
}

async function detectSuspiciousSellers(): Promise<MarketplaceRisk[]> {
  // Sellers with 5+ products having no images (potential spam/placeholder listings)
  const rows = await sequelize.query<{
    vendedor_id:  string;
    bad_products: string;
  }>(`
    SELECT vendedor_id, COUNT(*)::int AS bad_products
    FROM   productos
    WHERE  activo = true AND imagen_url IS NULL
    GROUP  BY vendedor_id
    HAVING COUNT(*) >= 5
    ORDER  BY bad_products DESC
    LIMIT  10
  `, { type: QueryTypes.SELECT });

  return rows.map((r) => ({
    type:        "suspicious_seller",
    severity:    Number(r.bad_products) >= 10
      ? ("high"   as IssueSeverity)
      : ("medium" as IssueSeverity),
    description: `Seller ${r.vendedor_id} has ${r.bad_products} active products without images.`,
    seller_id:   Number(r.vendedor_id),
    product_id:  null,
    count:       Number(r.bad_products),
  }));
}

async function detectSpamListings(): Promise<MarketplaceRisk[]> {
  // Products with very short names (< 4 chars) or that are pure numbers
  const rows = await Product.findAll({
    where: {
      activo: true,
      [Op.or]: [
        sequelize.where(
          sequelize.fn("length", sequelize.col("nombre")),
          { [Op.lt]: 4 }
        ),
      ],
    },
    attributes: ["id", "nombre", "vendedor_id"],
    limit: 20,
  });

  if (rows.length === 0) return [];

  return [{
    type:        "spam_listings",
    severity:    "medium",
    description: `${rows.length} products have suspiciously short names (< 4 chars), ` +
                 "which may indicate spam or test listings.",
    seller_id:   null,
    product_id:  null,
    count:       rows.length,
  }];
}

// ─────────────────────────────────────────────────────────
// Task auto-creation for high-severity risks
// ─────────────────────────────────────────────────────────

async function maybeCreateTask(risk: MarketplaceRisk): Promise<boolean> {
  if (risk.severity !== "high" && risk.severity !== "critical") return false;

  await createTask({
    id:          taskId(`risk-${risk.type}`),
    title:       `[RISK] ${risk.type.replace(/_/g, " ").toUpperCase()}`,
    description: risk.description,
    priority:    risk.severity === "critical" ? "high" : "high",
    source:      "ai-risk-detector",
  });

  return true;
}

// ─────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────

export async function detectMarketplaceRisks(): Promise<RiskReport> {
  console.log("[risk] Scanning for marketplace risks…");

  const rawRisks = await Promise.all([
    detectDuplicateProducts(),
    detectUnusualPricing(),
    detectSuspiciousSellers(),
    detectSpamListings(),
  ]);

  const risks = rawRisks.flat();

  // Auto-create tasks for high/critical risks
  const taskResults = await Promise.all(risks.map(maybeCreateTask));
  const tasksCreated = taskResults.filter(Boolean).length;

  const result: RiskReport = {
    risks,
    tasks_created: tasksCreated,
    evaluated_at:  nowIso(),
  };

  console.log(
    `[risk] Done — ${risks.length} risk(s) detected, ` +
    `${tasksCreated} high-severity task(s) created`
  );

  return result;
}
