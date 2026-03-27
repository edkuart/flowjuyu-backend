// src/services/content/ContentPriorityService.ts
//
// Prioritization engine: decides WHAT to generate next and in what order.
//
// Priority formula (all factors [0,1]):
//
//   priority_score =
//     0.35 * content_gap             — is content missing or underperforming?
//     0.25 * product_potential       — traffic + seller standing
//     0.20 * performance_opportunity — traffic without conversion = high gap
//     0.10 * recency_decay           — penalise recently-generated items
//     0.10 * diversity_factor        — reward coverage of missing content types
//
// Factor definitions:
//
//   content_gap:
//     1.00 — no content item exists for this product+content_type
//     0.80 — item exists but status=pending/blocked (never published)
//     0.60 — published but avg_performance_score < 0.30 (low performer)
//     0.30 — published, avg_performance_score 0.30–0.60 (medium)
//     0.05 — published, avg_performance_score > 0.60 (strong content, low need)
//
//   product_potential:
//     0.60 * traffic_score + 0.40 * seller_score
//     traffic_score  = min(views_14d / 50, 1.0)
//     seller_score   = 1.0 (aprobado+activo) | 0.5 (pending) | 0.0 (suspended)
//
//   performance_opportunity:
//     For products WITH traffic but WITHOUT conversion → highest opportunity.
//     = traffic_score * (1 − avg_intent_rate_or_0)
//     If no performance data: 0.40 (neutral, don't over-trust absence of data)
//
//   recency_decay:
//     1.00 — never generated
//     min(days_since_last_generation / 30, 1.0) — 30+ days = full score
//     This prevents hammering the same item repeatedly.
//
//   diversity_factor:
//     Rewards generating content types the product lacks entirely.
//     1.00 — product has zero content items of this type
//     0.40 — product has content of this type but not for all 3 types
//     0.15 — product already has all 3 content types
//
// Hard blocks (item excluded from queue regardless of score):
//   - cooldown_until > NOW()
//   - status = 'generating' | 'published' | 'archived'
//   - variants created in last 48h >= max_variants_per_product_per_48h (config)
//
// Exploration vs exploitation:
//   exploration_rate (default 0.20) of queue slots go to random
//   items below the top-priority list but above the score floor (>= 0.10).
//   Prevents the engine from locking into a single winning pattern.

import path from "path";
import fs from "fs";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db";

// ─── Config ───────────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(
  process.cwd(),
  "flow-ai/config/content-optimizer.json"
);

interface OptimizerConfig {
  generation: {
    max_variants_per_product_per_48h: number;
    max_daily_budget: number;
    cooldown_hours: number;
  };
  priority: { weights: Record<string, number> };
  exploration: { rate: number; min_exploitation_score: number };
  safety: {
    min_impressions: number;
    max_failed_pattern_repeats: number;
    min_days_data_for_stop: number;
  };
  queue: { max_items_per_run: number; content_types_order: string[] };
}

