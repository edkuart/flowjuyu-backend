// src/services/ai/ai.scanner.service.ts
//
// Scans the marketplace for common data-quality issues and
// creates AI tasks for each category of issue found.

import { Op, QueryTypes } from "sequelize";

import { sequelize }      from "../../config/db";
import Product            from "../../models/product.model";
import { VendedorPerfil } from "../../models/VendedorPerfil";

import {
  createTask,
  taskId,
  nowIso,
} from "./ai.fs.utils";

import type { ProductIssue, ScanResult } from "../../types/ai.types";

// ─────────────────────────────────────────────────────────
// Individual scans
// ─────────────────────────────────────────────────────────

async function scanMissingImages(): Promise<ProductIssue | null> {
  const count = await Product.count({
    where: {
      activo:     true,
      imagen_url: { [Op.or]: [null, ""] },
    },
  });

  if (count === 0) return null;

  return {
    type:        "missing_images",
    severity:    count > 20 ? "high" : "medium",
    title:       "Products missing images",
    count,
    description: `${count} active products have no image. Missing images reduce buyer trust.`,
  };
}

async function scanDuplicateTitles(): Promise<ProductIssue | null> {
  const rows = await sequelize.query<{ nombre: string; cnt: string }>(`
    SELECT nombre, COUNT(*)::int AS cnt
    FROM   productos
    WHERE  activo = true
    GROUP  BY nombre
    HAVING COUNT(*) > 1
    ORDER  BY cnt DESC
    LIMIT  50
  `, { type: QueryTypes.SELECT });

  if (rows.length === 0) return null;

  const totalDupes = rows.reduce((sum, r) => sum + Number(r.cnt), 0);

  return {
    type:        "duplicate_titles",
    severity:    "medium",
    title:       "Duplicate product titles detected",
    count:       rows.length,
    description: `${rows.length} title(s) are shared by ${totalDupes} products. ` +
                 "Duplicates may indicate spam or data-entry errors.",
    data:        rows.slice(0, 10).map((r) => ({ nombre: r.nombre, count: Number(r.cnt) })),
  };
}

async function scanSuspiciousPrices(): Promise<ProductIssue | null> {
  const rows = await Product.findAll({
    where: {
      activo: true,
      [Op.or]: [
        { precio: { [Op.lt]:  1     } },
        { precio: { [Op.gt]:  100_000 } },
      ],
    },
    attributes: ["id", "nombre", "precio", "vendedor_id"],
    limit: 30,
  });

  if (rows.length === 0) return null;

  return {
    type:        "suspicious_prices",
    severity:    "high",
    title:       "Suspicious product prices",
    count:       rows.length,
    description: `${rows.length} products have prices below Q1 or above Q100,000. ` +
                 "These may indicate test listings or pricing errors.",
    data:        rows.map((p) => ({
      id:          p.id,
      nombre:      p.nombre,
      precio:      p.precio,
      vendedor_id: p.vendedor_id,
    })),
  };
}

async function scanInactiveSellers(): Promise<ProductIssue | null> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const rows = await VendedorPerfil.findAll({
    where: {
      estado_admin: "activo",
      updatedAt:    { [Op.lt]: thirtyDaysAgo },
    },
    attributes: ["id", "nombre_comercio", "updatedAt"],
    limit: 50,
  });

  if (rows.length === 0) return null;

  return {
    type:        "inactive_sellers",
    severity:    "medium",
    title:       "Sellers inactive for 30+ days",
    count:       rows.length,
    description: `${rows.length} sellers marked active have not been updated in over 30 days.`,
    data:        rows.map((s) => ({
      id:              s.id,
      nombre_comercio: s.nombre_comercio,
      last_updated:    s.updatedAt,
    })),
  };
}

// ─────────────────────────────────────────────────────────
// Task creation
// ─────────────────────────────────────────────────────────

function priorityFor(severity: ProductIssue["severity"]): "low" | "medium" | "high" {
  if (severity === "critical" || severity === "high") return "high";
  if (severity === "medium") return "medium";
  return "low";
}

async function issueToTask(issue: ProductIssue): Promise<void> {
  await createTask({
    id:          taskId(`scan-${issue.type}`),
    title:       issue.title,
    description: `${issue.description} (${issue.count} affected)`,
    priority:    priorityFor(issue.severity),
    source:      "ai-scanner",
  });
}

// ─────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────

export async function scanMarketplace(): Promise<ScanResult> {
  console.log("[scanner] Starting marketplace scan…");

  const rawIssues = await Promise.all([
    scanMissingImages(),
    scanDuplicateTitles(),
    scanSuspiciousPrices(),
    scanInactiveSellers(),
  ]);

  const issues = rawIssues.filter((i): i is ProductIssue => i !== null);

  // Create a task for each issue found
  await Promise.all(issues.map(issueToTask));

  const result: ScanResult = {
    issues,
    tasks_created: issues.length,
    scanned_at:    nowIso(),
  };

  console.log(
    `[scanner] Done — ${issues.length} issue(s) found, ` +
    `${result.tasks_created} task(s) created`
  );

  return result;
}
