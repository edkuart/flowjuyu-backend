// src/services/ai/ai.fs.utils.ts
//
// Shared filesystem utilities for all AI brain services.
// Mirrors the patterns in ai.service.ts: async-only, never throws,
// safe fallback returns on error.

import fs   from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────
// Base paths (relative to CWD = backend root)
// ─────────────────────────────────────────────────────────

export const AI_BASE      = path.resolve(process.cwd(), "flow-ai");
export const REPORTS_DIR  = path.join(AI_BASE, "reports", "daily");
export const MEMORY_DIR   = path.join(AI_BASE, "memory");
export const CONFIG_DIR   = path.join(AI_BASE, "config");
export const INBOX_DIR    = path.join(AI_BASE, "tasks", "inbox");

// ─────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────

export async function safeReadJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function safeListDir(dirPath: string): Promise<string[]> {
  try {
    const stat = await fs.promises.stat(dirPath);
    if (!stat.isDirectory()) return [];
    const entries = await fs.promises.readdir(dirPath);
    return entries.filter(Boolean).sort().reverse();
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────
// Write helpers
// ─────────────────────────────────────────────────────────

/**
 * Atomically writes JSON to a file (via a temp file).
 * Creates parent directories if needed. Never throws.
 */
export async function safeWriteJson(filePath: string, data: unknown): Promise<boolean> {
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.promises.rename(tmp, filePath);
    return true;
  } catch (err) {
    console.error(`[ai.fs.utils] Failed to write ${filePath}:`, (err as Error).message);
    return false;
  }
}

/**
 * Writes a Markdown report file to reports/daily/.
 * Returns the filename on success, null on failure. Never throws.
 */
export async function writeReport(filename: string, content: string): Promise<string | null> {
  try {
    await fs.promises.mkdir(REPORTS_DIR, { recursive: true });
    const filePath = path.join(REPORTS_DIR, filename);
    await fs.promises.writeFile(filePath, content, "utf8");
    return filename;
  } catch (err) {
    console.error(`[ai.fs.utils] Failed to write report ${filename}:`, (err as Error).message);
    return null;
  }
}

/**
 * Creates a task JSON file in the inbox directory.
 * Returns the filename on success, null on failure. Never throws.
 */
export async function createTask(task: {
  id:          string;
  title:       string;
  description: string;
  priority:    "low" | "medium" | "high";
  source:      string;
}): Promise<string | null> {
  try {
    await fs.promises.mkdir(INBOX_DIR, { recursive: true });
    const filename = `${task.id}.json`;
    const filePath = path.join(INBOX_DIR, filename);
    const payload  = { ...task, status: "pending", created_at: new Date().toISOString() };
    await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    return filename;
  } catch (err) {
    console.error(`[ai.fs.utils] Failed to create task ${task.id}:`, (err as Error).message);
    return null;
  }
}

/**
 * Appends an entry to a JSON-array memory file (e.g. decisions.json).
 * If the file is missing or corrupt it starts fresh. Never throws.
 */
export async function appendToMemoryArray(
  filename: string,
  entry: unknown,
  maxEntries = 100
): Promise<boolean> {
  const filePath = path.join(MEMORY_DIR, filename);
  const existing = await safeReadJson<unknown[]>(filePath, []);
  const updated  = [entry, ...existing].slice(0, maxEntries);
  return safeWriteJson(filePath, updated);
}

// ─────────────────────────────────────────────────────────
// ID generation
// ─────────────────────────────────────────────────────────

export function taskId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowIso(): string {
  return new Date().toISOString();
}
