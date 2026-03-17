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
  // Brain — action endpoint
  handleRunBrainCycle,
} from "../controllers/admin.ai.controller";

import { requireRole } from "../middleware/auth";

const router = Router();

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
// Brain — trigger endpoint
// POST /api/admin/ai/brain  → run the full brain cycle now
// ─────────────────────────────────────────────────────────

router.post("/brain", handleRunBrainCycle);

export default router;
