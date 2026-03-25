// src/controllers/admin.ai.controller.ts
//
// Thin async handlers for the AI Control Center.
// Each handler: validates request params → calls service → returns JSON.
// Errors are forwarded to Express's errorHandler via next(err).

import { Request, Response, NextFunction } from "express";

import {
  getAiStatus,
  getAiReports,
  getAiReport,
  getAiTasks,
  getAiMemory,
  getLatestTelemetry,
  getLatestLLMResponse,
} from "../services/ai.service";

import { analyzeMarketplace }        from "../services/ai/ai.intelligence.service";
import { detectGrowthOpportunities } from "../services/ai/ai.growth.service";
import { analyzeSellerPerformance }  from "../services/ai/ai.seller.service";
import { detectMarketplaceRisks }    from "../services/ai/ai.risk.service";
import { monitorAgents }             from "../services/ai/ai.supervisor.service";
import { runBrainCycle }             from "../services/ai/ai.brain.cycle.service";

// ─────────────────────────────────────────────────────────
// Existing handlers (unchanged)
// ─────────────────────────────────────────────────────────

export async function handleGetAiOverview(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const [status, reports, tasks, memory] = await Promise.all([
      getAiStatus(),
      getAiReports(),
      getAiTasks(),
      getAiMemory(),
    ]);
    res.json({ ok: true, ai: { status, reports, tasks, memory } });
  } catch (err) {
    next(err);
  }
}

export async function handleGetAiStatus(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getAiStatus();
    res.json({ ok: true, ai: data });
  } catch (err) {
    next(err);
  }
}

export async function handleGetAiReports(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const type    = typeof req.query.type === "string" ? req.query.type : undefined;
    const reports = await getAiReports(type);
    res.json({ ok: true, count: reports.length, reports });
  } catch (err) {
    next(err);
  }
}

export async function handleGetAiReport(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const filename = String(req.params.filename);
    const report   = await getAiReport(filename);
    res.json({ ok: true, report });
  } catch (err) {
    next(err);
  }
}

export async function handleGetAiTasks(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const tasks = await getAiTasks();
    res.json({ ok: true, tasks });
  } catch (err) {
    next(err);
  }
}

export async function handleGetAiMemory(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const memory = await getAiMemory();
    res.json({ ok: true, memory });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────
// New Brain handlers
// ─────────────────────────────────────────────────────────

export async function handleGetIntelligence(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await analyzeMarketplace();
    res.json({ ok: true, intelligence: data });
  } catch (err) {
    next(err);
  }
}

export async function handleGetOpportunities(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await detectGrowthOpportunities();
    res.json({ ok: true, growth: data });
  } catch (err) {
    next(err);
  }
}

export async function handleGetSellers(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await analyzeSellerPerformance();
    res.json({ ok: true, sellers: data });
  } catch (err) {
    next(err);
  }
}

export async function handleGetRisks(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await detectMarketplaceRisks();
    res.json({ ok: true, risks: data });
  } catch (err) {
    next(err);
  }
}

export async function handleGetDecisions(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Decisions live in the existing memory system
    const memory = await getAiMemory();
    res.json({ ok: true, decisions: memory.decisions });
  } catch (err) {
    next(err);
  }
}

export async function handleGetAgents(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await monitorAgents();
    res.json({ ok: true, supervisor: data });
  } catch (err) {
    next(err);
  }
}

export async function handleGetTelemetry(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const telemetry = await getLatestTelemetry();
    res.json({ ok: true, telemetry });
  } catch (err) {
    next(err);
  }
}

export async function handleGetLLMResponse(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const llmResponse = await getLatestLLMResponse();
    if (!llmResponse) {
      res.json({ ok: false, message: "No LLM response yet" });
      return;
    }
    res.json({ ok: true, llm_response: llmResponse });
  } catch (err) {
    next(err);
  }
}

export async function handleRunBrainCycle(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await runBrainCycle();
    res.json({ ok: true, cycle: result });
  } catch (err) {
    next(err);
  }
}
