// src/services/content/TemplateHealthService.ts
//
// Evaluates template health and applies state transitions.
// Called AFTER TemplatePerformanceService has refreshed stats.
//
// Thresholds (all tunable in content-optimizer.json if desired):
//   REJECTION_RATE_PAUSE    = 0.45  (45% of variants rejected/discarded)
//   EDIT_RATE_DEGRADE       = 0.60  (60% of approvals required human editing)
//   PERFORMANCE_SCORE_PROMOTE = 0.55 (avg real-world score → 'active' from 'degraded')
//   MIN_SAMPLES             = 5     (minimum variants before health eval runs)
//   MIN_SAMPLES_PROMOTE     = 10    (minimum before promoting to 'active')
//
// State machine:
//   candidate  → active    (admin approves via handleApproveTemplate)
//   candidate  → retired   (admin rejects via handleRejectTemplate)
//   active     → degraded  (edit_rate > EDIT_RATE_DEGRADE)
//   active     → paused    (rejection_rate > REJECTION_RATE_PAUSE)
//   degraded   → active    (metrics recover below thresholds)
//   degraded   → paused    (rejection_rate escalates)
//   paused     → retired   (superseded OR manual)
//
// DIVERSITY SAFETY: the service will never pause the LAST active template
// for a content_type. At least one active template must remain per type.

import { Op } from "sequelize";
import AiContentTemplate from "../../models/AiContentTemplate.model";

// ─── Thresholds ───────────────────────────────────────────────────────────────

const REJECTION_RATE_PAUSE    = 0.45;
const EDIT_RATE_DEGRADE       = 0.60;
const PERFORMANCE_PROMOTE     = 0.55;
const MIN_SAMPLES             = 5;
const MIN_SAMPLES_PROMOTE     = 10;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HealthTransition {
  template_id:   string;
  slug:          string;
  from_status:   string;
  to_status:     string;
  reason:        string;
}

// ─── Safety: count active templates per content_type ─────────────────────────

async function countActiveForType(contentType: string, excludeId?: string): Promise<number> {
  const where: Record<string, any> = {
    content_type: contentType,
    is_active:    true,
    health_status: { [Op.in]: ["active", "degraded"] },
  };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  return AiContentTemplate.count({ where });
}

// ─── Main: evaluate all non-candidate, non-retired templates ─────────────────

export async function evaluateTemplateHealth(): Promise<HealthTransition[]> {
  const templates = await AiContentTemplate.findAll({
    where: {
      health_status: { [Op.in]: ["active", "degraded"] },
      is_active:     true,
    },
  });

  const transitions: HealthTransition[] = [];

  for (const t of templates) {
    // Skip evaluation if not enough data
    if (t.sample_count < MIN_SAMPLES) continue;

    const rr = t.rejection_rate != null ? Number(t.rejection_rate) : null;
    const er = t.edit_rate       != null ? Number(t.edit_rate)      : null;
    const ps = t.performance_score_avg != null ? Number(t.performance_score_avg) : null;

    const prev = t.health_status;
    let next   = t.health_status;
    let reason = "";

    // ── PAUSE: high rejection rate ─────────────────────────────────────────
    if (rr != null && rr >= REJECTION_RATE_PAUSE) {
      // Diversity guard: never pause the last active template for this type
      const othersActive = await countActiveForType(t.content_type, t.id);
      if (othersActive === 0) {
        // Can't pause — last standing. Degrade instead.
        if (next !== "degraded") {
          next   = "degraded";
          reason = `rejection_rate=${rr.toFixed(3)} ≥ ${REJECTION_RATE_PAUSE} but no other active template exists — degraded instead of paused`;
        }
      } else {
        next   = "paused";
        reason = `rejection_rate=${rr.toFixed(3)} ≥ threshold ${REJECTION_RATE_PAUSE}`;
      }
    }
    // ── DEGRADE: high edit rate (humans keep rewriting) ────────────────────
    else if (er != null && er >= EDIT_RATE_DEGRADE && next === "active") {
      next   = "degraded";
      reason = `edit_rate=${er.toFixed(3)} ≥ threshold ${EDIT_RATE_DEGRADE} — content requires frequent human correction`;
    }
    // ── RECOVER: degraded template improves ────────────────────────────────
    else if (
      next === "degraded" &&
      t.sample_count >= MIN_SAMPLES_PROMOTE &&
      (er == null || er < EDIT_RATE_DEGRADE * 0.7) &&
      (rr == null || rr < REJECTION_RATE_PAUSE * 0.7) &&
      (ps == null || ps >= PERFORMANCE_PROMOTE)
    ) {
      next   = "active";
      reason = `metrics recovered: edit_rate=${er?.toFixed(3) ?? "n/a"} rejection_rate=${rr?.toFixed(3) ?? "n/a"} performance=${ps?.toFixed(3) ?? "n/a"}`;
    }

    if (next !== prev) {
      const updateData: Record<string, any> = {
        health_status: next,
        is_active:     next !== "paused" && next !== "retired",
      };
      if (next === "paused") {
        updateData.paused_at    = new Date();
        updateData.pause_reason = reason;
      }
      await t.update(updateData);
      transitions.push({
        template_id: t.id,
        slug:        t.slug,
        from_status: prev,
        to_status:   next,
        reason,
      });
    }
  }

  return transitions;
}

