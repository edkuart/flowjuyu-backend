// src/services/ai/ai.supervisor.service.ts
//
// Monitors agent activity by reading config and filesystem state.
// No DB access needed — purely filesystem-based.

import path from "path";
import fs   from "fs";

import {
  AI_BASE,
  MEMORY_DIR,
  CONFIG_DIR,
  INBOX_DIR,
  safeReadJson,
  safeListDir,
  nowIso,
} from "./ai.fs.utils";

import type {
  AgentStatus,
  SupervisorReport,
  AiSession,
  AiAgentConfig,
} from "../../types/ai.types";

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

const INPROG_DIR  = path.join(AI_BASE, "tasks", "in-progress");
const DONE_DIR    = path.join(AI_BASE, "tasks", "done");
const REPORTS_DIR = path.join(AI_BASE, "reports", "daily");

async function countFiles(dir: string): Promise<number> {
  const files = await safeListDir(dir);
  return files.length;
}

/**
 * Finds the most recent mtime across all files in a directory.
 * Returns null if the directory is empty or unreadable.
 */
async function latestMtime(dir: string): Promise<string | null> {
  try {
    const entries = await fs.promises.readdir(dir);
    if (entries.length === 0) return null;

    const mtimes = await Promise.all(
      entries.map(async (f) => {
        try {
          const stat = await fs.promises.stat(path.join(dir, f));
          return stat.mtimeMs;
        } catch {
          return 0;
        }
      })
    );

    const latest = Math.max(...mtimes);
    return latest > 0 ? new Date(latest).toISOString() : null;
  } catch {
    return null;
  }
}

/**
 * Derives an agent's last activity from the filesystem timestamps
 * of the relevant report/task directories.
 *
 * This is a heuristic — not tied to the agents' actual execution logs.
 */
async function resolveLastActivity(agentName: string): Promise<string | null> {
  // Map agent names to the directories they typically write to
  switch (agentName) {
    case "analytics-agent":
    case "growth-agent":
      return latestMtime(REPORTS_DIR);

    case "supervisor":
    case "dev-agent":
      return latestMtime(INPROG_DIR) ?? latestMtime(INBOX_DIR);

    case "memory-agent":
      return latestMtime(MEMORY_DIR);

    default:
      return latestMtime(REPORTS_DIR);
  }
}

// ─────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────

export async function monitorAgents(): Promise<SupervisorReport> {
  console.log("[supervisor] Evaluating agent status…");

  const [
    agentsConfigRaw,
    sessions,
    totalTasksDone,
    totalReports,
    inboxCount,
    inProgressCount,
  ] = await Promise.all([
    safeReadJson<{ agents?: AiAgentConfig[] }>(
      path.join(CONFIG_DIR, "agents.json"),
      { agents: [] }
    ),
    safeReadJson<AiSession>(
      path.join(MEMORY_DIR, "sessions.json"),
      { cycles_run: 0, last_run: null, tasks_completed: 0, reports_generated: 0 }
    ),
    countFiles(DONE_DIR),
    countFiles(REPORTS_DIR),
    countFiles(INBOX_DIR),
    countFiles(INPROG_DIR),
  ]);

  const configuredAgents: AiAgentConfig[] = agentsConfigRaw.agents ?? [];

  // Build status for each known agent
  const agentStatuses: AgentStatus[] = await Promise.all(
    configuredAgents.map(async (cfg): Promise<AgentStatus> => {
      const lastActivity = await resolveLastActivity(cfg.name);

      let status: AgentStatus["status"];
      if (!cfg.enabled) {
        status = "disabled";
      } else if (lastActivity) {
        const hoursSince = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60);
        status = hoursSince < 25 ? "active" : "idle";
      } else {
        status = "idle";
      }

      return {
        name:              cfg.name,
        enabled:           cfg.enabled,
        role:              cfg.role,
        status,
        tasks_completed:   sessions.tasks_completed,   // global counter from sessions
        reports_generated: sessions.reports_generated, // global counter from sessions
        last_activity:     lastActivity,
      };
    })
  );

  const result: SupervisorReport = {
    agents:        agentStatuses,
    total_tasks:   totalTasksDone + inboxCount + inProgressCount,
    total_reports: totalReports,
    evaluated_at:  nowIso(),
  };

  console.log(
    `[supervisor] Done — ${agentStatuses.length} agents evaluated, ` +
    `${agentStatuses.filter((a) => a.status === "active").length} active`
  );

  return result;
}
