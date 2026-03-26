// src/routes/admin.content.routes.ts
//
// AI Content Intelligence routes — admin only.
// Mounted at /api/admin/ai/content in app.ts.
//
// All routes require admin role (enforced by requireRole at router level).
// No content is ever published without an explicit human review action.

import { Router } from "express";
import { requireRole } from "../middleware/auth";
import {
  handleGenerate,
  handleReviewQueue,
  handleReview,
  handlePublish,
  handlePerformanceSummary,
  handleOptimizationQueue,
  handleRunOptimizer,
  handleTemplateList,
  handleTemplateCandidates,
  handleApproveTemplate,
  handleRejectTemplate,
  handleRunAdaptation,
} from "../controllers/admin.content.controller";

const router: ReturnType<typeof Router> = Router();

router.use(requireRole("admin"));

// POST /api/admin/ai/content/generate
// Trigger generation for a specific product + content_type.
// Response includes generation outcome, guardrail result, and score routing.
router.post("/generate", handleGenerate);

// GET /api/admin/ai/content/review-queue
// Returns all variants currently awaiting human review.
// Sorted by: item priority ASC, queue_flag ('ready' first), score DESC.
router.get("/review-queue", handleReviewQueue);

// POST /api/admin/ai/content/review/:variant_id
// Human review action: approve | edited_and_approved | rejected.
// Atomically updates variant + item status + creates review log record.
router.post("/review/:variant_id", handleReview);

// POST /api/admin/ai/content/:variant_id/publish
// Marks an approved variant as published and links it to the content item.
// Archives any previously published variant for the same item.
router.post("/:variant_id/publish", handlePublish);

// GET /api/admin/ai/content/performance
// Returns last 7-day learning report: content-type stats, per-item repeat/stop
// recommendations, rejection patterns, edit rate, top/worst performers.
// Read-only. Powered by ai_content_performance_daily (written by the nightly runner).
router.get("/performance", handlePerformanceSummary);

// GET /api/admin/ai/content/optimization
// Returns the live prioritized generation queue with priority factors, anomalies,
// budget state, and per-item block reasons.
// Optional: ?patterns=true to include full ContentPatternService analysis.
// Computed on demand — safe to call frequently, no side effects.
router.get("/optimization", handleOptimizationQueue);

// POST /api/admin/ai/content/optimization/run
// Human-triggered batch generation from the top of the priority queue.
// Body: { limit?: number }  — how many items to process (default 3, max 20).
// Each item goes through the full pipeline: generate → guardrail → score → review queue.
// DOES NOT publish. Human review is required before any content goes live.
router.post("/optimization/run", handleRunOptimizer);

// GET /api/admin/ai/content/templates
// Lists all non-retired templates with health stats and performance metrics.
// Includes a health summary (by_status counts + needs_attention list).
router.get("/templates", handleTemplateList);

// GET /api/admin/ai/content/templates/candidates
// Lists candidate templates proposed by PromptEvolutionService.
// Each candidate shows: evolution_reason, expected_improvement, evolution_changes, diff vs base.
// Admin must explicitly approve or reject — candidates are NEVER auto-deployed.
router.get("/templates/candidates", handleTemplateCandidates);

// POST /api/admin/ai/content/templates/adapt
// Runs the full TypeScript adaptation pipeline: refresh stats → health evaluation →
// edit pattern extraction → prompt evolution proposals.
// Also called by run-content-adaptation.js when ADAPTER_API_ENABLED=true.
router.post("/templates/adapt", handleRunAdaptation);

// POST /api/admin/ai/content/templates/:id/approve
// Promotes a candidate template to active status. Human-only action.
// The template becomes immediately eligible for generation via the 80/20 selector.
router.post("/templates/:id/approve", handleApproveTemplate);

// POST /api/admin/ai/content/templates/:id/reject
// Retires a candidate (or paused/degraded) template. Irreversible.
router.post("/templates/:id/reject", handleRejectTemplate);

export default router;