// ─── Promote a candidate to active (human-approved) ──────────────────────────

export async function activateTemplate(
  templateId: string,
  approvedBy: number
): Promise<AiContentTemplate> {
  const template = await AiContentTemplate.findByPk(templateId);
  if (!template) {
    throw Object.assign(new Error("TEMPLATE_NOT_FOUND"), { statusCode: 404 });
  }
  if (template.health_status !== "candidate") {
    throw Object.assign(
      new Error(`INVALID_TRANSITION:${template.health_status}→active (only candidates can be activated)`),
      { statusCode: 409 }
    );
  }
  await template.update({
    health_status: "active",
    is_active:     true,
    approved_by:   approvedBy,
    approved_at:   new Date(),
  });
  return template;
}

// ─── Retire a candidate (human-rejected) ─────────────────────────────────────

export async function retireTemplate(templateId: string): Promise<AiContentTemplate> {
  const template = await AiContentTemplate.findByPk(templateId);
  if (!template) {
    throw Object.assign(new Error("TEMPLATE_NOT_FOUND"), { statusCode: 404 });
  }
  const allowed = ["candidate", "paused", "degraded"];
  if (!allowed.includes(template.health_status)) {
    throw Object.assign(
      new Error(`INVALID_TRANSITION:${template.health_status}→retired`),
      { statusCode: 409 }
    );
  }
  await template.update({ health_status: "retired", is_active: false });
  return template;
}

// ─── Load summary for admin dashboard ────────────────────────────────────────

export async function getTemplateHealthSummary(): Promise<{
  by_status: Record<string, number>;
  needs_attention: Array<{ slug: string; health_status: string; rejection_rate: number | null; edit_rate: number | null }>;
}> {
  const all = await AiContentTemplate.findAll({
    where: { health_status: { [Op.not]: "retired" } },
    attributes: ["id", "slug", "health_status", "rejection_rate", "edit_rate", "sample_count"],
  });

  const by_status: Record<string, number> = {};
  for (const t of all) {
    by_status[t.health_status] = (by_status[t.health_status] ?? 0) + 1;
  }

  const needs_attention = all
    .filter((t) => t.health_status === "degraded" || t.health_status === "paused")
    .map((t) => ({
      slug:          t.slug,
      health_status: t.health_status,
      rejection_rate: t.rejection_rate != null ? Number(t.rejection_rate) : null,
      edit_rate:      t.edit_rate      != null ? Number(t.edit_rate)      : null,
    }));

  return { by_status, needs_attention };
}
