import { Router } from "express";

import {
  // Existing
  handleGetAiOverview,
  handleGetAiStatus,
  handleGetAiReports,
  handleGetAiReport,
  handleGetAiTasks,
  handleGetAiMemory,
  // Brain — read endpoints
  handleGetIntelligence,
  handleGetOpportunities,
  handleGetSellers,
  handleGetRisks,
  handleGetDecisions,
  handleGetAgents,
  // Telemetry artifact endpoint
  handleGetTelemetry,
  // LLM response artifact endpoint
  handleGetLLMResponse,
  // Brain — action endpoint
  handleRunBrainCycle,
} from "../controllers/admin.ai.controller";

import {
  handlePublishedContent,
  handleMarkUsed,
} from "../controllers/admin.content.controller";

import { requireRole } from "../middleware/auth";

const router: ReturnType<typeof Router> = Router();

// All routes require admin role.
router.use(requireRole("admin"));

// ─────────────────────────────────────────────────────────
// Existing endpoints (unchanged)
// ─────────────────────────────────────────────────────────

router.get("/overview",          handleGetAiOverview);
router.get("/status",            handleGetAiStatus);
router.get("/reports",           handleGetAiReports);
router.get("/reports/:filename", handleGetAiReport);
router.get("/tasks",             handleGetAiTasks);
router.get("/memory",            handleGetAiMemory);

// ─────────────────────────────────────────────────────────
// Brain — read endpoints
// GET /api/admin/ai/intelligence   → marketplace analysis snapshot
// GET /api/admin/ai/opportunities  → growth opportunities
// GET /api/admin/ai/sellers        → seller performance
// GET /api/admin/ai/risks          → risk detection
// GET /api/admin/ai/decisions      → AI decision history
// GET /api/admin/ai/agents         → agent supervisor status
// ─────────────────────────────────────────────────────────

router.get("/intelligence",  handleGetIntelligence);
router.get("/opportunities", handleGetOpportunities);
router.get("/sellers",       handleGetSellers);
router.get("/risks",         handleGetRisks);
router.get("/decisions",     handleGetDecisions);
router.get("/agents",        handleGetAgents);

// ─────────────────────────────────────────────────────────
// Telemetry — read latest artifact
// GET /api/admin/ai/telemetry → latest telemetry-*.json artifact
// Contains: filtered_metrics, trends, metric_conflicts, daily_history
// ─────────────────────────────────────────────────────────

router.get("/telemetry",     handleGetTelemetry);
router.get("/llm-response", handleGetLLMResponse);

// ─────────────────────────────────────────────────────────
// Brain — trigger endpoint
// POST /api/admin/ai/brain  → run the full brain cycle now
// ─────────────────────────────────────────────────────────

router.post("/brain", handleRunBrainCycle);

// ─────────────────────────────────────────────────────────
// Distribution + Analytics
// GET  /api/admin/ai/published-content → approved/published variants with product info
// POST /api/admin/ai/mark-used         → record variant distribution to a platform
// ─────────────────────────────────────────────────────────

router.get("/published-content", handlePublishedContent);
router.post("/mark-used",        handleMarkUsed);

export default router;
