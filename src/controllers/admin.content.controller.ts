// src/controllers/admin.content.controller.ts
//
// Thin async handlers for the AI Content Intelligence endpoints.
// All business logic lives in the service layer.
// Pattern: validate → call service → return JSON. Errors forwarded via next(err).

import { Request, Response, NextFunction } from "express";
import { z } from "zod";

import AiContentItem from "../models/AiContentItem.model";
import AiContentVariant from "../models/AiContentVariant.model";
import { ContentItemService } from "../services/content/ContentItemService";
import { generateVariant } from "../services/content/ContentGenerationService";
import {
  runGuardrails,
  applyGuardrailResult,
} from "../services/content/ContentGuardrailService";
import {
  scoreContent,
  applyScoring,
} from "../services/content/ContentScoringService";
import {
  approveVariant,
  editAndApproveVariant,
  rejectVariant,
  publishVariant,
} from "../services/content/ContentReviewService";
import { Op } from "sequelize";
import type { ContentType, SubjectType } from "../types/content.types";
import { REJECTION_REASONS } from "../types/content.types";
import { analyzeLast7Days } from "../services/content/ContentLearningService";
import { buildPriorityQueue } from "../services/content/ContentPriorityService";
import { extractPatterns }    from "../services/content/ContentPatternService";
import {
  evaluateTemplateHealth,
  activateTemplate,
  retireTemplate,
  getTemplateHealthSummary,
} from "../services/content/TemplateHealthService";
import { refreshTemplateStats }      from "../services/content/TemplatePerformanceService";
import { proposeEvolvedTemplates }   from "../services/content/PromptEvolutionService";
import { updatePatternMemory }        from "../services/content/EditLearningService";

// ─── Request schemas ─────────────────────────────────────────────────────────

const generateSchema = z.object({
  subject_type: z.enum(["product"]),
  subject_id:   z.string().uuid("subject_id must be a valid UUID"),
  content_type: z.enum(["caption", "product_description", "image_prompt_brief"]),
  priority:     z.number().int().min(1).max(10).optional(),
});

const reviewSchema = z.object({
  action: z.enum(["approved", "edited_and_approved", "rejected"]),
  // Required when action = edited_and_approved
  content_body: z.string().min(10).max(2000).optional(),
  // Required when action = rejected
  rejection_reason: z
    .enum(REJECTION_REASONS as unknown as [string, ...string[]])
    .optional(),
  rejection_note: z.string().max(500).optional(),
});

// ─── POST /api/admin/ai/content/generate ─────────────────────────────────────

