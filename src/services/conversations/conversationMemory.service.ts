/**
 * conversationMemory.service.ts
 *
 * Process-local short-term memory for active conversation sessions.
 *
 * WHY IN-PROCESS:
 *   The task explicitly requires "NOT DB-heavy" transient storage.
 *   In-process Map is zero-latency, requires no schema changes, and fits
 *   the use cases: recovery context, repetition detection, AI fallback context.
 *
 * LIMITATIONS:
 *   - Lost on process restart (acceptable — this is "short-term" memory).
 *   - Not shared across multiple Node.js processes (Railway multi-instance).
 *     For multi-process consistency, migrate to Redis if needed.
 *   - Automatic TTL eviction prevents unbounded memory growth.
 *
 * EVICTION:
 *   Entries expire after TTL_MS of inactivity.
 *   Call evictStaleMemory() from a periodic task or on each new message.
 *   The orchestrator calls it lazily on a rolling basis.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConversationMemoryEntry = {
  /** Normalized user texts, most recent first. Max MAX_ITEMS. */
  lastUserMessages: string[];
  /** Bot reply texts, most recent first. Max MAX_ITEMS. */
  lastBotMessages: string[];
  /** Command keys or step names processed, most recent first. Max MAX_ITEMS. */
  lastActions: string[];
  /** Unix timestamp (ms) of last update — used for TTL eviction. */
  updatedAt: number;
};

export type ConversationMemorySnapshot = {
  readonly lastUserMessages: readonly string[];
  readonly lastBotMessages: readonly string[];
  readonly lastActions: readonly string[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ITEMS = 5;
const TTL_MS = 30 * 60 * 1000; // 30 minutes
let evictionsRun = 0;
const EVICT_EVERY_N_WRITES = 200; // periodic GC without a dedicated timer

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const store = new Map<string, ConversationMemoryEntry>();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getOrCreate(sessionId: string): ConversationMemoryEntry {
  let entry = store.get(sessionId);
  if (!entry) {
    entry = {
      lastUserMessages: [],
      lastBotMessages: [],
      lastActions: [],
      updatedAt: Date.now(),
    };
    store.set(sessionId, entry);
  }
  return entry;
}

/**
 * Prepends `item` to `arr`, deduplicates consecutive identical values,
 * and trims to MAX_ITEMS.
 */
function prependAndTrim(arr: string[], item: string): string[] {
  if (arr[0] === item) return arr; // same as most-recent — skip duplicate
  return [item, ...arr].slice(0, MAX_ITEMS);
}

function touch(entry: ConversationMemoryEntry): void {
  entry.updatedAt = Date.now();
}

function maybeEvict(): void {
  evictionsRun++;
  if (evictionsRun % EVICT_EVERY_N_WRITES !== 0) return;
  evictStaleMemory();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a normalized user text for this session.
 * Call immediately after normalizing inbound text in the orchestrator.
 */
export function addUserMessage(sessionId: string, normalizedText: string): void {
  if (!normalizedText?.trim()) return;
  const entry = getOrCreate(sessionId);
  entry.lastUserMessages = prependAndTrim(
    entry.lastUserMessages,
    normalizedText.trim()
  );
  touch(entry);
  maybeEvict();
}

/**
 * Record a bot reply text for this session.
 * Call inside sendReply() after a successful outbound send.
 */
export function addBotMessage(sessionId: string, text: string): void {
  if (!text?.trim()) return;
  const entry = getOrCreate(sessionId);
  entry.lastBotMessages = prependAndTrim(entry.lastBotMessages, text.trim());
  touch(entry);
}

/**
 * Record a command key or step name that was just processed.
 * Call after a command is routed or after handleTextInput returns "continue".
 */
export function addAction(sessionId: string, action: string): void {
  if (!action?.trim()) return;
  const entry = getOrCreate(sessionId);
  entry.lastActions = prependAndTrim(entry.lastActions, action.trim());
  touch(entry);
}

/**
 * Returns a frozen snapshot of the session's short-term memory.
 * Returns empty arrays if no memory exists (session cold start or evicted).
 */
export function getMemorySnapshot(sessionId: string): ConversationMemorySnapshot {
  const entry = store.get(sessionId);
  if (!entry) {
    return {
      lastUserMessages: [],
      lastBotMessages: [],
      lastActions: [],
    };
  }
  return {
    lastUserMessages: [...entry.lastUserMessages],
    lastBotMessages: [...entry.lastBotMessages],
    lastActions: [...entry.lastActions],
  };
}

/**
 * Clears memory for a session. Call on hard reset or session close.
 */
export function clearMemory(sessionId: string): void {
  store.delete(sessionId);
}

/**
 * Evicts entries older than TTL_MS.
 * Safe to call at any time — no-op if store is empty.
 */
export function evictStaleMemory(): void {
  const now = Date.now();
  let evicted = 0;
  for (const [id, entry] of store.entries()) {
    if (now - entry.updatedAt > TTL_MS) {
      store.delete(id);
      evicted++;
    }
  }
  if (evicted > 0) {
    console.log(`[conversation-memory] evicted stale entries count=${evicted} store_size=${store.size}`);
  }
}

/** Returns the number of sessions currently in memory (for monitoring). */
export function getStoreSize(): number {
  return store.size;
}
