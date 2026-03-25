// src/services/ai.service.ts
//
// Read-only service layer for the Flowjuyu AI Control Center.
//
// Design principles:
//  - All filesystem access is async (fs/promises). No sync calls.
//  - The service never throws unhandled exceptions. All errors are caught
//    and either returned as typed AiServiceErrors or swallowed with a
//    safe fallback value, depending on whether the error is actionable.
//  - File path construction always resolves inside the AI_BASE directory.
//    Filename validation blocks directory traversal before any path join.
//  - Reports metadata is cached in memory with a short TTL to avoid
//    hammering the filesystem on every dashboard refresh.
//  - This file contains zero write operations.

import fs   from "fs";
import path from "path";

import {
  VALID_REPORT_TYPES,
  AiServiceError,
  type AiReportType,
  type AiReportMeta,
  type AiReportFull,
  type AiTask,
  type AiTaskEntry,
  type AiTaskQueue,
  type AiMemory,
  type AiSession,
  type AiStatus,
  type AiAgentConfig,
  type MarketplaceMemoryEntry,
  type ImprovementsMemoryEntry,
} from "../types/ai.types";

// ─────────────────────────────────────────────────────────
// Base paths
// ─────────────────────────────────────────────────────────

const AI_BASE      = path.resolve(process.cwd(), "flow-ai");
const REPORTS_DIR  = path.join(AI_BASE, "reports", "daily");
const MEMORY_DIR   = path.join(AI_BASE, "memory");
const CONFIG_DIR   = path.join(AI_BASE, "config");
const INBOX_DIR    = path.join(AI_BASE, "tasks", "inbox");
const INPROG_DIR   = path.join(AI_BASE, "tasks", "in-progress");
const DONE_DIR     = path.join(AI_BASE, "tasks", "done");
const ARTIFACTS_DIR = path.join(AI_BASE, "artifacts");

// ─────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────

// Only alphanumerics, hyphens, underscores, and dots.
// No slashes, no null bytes, no parent-directory sequences.
const SAFE_FILENAME_RE = /^[a-zA-Z0-9._-]+$/;

const VALID_REPORT_TYPE_SET = new Set<string>(VALID_REPORT_TYPES);

/**
 * Returns true if the filename is safe to use in a path.join() call
 * inside REPORTS_DIR. Rejects anything that could escape the directory.
 */
function isSafeFilename(filename: string): boolean {
  return (
    typeof filename === "string" &&
    filename.length > 0 &&
    filename.length < 200 &&
    SAFE_FILENAME_RE.test(filename) &&
    !filename.includes("..") &&
    !filename.includes("/") &&
    !filename.includes("\\") &&
    !filename.startsWith(".")
  );
}

/**
 * Returns true if the filename is an allowed report file.
 * Must be a safe filename AND end with ".md".
 */
function isAllowedReportFile(filename: string): boolean {
  return isSafeFilename(filename) && filename.endsWith(".md");
}

/**
 * Returns true if typeFilter is one of the known report type values.
 * Used to validate the ?type= query parameter.
 */
export function isValidReportType(value: string): value is AiReportType {
  return VALID_REPORT_TYPE_SET.has(value);
}

// ─────────────────────────────────────────────────────────
// Async filesystem helpers
// ─────────────────────────────────────────────────────────

/**
 * Returns true if the given path exists and is a directory.
 * Never throws.
 */
async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Lists files in a directory, sorted newest-first (reverse alphabetical).
 * Returns an empty array if the directory doesn't exist or can't be read.
 * Never throws.
 */
async function safeListDir(dirPath: string): Promise<string[]> {
  try {
    if (!(await dirExists(dirPath))) return [];
    const entries = await fs.promises.readdir(dirPath);
    return entries.filter((f) => f.length > 0).sort().reverse();
  } catch {
    return [];
  }
}

/**
 * Reads and JSON-parses a file. Returns `fallback` on any error.
 * Never throws.
 */
async function safeReadJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Reads a text file. Returns null on any error.
 * Never throws.
 */