export async function handleGenerate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok:     false,
        code:   "VALIDATION_ERROR",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const { subject_type, subject_id, content_type, priority } = parsed.data;

    // Verify subject exists before creating any records
    const { default: Product } = await import("../models/product.model");
    const product = await Product.findByPk(subject_id, {
      attributes: ["id", "nombre", "precio"],
    });
    if (!product) {
      res.status(404).json({ ok: false, code: "PRODUCT_NOT_FOUND" });
      return;
    }

    // Find or create the content item (idempotent)
    const { item } = await ContentItemService.findOrCreate(
      subject_type as SubjectType,
      subject_id,
      content_type as ContentType,
      priority
    );

    // Enforce cooldown and state rules
    try {
      ContentItemService.assertCanGenerate(item);
    } catch (err: any) {
      const code = err.message.split(":")[0];
      res
        .status(err.statusCode ?? 409)
        .json({ ok: false, code, message: err.message });
      return;
    }

    // ── Generation pipeline ───────────────────────────────────────────────

    await ContentItemService.markGenerating(item);

    const genResult = await generateVariant(item);

    // Always stamp cooldown, regardless of generation outcome
    await ContentItemService.stampGeneration(item);

    if (!genResult.success) {
      await ContentItemService.markBlocked(item);
      res.status(200).json({
        ok:               false,
        code:             "GENERATION_FAILED",
        rejection_reason: genResult.rejectionReason,
        variant_id:       genResult.variant.id,
      });
      return;
    }

    // ── Guardrails ────────────────────────────────────────────────────────

    const guardrailResult = await runGuardrails(
      genResult.variant,
      subject_id
    );
    await applyGuardrailResult(genResult.variant, guardrailResult);

    if (!guardrailResult.passed) {
      // Only mark item as blocked if every variant for this item has failed
      const totalVariants   = await AiContentVariant.count({
        where: { content_item_id: item.id },
      });
      const blockedVariants = await AiContentVariant.count({
        where: { content_item_id: item.id, status: "guardrail_failed" },
      });

      if (totalVariants === blockedVariants) {
        await ContentItemService.markBlocked(item);
      } else {
        await item.update({ status: "in_review" });
      }

      res.status(200).json({
        ok:         false,
        code:       "GUARDRAIL_FAILED",
        failures:   guardrailResult.failures,
        variant_id: genResult.variant.id,
      });
      return;
    }

    // ── Scoring ───────────────────────────────────────────────────────────

    const scoreResult = scoreContent(
      genResult.variant.content_body,
      content_type as ContentType,
      { productName: product.nombre, precio: Number(product.precio) }
    );
    await applyScoring(genResult.variant, scoreResult);

    // Reload to get DB-rounded score values
    await genResult.variant.reload();

    if (scoreResult.should_discard) {
      await item.update({ status: "pending" });
      res.status(200).json({
        ok:               false,
        code:             "BELOW_THRESHOLD",
        generation_score: scoreResult.generation_score,
        variant_id:       genResult.variant.id,
      });
      return;
    }

    await ContentItemService.markInReview(item);

    res.status(200).json({
      ok:         true,
      code:       "QUEUED_FOR_REVIEW",
      variant_id: genResult.variant.id,
      item_id:    item.id,
      queue_flag: scoreResult.queue_flag,
      scores: {
        generation_score:      genResult.variant.generation_score,
        score_specificity:     genResult.variant.score_specificity,
        score_brand_alignment: genResult.variant.score_brand_alignment,
        score_readability:     genResult.variant.score_readability,
        score_seo_coverage:    genResult.variant.score_seo_coverage,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/admin/ai/content/review-queue ──────────────────────────────────

export async function handleReviewQueue(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Fetch queued variants
    const variants = await AiContentVariant.findAll({
      where:  { status: "queued_for_review" },
      order:  [["generation_score", "DESC NULLS LAST"] as any],
      limit:  50,
    });

    if (variants.length === 0) {
      res.json({ ok: true, count: 0, queue: [] });
      return;
    }

    // Fetch their parent items in one query (avoids N+1)
    const itemIds = [...new Set(variants.map((v) => v.content_item_id))];
    const items   = await AiContentItem.findAll({
      where:      { id: itemIds },
      attributes: ["id", "subject_type", "subject_id", "content_type", "priority"],
    });
    const itemMap = new Map(items.map((i) => [i.id, i]));

    // Sort: priority ASC, then queue_flag ('ready' > 'needs_attention'), then score DESC
    const sorted = [...variants].sort((a, b) => {
      const itemA = itemMap.get(a.content_item_id);
      const itemB = itemMap.get(b.content_item_id);
      const pA    = itemA?.priority ?? 5;
      const pB    = itemB?.priority ?? 5;
      if (pA !== pB) return pA - pB;

      const flagOrder = { ready: 0, needs_attention: 1, null: 2 };
      const fA = flagOrder[(a.queue_flag ?? "null") as keyof typeof flagOrder] ?? 2;
      const fB = flagOrder[(b.queue_flag ?? "null") as keyof typeof flagOrder] ?? 2;
      if (fA !== fB) return fA - fB;

      return (Number(b.generation_score) || 0) - (Number(a.generation_score) || 0);
    });

    res.json({
      ok:    true,
      count: sorted.length,
      queue: sorted.map((v) => ({
        variant_id:    v.id,
        content_body:  v.content_body,
        word_count:    v.word_count,
        language:      v.language,
        model_used:    v.model_used,
        template_id:   v.template_id,
        queue_flag:    v.queue_flag,
        generated_at:  v.generated_at,
        cost_usd:      v.cost_usd,
        scores: {
          generation_score:      v.generation_score,
          score_specificity:     v.score_specificity,
          score_brand_alignment: v.score_brand_alignment,
          score_readability:     v.score_readability,
          score_seo_coverage:    v.score_seo_coverage,
        },
        item: itemMap.get(v.content_item_id) ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/admin/ai/content/review/:variant_id ───────────────────────────

export async function handleReview(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const variantId = req.params.variant_id;
    if (!variantId) {
      res.status(400).json({ ok: false, code: "MISSING_VARIANT_ID" });
      return;
    }

    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok:     false,
        code:   "VALIDATION_ERROR",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const { action, content_body, rejection_reason, rejection_note } =
      parsed.data;
    const reviewerId = req.user!.id;

    if (action === "approved") {
      const { variant, review } = await approveVariant(variantId, reviewerId);
      res.json({
        ok:        true,
        action,
        variant_id: variant.id,
        review_id:  review.id,
        status:     variant.status,
      });
      return;
    }

    if (action === "edited_and_approved") {
      if (!content_body) {
        res.status(400).json({
          ok:      false,
          code:    "CONTENT_BODY_REQUIRED",
          message: "content_body is required for edited_and_approved",
        });
        return;
      }
      const { variant, review } = await editAndApproveVariant(
        variantId,
        reviewerId,
        content_body
      );
      res.json({
        ok:        true,
        action,
        variant_id: variant.id,
        review_id:  review.id,
        status:     variant.status,
      });
      return;
    }

    if (action === "rejected") {
      if (!rejection_reason) {
        res.status(400).json({
          ok:      false,
          code:    "REJECTION_REASON_REQUIRED",
          message: "rejection_reason is required for action=rejected",
        });
        return;
      }
      const { variant, review } = await rejectVariant(
        variantId,
        reviewerId,
        rejection_reason as any,
        rejection_note
      );
      res.json({
        ok:        true,
        action,
        variant_id: variant.id,
        review_id:  review.id,
        status:     variant.status,
      });
      return;
    }

    res.status(400).json({ ok: false, code: "UNKNOWN_ACTION" });
  } catch (err: any) {
    if (err.statusCode) {
      res.status(err.statusCode).json({ ok: false, code: err.message });
      return;
    }
    next(err);
  }
}

// ─── POST /api/admin/ai/content/:variant_id/publish ──────────────────────────

export async function handlePublish(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const variantId = req.params.variant_id;
    if (!variantId) {
      res.status(400).json({ ok: false, code: "MISSING_VARIANT_ID" });
      return;
    }

    const { variant, item } = await publishVariant(variantId);

    res.json({
      ok:           true,
      variant_id:   variant.id,
      item_id:      item.id,
      published_at: variant.published_at,
      item_status:  item.status,
    });
  } catch (err: any) {
    if (err.statusCode) {
      res.status(err.statusCode).json({ ok: false, code: err.message });
      return;
    }
    next(err);
  }
}

// ─── GET /api/admin/ai/content/performance ────────────────────────────────────

export async function handlePerformanceSummary(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const report = await analyzeLast7Days();
    res.json({ ok: true, report });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/admin/ai/content/optimization ───────────────────────────────────
//
// Returns the live prioritized generation queue + patterns + anomalies.
// Computed on demand (no cache) — designed for infrequent admin polling.
// Query param: ?patterns=true to include full pattern analysis (heavier query).

export async function handleOptimizationQueue(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const includePatterns = req.query.patterns === "true";

    const [queue, patterns] = await Promise.all([
      buildPriorityQueue(),
      includePatterns ? extractPatterns() : Promise.resolve(null),
    ]);

    res.json({
      ok: true,
      ...queue,
      ...(patterns ? { patterns } : {}),
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/admin/ai/content/optimization/run ─────────────────────────────
//
// Human-triggered batch generation from the priority queue.
// Body: { limit?: number }  (default: 3, max: config.queue.max_items_per_run)
//
// Each item in the queue goes through the full pipeline:
//   findOrCreate item → assertCanGenerate → generate → guardrail → score → queue for review
//
// Human review is still required before any content is published.
// Returns per-item results so the admin panel can show a summary.

const runSchema = z.object({
  limit: z.number().int().min(1).max(20).optional().default(3),
});

export async function handleRunOptimizer(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = runSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, code: "VALIDATION_ERROR", errors: parsed.error.flatten() });
      return;
    }

    const { limit } = parsed.data;

    // Build live priority queue
    const optimizationQueue = await buildPriorityQueue();

    // Respect daily budget
    const effectiveLimit = Math.min(limit, optimizationQueue.budget.remaining);
    if (effectiveLimit === 0) {
      res.status(200).json({
        ok:      false,
        code:    "BUDGET_EXHAUSTED",
        message: `Daily generation budget (${optimizationQueue.budget.limit}) already used.`,
        budget:  optimizationQueue.budget,
      });
      return;
    }

    // Take only items that can be generated
    const targets = optimizationQueue.queue
      .filter((e) => e.can_generate)
      .slice(0, effectiveLimit);

    if (targets.length === 0) {
      res.status(200).json({
        ok:    false,
        code:  "QUEUE_EMPTY",
        message: "No eligible items in priority queue.",
        budget: optimizationQueue.budget,
      });
      return;
    }

    // Run generation pipeline for each target
    const results: Array<{
      product_id:   string;
      content_type: string;
      priority_score: number;
      outcome:      string;
      variant_id:   string | null;
      detail:       string;
    }> = [];

    const { default: Product } = await import("../models/product.model");

    for (const target of targets) {
      try {
        // Verify product still exists
        const product = await Product.findByPk(target.product_id, {
          attributes: ["id", "nombre", "precio"],
        });
        if (!product) {
          results.push({ product_id: target.product_id, content_type: target.content_type, priority_score: target.priority_score, outcome: "skipped", variant_id: null, detail: "product_not_found" });
          continue;
        }

        // Find or create content item
        const { item } = await ContentItemService.findOrCreate(
          "product" as SubjectType,
          target.product_id,
          target.content_type as ContentType
        );

        // State guard
        try {
          ContentItemService.assertCanGenerate(item);
        } catch (err: any) {
          results.push({ product_id: target.product_id, content_type: target.content_type, priority_score: target.priority_score, outcome: "skipped", variant_id: null, detail: err.message });
          continue;
        }

        // Generation pipeline
        await ContentItemService.markGenerating(item);
        const genResult = await generateVariant(item);
        await ContentItemService.stampGeneration(item);

        if (!genResult.success) {
          await ContentItemService.markBlocked(item);
          results.push({ product_id: target.product_id, content_type: target.content_type, priority_score: target.priority_score, outcome: "generation_failed", variant_id: genResult.variant.id, detail: genResult.rejectionReason ?? "unknown" });
          continue;
        }

        // Guardrails
        const guardrailResult = await runGuardrails(genResult.variant, target.product_id);
        await applyGuardrailResult(genResult.variant, guardrailResult);

        if (!guardrailResult.passed) {
          await ContentItemService.markBlocked(item);
          results.push({ product_id: target.product_id, content_type: target.content_type, priority_score: target.priority_score, outcome: "guardrail_failed", variant_id: genResult.variant.id, detail: guardrailResult.failures.join(",") });
          continue;
        }

        // Scoring
        const scoreResult = scoreContent(
          genResult.variant.content_body,
          target.content_type as ContentType,
          { productName: product.nombre, precio: Number(product.precio) }
        );
        await applyScoring(genResult.variant, scoreResult);
        await genResult.variant.reload();

        if (scoreResult.should_discard) {
          await item.update({ status: "pending" });
          results.push({ product_id: target.product_id, content_type: target.content_type, priority_score: target.priority_score, outcome: "below_threshold", variant_id: genResult.variant.id, detail: `score:${scoreResult.generation_score}` });
          continue;
        }

        await ContentItemService.markInReview(item);
        results.push({ product_id: target.product_id, content_type: target.content_type, priority_score: target.priority_score, outcome: "queued_for_review", variant_id: genResult.variant.id, detail: `score:${scoreResult.generation_score} flag:${scoreResult.queue_flag}` });

      } catch (itemErr: any) {
        results.push({ product_id: target.product_id, content_type: target.content_type, priority_score: target.priority_score, outcome: "error", variant_id: null, detail: itemErr.message });
      }
    }

    const succeeded = results.filter((r) => r.outcome === "queued_for_review").length;

    res.json({
      ok:           true,
      triggered:    targets.length,
      queued:       succeeded,
      budget:       optimizationQueue.budget,
      results,
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/admin/ai/content/templates ─────────────────────────────────────
//
// Returns all non-retired templates with health stats.
// Useful for admin visibility into the active template ecosystem.

export async function handleTemplateList(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { default: AiContentTemplate } = await import("../models/AiContentTemplate.model");
    const summary = await getTemplateHealthSummary();

    const templates = await AiContentTemplate.findAll({
      where: { health_status: { [Op.not]: "retired" } },
      order: [["content_type", "ASC"], ["template_version", "DESC"]],
      attributes: [
        "id", "slug", "template_key", "template_version", "content_type",
        "health_status", "is_active", "sample_count",
        "generation_score_avg", "performance_score_avg",
        "rejection_rate", "edit_rate",
        "paused_at", "pause_reason",
        "evolved_from_id", "evolution_reason", "expected_improvement",
        "approved_at", "created_at",
      ],
    });

    res.json({ ok: true, summary, templates });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/admin/ai/content/templates/candidates ──────────────────────────
//
// Returns candidate templates awaiting human approval.
// Each candidate has evolution_reason, expected_improvement, and evolution_changes.

export async function handleTemplateCandidates(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { default: AiContentTemplate } = await import("../models/AiContentTemplate.model");

    const candidates = await AiContentTemplate.findAll({
      where:  { health_status: "candidate" },
      order:  [["created_at", "DESC"]],
      attributes: [
        "id", "slug", "template_key", "template_version", "content_type",
        "user_prompt_template", "system_prompt",
        "evolved_from_id", "evolution_reason", "evolution_changes", "expected_improvement",
        "created_at",
      ],
    });

    res.json({ ok: true, count: candidates.length, candidates });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/admin/ai/content/templates/:id/approve ────────────────────────
//
// Promotes a candidate template to active. Requires human reviewer identity.
// The promoted template becomes eligible for the 80/20 exploitation/exploration selector.

export async function handleApproveTemplate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ ok: false, code: "MISSING_TEMPLATE_ID" });
      return;
    }

    const template = await activateTemplate(id, req.user!.id);

    res.json({
      ok:            true,
      template_id:   template.id,
      slug:          template.slug,
      health_status: template.health_status,
      approved_at:   template.approved_at,
    });
  } catch (err: any) {
    if (err.statusCode) {
      res.status(err.statusCode).json({ ok: false, code: err.message });
      return;
    }
    next(err);
  }
}

// ─── POST /api/admin/ai/content/templates/:id/reject ─────────────────────────
//
// Retires a candidate (or paused/degraded) template. Irreversible.
// Prevents the template from being used in future generation cycles.

export async function handleRejectTemplate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ ok: false, code: "MISSING_TEMPLATE_ID" });
      return;
    }

    const template = await retireTemplate(id);

    res.json({
      ok:            true,
      template_id:   template.id,
      slug:          template.slug,
      health_status: template.health_status,
    });
  } catch (err: any) {
    if (err.statusCode) {
      res.status(err.statusCode).json({ ok: false, code: err.message });
      return;
    }
    next(err);
  }
}

// ─── POST /api/admin/ai/content/templates/adapt ──────────────────────────────
//
// Runs the full TypeScript adaptation pipeline server-side.
// Called by run-content-adaptation.js when ADAPTER_API_ENABLED=true.
// Can also be triggered manually from the admin panel.
//
// Pipeline (in order):
//   1. Refresh template performance stats
//   2. Evaluate template health + apply transitions
//   3. Extract edit patterns → update content-patterns.json
//   4. Propose evolved candidate templates if signals justify it

export async function handleRunAdaptation(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Step 1: Refresh template performance metrics
    const statsRefreshed = await refreshTemplateStats();

    // Step 2: Evaluate health + apply transitions
    const transitions = await evaluateTemplateHealth();

    // Step 3: Extract edit patterns + write memory file
    const patterns = await updatePatternMemory();

    // Step 4: Propose evolved templates
    const proposals = await proposeEvolvedTemplates();

    const proposed = proposals.filter((p) => p.proposed);
    const skipped  = proposals.filter((p) => !p.proposed);

    res.json({
      ok: true,
      stats_refreshed:      statsRefreshed.length,
      health_transitions:   transitions.map((t) => ({
        slug:        t.slug,
        from:        t.from_status,
        to:          t.to_status,
        reason:      t.reason,
      })),
      pattern_summary: {
        edit_distributions_count: patterns.edit_distributions.length,
        high_churn_openings_count: patterns.high_churn_openings.length,
        winning_hooks_count:      patterns.winning_hooks.length,
      },
      evolution: {
        proposed: proposed.map((p) => ({ content_type: p.content_type, slug: p.slug, reason: p.reason })),
        skipped:  skipped.map((p)  => ({ content_type: p.content_type, reason: p.reason })),
      },
    });
  } catch (err) {
    next(err);
  }
}