function loadConfig(): OptimizerConfig {
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as OptimizerConfig;
  }
  // Fallback defaults
  return {
    generation:  { max_variants_per_product_per_48h: 2, max_daily_budget: 10, cooldown_hours: 72 },
    priority:    { weights: { content_gap: 0.35, product_potential: 0.25, performance_opportunity: 0.20, recency_decay: 0.10, diversity_factor: 0.10 } },
    exploration: { rate: 0.20, min_exploitation_score: 0.40 },
    safety:      { min_impressions: 5, max_failed_pattern_repeats: 2, min_days_data_for_stop: 3 },
    queue:       { max_items_per_run: 8, content_types_order: ["caption", "product_description", "image_prompt_brief"] },
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PriorityFactors {
  content_gap:              number;
  product_potential:        number;
  performance_opportunity:  number;
  recency_decay:            number;
  diversity_factor:         number;
}

export interface QueueEntry {
  rank:             number;
  product_id:       string;
  product_name:     string;
  content_type:     string;
  item_id:          string | null;  // null = item does not exist yet
  item_status:      string | null;
  priority_score:   number;
  factors:          PriorityFactors;
  reason:           string;
  is_exploration:   boolean;
  can_generate:     boolean;
  block_reason:     string | null;
}

export interface AnomalyEntry {
  product_id:   string;
  content_type: string;
  issue:        string;
  count:        number;
}

export interface OptimizationQueue {
  generated_at:   string;
  config_snapshot: { exploration_rate: number; max_daily_budget: number; max_per_run: number };
  budget:         { limit: number; used_today: number; remaining: number };
  queue:          QueueEntry[];
  anomalies:      AnomalyEntry[];
  total_candidates: number;
}

// ─── Raw DB row from the coverage query ──────────────────────────────────────

interface CoverageRow {
  product_id:           string;
  product_name:         string;
  precio:               string;
  estado_validacion:    string | null;
  estado_admin:         string | null;
  content_type:         string;
  item_id:              string | null;
  item_status:          string | null;
  generation_count:     string | null;
  cooldown_until:       Date | null;
  last_generated_at:    Date | null;
  published_variant_id: string | null;
  views_14d:            string;
  avg_perf_score:       string | null;
  avg_intent_rate:      string | null;
  days_observed:        string | null;
  variants_last_48h:    string;
  failed_variants:      string;
  total_types_for_product: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// ─── Factor computers ────────────────────────────────────────────────────────

function computeContentGap(row: CoverageRow): number {
  if (!row.item_id) return 1.0;
  if (!row.published_variant_id) {
    const s = row.item_status;
    if (s === "blocked") return 0.60;
    if (s === "pending" || s === "in_review" || s === "approved") return 0.80;
    return 0.70;
  }
  // Has published content — scale by performance
  const perf = row.avg_perf_score != null ? Number(row.avg_perf_score) : null;
  if (perf === null) return 0.40; // published but no data yet
  if (perf < 0.30)  return 0.60; // low performer
  if (perf < 0.60)  return 0.30; // medium
  return 0.05;                    // strong — low need
}

function computeProductPotential(row: CoverageRow): number {
  const views      = Number(row.views_14d) || 0;
  const trafficScore = clamp(views / 50);   // 50 views/14d = full score

  const ev = row.estado_validacion;
  const ea = row.estado_admin;
  let sellerScore = 0.3; // unknown seller = low weight
  if (ev === "aprobado" && ea === "activo")       sellerScore = 1.0;
  else if (ev === "aprobado" && ea === "inactivo") sellerScore = 0.4;
  else if (ev === "pendiente")                     sellerScore = 0.5;
  else if (ea === "suspendido")                    sellerScore = 0.0;

  return clamp(0.60 * trafficScore + 0.40 * sellerScore);
}

function computePerformanceOpportunity(row: CoverageRow, config: OptimizerConfig): number {
  const views = Number(row.views_14d) || 0;
  const trafficScore = clamp(views / 50);

  if (row.days_observed == null || Number(row.days_observed) < config.safety.min_impressions) {
    // Insufficient data — neutral, don't over-trust
    return 0.40;
  }

  const intentRate = Number(row.avg_intent_rate) || 0;
  // High traffic + low conversion = high opportunity
  return clamp(trafficScore * (1 - intentRate));
}

function computeRecencyDecay(row: CoverageRow): number {
  if (!row.last_generated_at) return 1.0;
  const now          = Date.now();
  const lastGen      = new Date(row.last_generated_at).getTime();
  const daysSinceLast = (now - lastGen) / (1000 * 60 * 60 * 24);
  return clamp(daysSinceLast / 30); // full score at 30 days
}

function computeDiversityFactor(row: CoverageRow): number {
  const totalTypes = Number(row.total_types_for_product) || 0;
  if (!row.item_id) return 1.0;     // this type entirely missing
  if (totalTypes < 3) return 0.40;  // product lacks some types
  return 0.15;                       // product covered on all types
}

// ─── Hard block check ────────────────────────────────────────────────────────

function checkBlock(row: CoverageRow, config: OptimizerConfig): string | null {
  // Cooldown
  if (
    process.env.NODE_ENV === "production" &&
    row.cooldown_until &&
    new Date(row.cooldown_until) > new Date()
  ) {
    return `cooldown_active_until:${new Date(row.cooldown_until).toISOString()}`;
  }
  // Terminal / in-flight statuses
  const blocked = ["generating", "published", "archived"];
  if (row.item_status && blocked.includes(row.item_status)) {
    return `item_status:${row.item_status}`;
  }
  // 48h variant cap
  const variantsLast48h = Number(row.variants_last_48h) || 0;
  if (variantsLast48h >= config.generation.max_variants_per_product_per_48h) {
    return `max_variants_per_48h:${variantsLast48h}/${config.generation.max_variants_per_product_per_48h}`;
  }
  return null;
}

// ─── Reason builder ───────────────────────────────────────────────────────────

function buildReason(row: CoverageRow, factors: PriorityFactors): string {
  const parts: string[] = [];

  if (factors.content_gap >= 0.80)
    parts.push(!row.item_id
      ? "No content item exists"
      : `Content exists but not published (status=${row.item_status})`);
  else if (factors.content_gap >= 0.50)
    parts.push("Low-performing published content (score<0.30)");

  const views = Number(row.views_14d) || 0;
  if (views > 0) parts.push(`${views} views in 14d`);

  if (row.estado_validacion === "aprobado" && row.estado_admin === "activo")
    parts.push("seller approved+active");

  if (factors.performance_opportunity >= 0.60)
    parts.push("traffic without conversion");

  if (!row.last_generated_at)
    parts.push("never generated");

  if (factors.diversity_factor === 1.0)
    parts.push(`${row.content_type} entirely missing`);

  return parts.join("; ") || "standard priority";
}

// ─── Budget: count today's optimizer-triggered generations ───────────────────

function loadTodayBudgetUsed(): number {
  const decisionsPath = path.join(
    process.cwd(),
    "flow-ai/memory/content-decisions.json"
  );
  if (!fs.existsSync(decisionsPath)) return 0;
  try {
    const data = JSON.parse(fs.readFileSync(decisionsPath, "utf8"));
    const today = new Date().toISOString().slice(0, 10);
    if (data.run_date !== today) return 0;
    return Number(data.budget_used) || 0;
  } catch {
    return 0;
  }
}

// ─── Main: build prioritized queue ───────────────────────────────────────────

export async function buildPriorityQueue(): Promise<OptimizationQueue> {
  const config    = loadConfig();
  const weights   = config.priority.weights;
  const budgetUsed = loadTodayBudgetUsed();
  const budgetRemaining = Math.max(0, config.generation.max_daily_budget - budgetUsed);

  // ── Single comprehensive coverage query ───────────────────────────────────
  const rows = await sequelize.query<CoverageRow>(
    `
    WITH
    -- All active products with seller standing
    active_products AS (
      SELECT
        p.id::text                AS product_id,
        p.nombre                  AS product_name,
        p.precio::text            AS precio,
        vp.estado_validacion,
        vp.estado_admin
      FROM productos p
      LEFT JOIN vendedor_perfil vp ON vp.user_id = p.vendedor_id
      WHERE p.activo = true
    ),

    -- Cross-join with content types to get all (product, content_type) combinations
    coverage AS (
      SELECT
        ap.product_id,
        ap.product_name,
        ap.precio,
        ap.estado_validacion,
        ap.estado_admin,
        ct.content_type,
        i.id                    AS item_id,
        i.status                AS item_status,
        i.generation_count,
        i.cooldown_until,
        i.last_generated_at,
        i.published_variant_id
      FROM active_products ap
      CROSS JOIN (
        VALUES ('caption'), ('product_description'), ('image_prompt_brief')
      ) AS ct(content_type)
      LEFT JOIN ai_content_items i
        ON  i.subject_id   = ap.product_id
        AND i.subject_type = 'product'
        AND i.content_type = ct.content_type
    ),

    -- Recent views (14 days)
    recent_views AS (
      SELECT product_id::text, COUNT(*)::text AS views_14d
      FROM product_views
      WHERE view_date >= CURRENT_DATE - INTERVAL '14 days'
      GROUP BY product_id
    ),

    -- Recent performance (7 days, only scored rows)
    recent_perf AS (
      SELECT
        content_item_id,
        AVG(performance_score)::text  AS avg_perf_score,
        AVG(intent_rate)::text        AS avg_intent_rate,
        COUNT(*)::text                AS days_observed
      FROM ai_content_performance_daily
      WHERE recorded_date >= CURRENT_DATE - INTERVAL '7 days'
        AND performance_score IS NOT NULL
      GROUP BY content_item_id
    ),

    -- Variants created in last 48h per product (generation rate limiter)
    recent_variants AS (
      SELECT
        i.subject_id AS product_id,
        COUNT(*)::text AS variants_last_48h
      FROM ai_content_variants v
      JOIN ai_content_items i ON i.id = v.content_item_id
      WHERE v.generated_at >= NOW() - INTERVAL '48 hours'
      GROUP BY i.subject_id
    ),

    -- Failed variants per item (for anomaly detection)
    failed_per_item AS (
      SELECT
        content_item_id,
        COUNT(*)::text AS failed_variants
      FROM ai_content_variants
      WHERE status IN ('discarded', 'guardrail_failed', 'rejected')
      GROUP BY content_item_id
    ),

    -- Count of distinct content types with any item per product
    types_per_product AS (
      SELECT
        subject_id AS product_id,
        COUNT(DISTINCT content_type)::text AS total_types_for_product
      FROM ai_content_items
      WHERE subject_type = 'product'
      GROUP BY subject_id
    )

    SELECT
      c.product_id,
      c.product_name,
      c.precio,
      c.estado_validacion,
      c.estado_admin,
      c.content_type,
      c.item_id,
      c.item_status,
      c.generation_count::text,
      c.cooldown_until,
      c.last_generated_at,
      c.published_variant_id,
      COALESCE(rv.views_14d, '0')             AS views_14d,
      rp.avg_perf_score,
      rp.avg_intent_rate,
      rp.days_observed,
      COALESCE(vv.variants_last_48h, '0')     AS variants_last_48h,
      COALESCE(fp.failed_variants, '0')       AS failed_variants,
      COALESCE(tp.total_types_for_product, '0') AS total_types_for_product
    FROM coverage c
    LEFT JOIN recent_views rv   ON rv.product_id       = c.product_id
    LEFT JOIN recent_perf  rp   ON rp.content_item_id  = c.item_id
    LEFT JOIN recent_variants vv ON vv.product_id      = c.product_id
    LEFT JOIN failed_per_item fp ON fp.content_item_id = c.item_id
    LEFT JOIN types_per_product tp ON tp.product_id    = c.product_id
    ORDER BY c.product_id, c.content_type
    `,
    { type: QueryTypes.SELECT }
  );

  // ── Compute priority scores ────────────────────────────────────────────────
  const candidates: Array<{
    row:       CoverageRow;
    score:     number;
    factors:   PriorityFactors;
    blockReason: string | null;
  }> = [];

  const anomalies: AnomalyEntry[] = [];

  for (const row of rows) {
    // Anomaly: repeated failures
    const failed = Number(row.failed_variants) || 0;
    if (failed >= config.safety.max_failed_pattern_repeats) {
      anomalies.push({
        product_id:   row.product_id,
        content_type: row.content_type,
        issue:        "repeated_generation_failures",
        count:        failed,
      });
    }

    const blockReason = checkBlock(row, config);

    const factors: PriorityFactors = {
      content_gap:             round3(computeContentGap(row)),
      product_potential:       round3(computeProductPotential(row)),
      performance_opportunity: round3(computePerformanceOpportunity(row, config)),
      recency_decay:           round3(computeRecencyDecay(row)),
      diversity_factor:        round3(computeDiversityFactor(row)),
    };

    const score = round3(clamp(
      weights.content_gap            * factors.content_gap            +
      weights.product_potential      * factors.product_potential      +
      weights.performance_opportunity * factors.performance_opportunity +
      weights.recency_decay          * factors.recency_decay          +
      weights.diversity_factor       * factors.diversity_factor
    ));

    candidates.push({ row, score, factors, blockReason });
  }

  // ── Sort and split into exploitation / exploration pools ──────────────────
  const explorationRate = config.exploration.rate;
  const maxPerRun       = config.queue.max_items_per_run;

  const eligible   = candidates.filter((c) => !c.blockReason);
  const ineligible = candidates.filter((c) => !!c.blockReason);

  eligible.sort((a, b) => b.score - a.score);

  const exploitCount  = Math.max(1, Math.floor(maxPerRun * (1 - explorationRate)));
  const exploreCount  = maxPerRun - exploitCount;

  const topTier    = eligible.slice(0, exploitCount);
  const lowerTier  = eligible.slice(exploitCount);

  // Random exploration picks from lower tier (score floor: 0.10)
  const exploreCandidates = lowerTier.filter(
    (c) => c.score >= config.exploration.min_exploitation_score * 0.25
  );
  // Fisher-Yates shuffle (deterministic seed not needed — exploration should be random)
  for (let i = exploreCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [exploreCandidates[i], exploreCandidates[j]] = [exploreCandidates[j], exploreCandidates[i]];
  }
  const explorePicks = exploreCandidates.slice(0, exploreCount);

  // Combine: exploitation first, then exploration
  const finalQueue = [...topTier, ...explorePicks];

  // Also include the blocked ones for admin visibility (below ranked items)
  const blockedEntries = ineligible.sort((a, b) => b.score - a.score).slice(0, 20);

  // ── Build output ──────────────────────────────────────────────────────────
  const buildEntry = (
    { row, score, factors, blockReason }: typeof candidates[0],
    rank: number,
    isExploration: boolean
  ): QueueEntry => ({
    rank,
    product_id:    row.product_id,
    product_name:  row.product_name,
    content_type:  row.content_type,
    item_id:       row.item_id,
    item_status:   row.item_status,
    priority_score: score,
    factors,
    reason:        buildReason(row, factors),
    is_exploration: isExploration,
    can_generate:  !blockReason,
    block_reason:  blockReason,
  });

  const queue: QueueEntry[] = [
    ...topTier.map((c, i) =>
      buildEntry(c, i + 1, false)
    ),
    ...explorePicks.map((c, i) =>
      buildEntry(c, topTier.length + i + 1, true)
    ),
    ...blockedEntries.map((c, i) =>
      buildEntry(c, finalQueue.length + i + 1, false)
    ),
  ];

  return {
    generated_at: new Date().toISOString(),
    config_snapshot: {
      exploration_rate:    explorationRate,
      max_daily_budget:    config.generation.max_daily_budget,
      max_per_run:         maxPerRun,
    },
    budget: {
      limit:     config.generation.max_daily_budget,
      used_today: budgetUsed,
      remaining: budgetRemaining,
    },
    queue,
    anomalies,
    total_candidates: candidates.length,
  };
}

// ─── Re-export config for use in runner ──────────────────────────────────────
export { loadConfig };
export type { OptimizerConfig };