async function safeReadText(filePath: string): Promise<string | null> {
  try {
    return await fs.promises.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────
// In-memory cache (reports metadata only)
//
// Reports on disk change at most twice a day (scheduler).
// Caching for 60 seconds is safe and removes filesystem
// pressure on busy admin dashboards that poll the status.
// ─────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000; // 60 seconds

interface CacheEntry<T> {
  data:      T;
  expiresAt: number;
}

class SimpleCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly ttl:   number;

  constructor(ttlMs = CACHE_TTL_MS) {
    this.ttl = ttlMs;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  set<T>(key: string, data: T): void {
    this.store.set(key, { data, expiresAt: Date.now() + this.ttl });
  }

  // Exposed for testing and for manual cache clearing if needed.
  clear(): void {
    this.store.clear();
  }
}

// Module-level singleton — one cache instance for the lifetime of the process.
const reportCache = new SimpleCache();

// ─────────────────────────────────────────────────────────
// Report metadata helpers
// ─────────────────────────────────────────────────────────

function inferReportType(filename: string): AiReportType {
  for (const t of VALID_REPORT_TYPES) {
    if (filename.startsWith(`${t}-`)) return t;
  }
  return "unknown";
}

/**
 * Extracts a date string from the filename.
 *
 * Date-named files:  analytics-2026-03-16.md  → "2026-03-16"
 * Timestamp files:   dev-task-1773678424741.md → ISO string from unix ms
 */
function inferReportDate(filename: string): string | null {
  const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) return dateMatch[1];

  const tsMatch = filename.match(/(\d{13})/);
  if (tsMatch) {
    const ts = parseInt(tsMatch[1], 10);
    if (!isNaN(ts)) return new Date(ts).toISOString();
  }

  return null;
}

async function buildReportMeta(filename: string, previewLength = 500): Promise<AiReportMeta> {
  const fullPath = path.join(REPORTS_DIR, filename);
  const content  = await safeReadText(fullPath);
  const preview  = content ? content.slice(0, previewLength).trim() : "";

  return {
    filename,
    type:    inferReportType(filename),
    date:    inferReportDate(filename),
    preview,
  };
}

// ─────────────────────────────────────────────────────────
// Public service methods
// ─────────────────────────────────────────────────────────

/**
 * Returns the overall AI system status:
 * session counters, task queue counts, agent config, and the
 * five most recent report summaries.
 *
 * The latest_reports list is cache-backed (60 s TTL).
 */
export async function getAiStatus(): Promise<AiStatus> {
  const [
    sessions,
    agentsRaw,
    inboxFiles,
    inProgFiles,
    doneFiles,
    allReportFiles,
  ] = await Promise.all([
    safeReadJson<AiSession>(
      path.join(MEMORY_DIR, "sessions.json"),
      { cycles_run: 0, last_run: null, tasks_completed: 0, reports_generated: 0 }
    ),
    safeReadJson<{ agents?: AiAgentConfig[] }>(
      path.join(CONFIG_DIR, "agents.json"),
      { agents: [] }
    ),
    safeListDir(INBOX_DIR),
    safeListDir(INPROG_DIR),
    safeListDir(DONE_DIR),
    safeListDir(REPORTS_DIR),
  ]);

  const agents: AiAgentConfig[] = (agentsRaw.agents ?? []).map((a) => ({
    name:    a.name,
    enabled: a.enabled,
    role:    a.role,
  }));

  // Use at most 5 most recent reports for the status summary.
  const recentFiles = allReportFiles
    .filter((f) => f.endsWith(".md"))
    .slice(0, 5);

  const cacheKey     = `status:latest_reports:${recentFiles.join(",")}`;
  let latest_reports = reportCache.get<AiReportMeta[]>(cacheKey);

  if (!latest_reports) {
    latest_reports = await Promise.all(
      recentFiles.map((f) => buildReportMeta(f, 200))
    );
    reportCache.set(cacheKey, latest_reports);
  }

  return {
    sessions,
    queue: {
      inbox:       inboxFiles.length,
      in_progress: inProgFiles.length,
      done:        doneFiles.length,
    },
    agents,
    latest_reports,
  };
}

/**
 * Returns metadata + preview for all reports, optionally filtered by type.
 *
 * typeFilter must be one of the VALID_REPORT_TYPES values. Passing an
 * unknown type throws AiServiceError(400) so the controller can return
 * a meaningful error to the client rather than an empty list.
 *
 * Results are cached per (type filter) key with a 60 s TTL.
 */
export async function getAiReports(typeFilter?: string): Promise<AiReportMeta[]> {
  if (typeFilter !== undefined && !isValidReportType(typeFilter)) {
    throw new AiServiceError(
      400,
      `Invalid report type "${typeFilter}". Valid types: ${VALID_REPORT_TYPES.join(", ")}`
    );
  }

  const cacheKey = `reports:${typeFilter ?? "all"}`;
  const cached   = reportCache.get<AiReportMeta[]>(cacheKey);
  if (cached) return cached;

  const allFiles = await safeListDir(REPORTS_DIR);

  const filtered = allFiles
    .filter((f) => f.endsWith(".md"))
    .filter((f) => !typeFilter || inferReportType(f) === typeFilter)
    .slice(0, 30);

  const results = await Promise.all(
    filtered.map((f) => buildReportMeta(f, 500))
  );

  reportCache.set(cacheKey, results);
  return results;
}

/**
 * Returns the full content of a single report file.
 *
 * Throws AiServiceError(400) if the filename is unsafe or not a .md file.
 * Throws AiServiceError(404) if the file does not exist.
 *
 * Full report content is NOT cached — it may be large and is requested
 * less frequently than the metadata list.
 */
export async function getAiReport(filename: string): Promise<AiReportFull> {
  if (!isAllowedReportFile(filename)) {
    throw new AiServiceError(
      400,
      "Invalid filename. Only .md report files are accessible."
    );
  }

  const fullPath = path.join(REPORTS_DIR, filename);

  // Verify existence explicitly to distinguish 404 from other I/O errors.
  let exists = false;
  try {
    await fs.promises.access(fullPath, fs.constants.R_OK);
    exists = true;
  } catch {
    exists = false;
  }

  if (!exists) {
    throw new AiServiceError(404, `Report not found: ${filename}`);
  }

  // safeReadText will not throw; if somehow it fails after the access
  // check, we treat it as a server error.
  const content = await safeReadText(fullPath);

  if (content === null) {
    throw new AiServiceError(500, `Could not read report: ${filename}`);
  }

  return {
    filename,
    type:    inferReportType(filename),
    content,
  };
}

/**
 * Returns the full task pipeline across all three stages.
 * Tasks that cannot be parsed (corrupt JSON) are included with task: null.
 */
export async function getAiTasks(): Promise<AiTaskQueue> {
  const [inboxFiles, inProgFiles, doneFiles] = await Promise.all([
    safeListDir(INBOX_DIR),
    safeListDir(INPROG_DIR),
    safeListDir(DONE_DIR),
  ]);

  async function readEntries(
    files: string[],
    dir: string,
    stage: AiTaskEntry["stage"]
  ): Promise<AiTaskEntry[]> {
    return Promise.all(
      files.map(async (file): Promise<AiTaskEntry> => {
        const task = await safeReadJson<AiTask | null>(
          path.join(dir, file),
          null
        );
        return { file, stage, task };
      })
    );
  }

  const [inbox, in_progress, done] = await Promise.all([
    readEntries(inboxFiles,  INBOX_DIR,  "pending"),
    readEntries(inProgFiles, INPROG_DIR, "in-progress"),
    readEntries(doneFiles,   DONE_DIR,   "done"),
  ]);

  return { inbox, in_progress, done };
}

/**
 * Returns the full contents of all five memory files.
 * Missing or corrupt files are returned as their empty fallback values.
 * Never throws.
 */
export async function getAiMemory(): Promise<AiMemory> {
  const [sessions, marketplace, improvements, bugs, decisions] =
    await Promise.all([
      safeReadJson<AiSession>(
        path.join(MEMORY_DIR, "sessions.json"),
        { cycles_run: 0, last_run: null, tasks_completed: 0, reports_generated: 0 }
      ),
      safeReadJson<MarketplaceMemoryEntry[]>(
        path.join(MEMORY_DIR, "marketplace.json"),
        []
      ),
      safeReadJson<ImprovementsMemoryEntry[]>(
        path.join(MEMORY_DIR, "improvements.json"),
        []
      ),
      safeReadJson<unknown[]>(path.join(MEMORY_DIR, "bugs.json"),      []),
      safeReadJson<unknown[]>(path.join(MEMORY_DIR, "decisions.json"), []),
    ]);

  return { sessions, marketplace, improvements, bugs, decisions };
}

// ─────────────────────────────────────────────────────────
// Telemetry artifact
// ─────────────────────────────────────────────────────────

/**
 * Returns the most recent telemetry artifact produced by the
 * telemetry-collector runner (flow-ai/artifacts/telemetry-*.json).
 *
 * Returns null when no artifact exists yet.
 * Never throws — callers receive null on any filesystem error.
 */
export async function getLatestTelemetry(): Promise<Record<string, unknown> | null> {
  const files = await safeListDir(ARTIFACTS_DIR);

  // safeListDir returns reverse-sorted (newest filename first).
  const latest = files.find(
    (f) => f.startsWith("telemetry-") && f.endsWith(".json")
  );

  if (!latest) return null;

  return safeReadJson<Record<string, unknown> | null>(
    path.join(ARTIFACTS_DIR, latest),
    null
  );
}

/**
 * Returns the most recent LLM response artifact produced by the
 * llm-executor runner (flow-ai/artifacts/llm-response-*.json).
 *
 * Returns null when no artifact exists yet.
 * Never throws — callers receive null on any filesystem error.
 */
export async function getLatestLLMResponse(): Promise<Record<string, unknown> | null> {
  const files = await safeListDir(ARTIFACTS_DIR);

  // safeListDir returns reverse-sorted (newest filename first).
  const latest = files.find(
    (f) => f.startsWith("llm-response-") && f.endsWith(".json")
  );

  if (!latest) return null;

  return safeReadJson<Record<string, unknown> | null>(
    path.join(ARTIFACTS_DIR, latest),
    null
  );
}

// ─────────────────────────────────────────────────────────
// Cache management (exported for testing or admin tooling)
// ─────────────────────────────────────────────────────────

/** Clears the in-memory report cache. */
export function clearReportCache(): void {
  reportCache.clear();
}
