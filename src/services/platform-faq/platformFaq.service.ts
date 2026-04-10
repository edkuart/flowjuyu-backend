import PlatformFaqEntry from "../../models/PlatformFaqEntry.model";
import { logger } from "../../config/logger";
import { normalizeConversationCommandText } from "../conversations/conversationCommandMatcher.service";
import type { PersistFailureEventParams } from "../conversations/conversationFailureEvent.service";

// ---------------------------------------------------------------------------
// In-memory cache
//
// FAQ entries rarely change. A 5-minute TTL keeps DB queries negligible
// without staling the data in production.
// ---------------------------------------------------------------------------

type CachedEntry = {
  key: string;
  triggers: string[];
  normalizedTriggers: string[];
  answer: string;
  category: string | null;
  priority: number;
  match_type: "exact" | "token" | "includes";
};

let faqCache: CachedEntry[] | null = null;
let faqCacheLoadedAt = 0;
const FAQ_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function loadFaqEntries(): Promise<CachedEntry[]> {
  const now = Date.now();
  if (faqCache && now - faqCacheLoadedAt < FAQ_CACHE_TTL_MS) {
    return faqCache;
  }

  const rows = await PlatformFaqEntry.findAll({
    where: { is_active: true },
    attributes: ["key", "triggers", "answer", "category", "priority", "match_type"],
    order: [
      ["priority", "DESC"],
      ["key", "ASC"],
    ],
  });

  faqCache = rows.map((row) => ({
    key: row.key,
    triggers: row.triggers,
    normalizedTriggers: row.triggers.map(normalizeConversationCommandText),
    answer: row.answer,
    category: row.category,
    priority: row.priority ?? 0,
    match_type: (row.match_type as CachedEntry["match_type"]) ?? "includes",
  }));

  faqCacheLoadedAt = now;

  logger.info({ entries: faqCache.length }, "[conversation][faq.cache_refreshed]");
  return faqCache;
}

/** Call this after seeding or updating FAQ entries to clear the cache. */
export function invalidateFaqCache(): void {
  faqCache = null;
  faqCacheLoadedAt = 0;
}

// ---------------------------------------------------------------------------
// Matching — 3-tier pipeline
//
// Normalization: same NFD + diacritics-stripped + lowercase pipeline used
// by the command matcher.
//
// Tier 1 — exact:   normalizedInput === normalizedTrigger
// Tier 2 — token:   every token of the trigger appears in the input token set
// Tier 3 — includes: normalizedInput.includes(normalizedTrigger)
//
// Within each tier, entries are already sorted by priority DESC at load time.
// The first match in the highest tier wins.
//
// After a match, a "faq_resolved" event is persisted fire-and-forget if a
// session context is provided.
// ---------------------------------------------------------------------------

export type FaqMatchResult = {
  key: string;
  answer: string;
  category: string | null;
  matchedTrigger: string;
  matchTier: "exact" | "token" | "includes";
};

function tokenSet(normalized: string): Set<string> {
  return new Set(normalized.split(/\s+/).filter(Boolean));
}

function matchesToken(triggerNormalized: string, inputTokens: Set<string>): boolean {
  const triggerTokens = triggerNormalized
    .split(/\s+/)
    .filter((token) => token.length > 2);
  if (triggerTokens.length === 0) return false;
  const overlap = triggerTokens.filter((token) => inputTokens.has(token)).length;
  if (triggerTokens.length === 1) return overlap === 1;
  return overlap / triggerTokens.length >= 0.5;
}

type FaqHitContext = Omit<PersistFailureEventParams, "signal">;

export async function matchFaqEntry(
  rawText: string,
  hitContext?: FaqHitContext
): Promise<FaqMatchResult | null> {
  if (!rawText?.trim()) return null;

  try {
    const entries = await loadFaqEntries();
    const normalizedInput = normalizeConversationCommandText(rawText);

    if (!normalizedInput) return null;

    const inputTokens = tokenSet(normalizedInput);

    // Partition by match_type — already sorted by priority DESC within each bucket
    const exactEntries = entries.filter((e) => e.match_type === "exact");
    const tokenEntries = entries.filter((e) => e.match_type === "token");
    const includesEntries = entries.filter((e) => e.match_type === "includes");

    const tryMatch = (
      bucket: CachedEntry[],
      tier: FaqMatchResult["matchTier"]
    ): FaqMatchResult | null => {
      for (const entry of bucket) {
        for (let i = 0; i < entry.normalizedTriggers.length; i++) {
          const triggerNorm = entry.normalizedTriggers[i];
          if (!triggerNorm) continue;

          let matched = false;
          if (tier === "exact") {
            matched = normalizedInput === triggerNorm;
          } else if (tier === "token") {
            matched = matchesToken(triggerNorm, inputTokens);
          } else {
            matched = normalizedInput.includes(triggerNorm);
          }

          if (matched) {
            logger.info(
              {
                key: entry.key,
                match_tier: tier,
                matched_trigger: entry.triggers[i],
                priority: entry.priority,
              },
              "[conversation][faq.match]"
            );
            return {
              key: entry.key,
              answer: entry.answer,
              category: entry.category,
              matchedTrigger: entry.triggers[i] ?? triggerNorm,
              matchTier: tier,
            };
          }
        }
      }
      return null;
    };

    const result =
      tryMatch(exactEntries, "exact") ??
      tryMatch(tokenEntries, "token") ??
      tryMatch(includesEntries, "includes");

    if (result && hitContext) {
      // Fire-and-forget — must not affect callers
      import("../conversations/conversationFailureEvent.service")
        .then(({ persistFailureEvent }) =>
          persistFailureEvent({ ...hitContext, signal: "faq_resolved" })
        )
        .catch(() => {
          /* swallow */
        });
    }

    return result;
  } catch (err: any) {
    // Non-critical — if FAQ lookup fails, the bot continues normally.
    console.error("[faq] match error:", err?.message ?? err);
    return null;
  }
}
