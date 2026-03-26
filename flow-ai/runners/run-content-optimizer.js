/**
 * flow-ai/runners/run-content-optimizer.js
 *
 * Phase 4: Content Optimization Runner
 *
 * Responsibilities:
 *   1. Load the generation budget and today's usage from content-decisions.json
 *   2. Build the prioritized generation queue via raw SQL (mirror of ContentPriorityService)
 *   3. Extract winning patterns (top approved variants by score)
 *   4. Select top N items respecting:
 *        - daily budget cap
 *        - 48h per-product variant limit
 *        - cooldown enforcement
 *        - exploration vs exploitation ratio
 *   5. For each selected item, call the internal admin API to trigger generation
 *      (only if OPTIMIZER_AUTO_GENERATE=true — default OFF, human-in-the-loop)
 *   6. Write artifacts:
 *        flow-ai/artifacts/optimizer-YYYY-MM-DD.json  (full analysis + queue)
 *        flow-ai/memory/content-decisions.json         (decisions + budget state)
 *
 * Self-contained: pg + dotenv only. No Express, no Sequelize.
 * Exits 0 on success, 1 on fatal error.
 *
 * Environment variables:
 *   DATABASE_URL              — required
 *   OPTIMIZER_AUTO_GENERATE   — 'true' to trigger actual generation calls
 *   INTERNAL_API_URL          — e.g. http://localhost:4000 (used when AUTO_GENERATE=true)
 *   OPTIMIZER_SERVICE_TOKEN   — Bearer token for internal admin API calls
 */

require("dotenv").config();
const { Client }  = require("pg");
const fs          = require("fs");
const path        = require("path");

// ─── Config paths ─────────────────────────────────────────────────────────────

const CONFIG_PATH     = path.join(__dirname, "../config/content-optimizer.json");
const DECISIONS_PATH  = path.join(__dirname, "../memory/content-decisions.json");
const ARTIFACTS_DIR   = path.join(__dirname, "../artifacts");
const MEMORY_DIR      = path.join(__dirname, "../memory");

if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
if (!fs.existsSync(MEMORY_DIR))    fs.mkdirSync(MEMORY_DIR,    { recursive: true });

// ─── Load config ──────────────────────────────────────────────────────────────

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  }
  return {
    generation:  { max_variants_per_product_per_48h: 2, max_daily_budget: 10, cooldown_hours: 72 },
    priority:    { weights: { content_gap: 0.35, product_potential: 0.25, performance_opportunity: 0.20, recency_decay: 0.10, diversity_factor: 0.10 } },
    exploration: { rate: 0.20, min_exploitation_score: 0.40 },
    safety:      { min_impressions: 5, max_failed_pattern_repeats: 2 },
    queue:       { max_items_per_run: 8, content_types_order: ["caption", "product_description", "image_prompt_brief"] },
  };
}

// ─── Budget state ─────────────────────────────────────────────────────────────

function loadBudgetState(limit) {
  const today = new Date().toISOString().slice(0, 10);
  if (!fs.existsSync(DECISIONS_PATH)) return { used: 0, limit, remaining: limit };
  try {
    const data = JSON.parse(fs.readFileSync(DECISIONS_PATH, "utf8"));
    if (data.run_date !== today) return { used: 0, limit, remaining: limit };
    const used = Number(data.budget_used) || 0;
    return { used, limit, remaining: Math.max(0, limit - used) };
  } catch { return { used: 0, limit, remaining: limit }; }
}

// ─── DB client ────────────────────────────────────────────────────────────────

function createClient() {
  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("supabase")
      ? { rejectUnauthorized: false }
      : false,
  });
}

// ─── Priority helpers ─────────────────────────────────────────────────────────

function clamp(v) { return Math.min(1, Math.max(0, v)); }
function r3(v)    { return Math.round(v * 1000) / 1000; }

function computeContentGap(row) {
  if (!row.item_id) return 1.0;
  if (!row.published_variant_id) {
    const s = row.item_status;
    if (s === "blocked")                                       return 0.60;
    if (["pending","in_review","approved"].includes(s))        return 0.80;
    return 0.70;
  }
  const perf = row.avg_perf_score != null ? Number(row.avg_perf_score) : null;
  if (perf === null) return 0.40;
  if (perf < 0.30)   return 0.60;
  if (perf < 0.60)   return 0.30;
  return 0.05;
}

function computeProductPotential(row) {
  const views        = Number(row.views_14d) || 0;
  const trafficScore = clamp(views / 50);
  const ev = row.estado_validacion, ea = row.estado_admin;
  let sellerScore = 0.3;
  if (ev === "aprobado" && ea === "activo")        sellerScore = 1.0;
  else if (ev === "aprobado" && ea === "inactivo") sellerScore = 0.4;
  else if (ev === "pendiente")                     sellerScore = 0.5;
  else if (ea === "suspendido")                    sellerScore = 0.0;
  return clamp(0.60 * trafficScore + 0.40 * sellerScore);
}

function computePerformanceOpportunity(row, minImpressions) {
  const views = Number(row.views_14d) || 0;
  if (!row.days_observed || Number(row.days_observed) < minImpressions) return 0.40;
  const intentRate = Number(row.avg_intent_rate) || 0;
  return clamp(clamp(views / 50) * (1 - intentRate));
}

function computeRecencyDecay(row) {
  if (!row.last_generated_at) return 1.0;
  const days = (Date.now() - new Date(row.last_generated_at).getTime()) / (86400 * 1000);
  return clamp(days / 30);
}

function computeDiversityFactor(row) {
  const types = Number(row.total_types_for_product) || 0;
  if (!row.item_id)  return 1.0;
  if (types < 3)     return 0.40;
  return 0.15;
}

function checkBlock(row, config) {
  if (row.cooldown_until && new Date(row.cooldown_until) > new Date())
    return `cooldown_active`;
  if (row.item_status && ["generating","published","archived"].includes(row.item_status))
    return `item_status:${row.item_status}`;
  if (Number(row.variants_last_48h) >= config.generation.max_variants_per_product_per_48h)
    return `max_variants_per_48h`;
  return null;
}

// ─── Build priority queue ─────────────────────────────────────────────────────

async function buildQueue(client, config, budget) {
  const { rows } = await client.query(`
    WITH
    active_products AS (
      SELECT
        p.id::text           AS product_id,
        p.nombre             AS product_name,
        p.precio::text       AS precio,
        vp.estado_validacion,
        vp.estado_admin
      FROM productos p
      LEFT JOIN vendedor_perfil vp ON vp.user_id = p.vendedor_id
      WHERE p.activo = true
    ),
    coverage AS (
      SELECT
        ap.product_id, ap.product_name, ap.precio,
        ap.estado_validacion, ap.estado_admin,
        ct.content_type,
        i.id AS item_id, i.status AS item_status,
        i.generation_count, i.cooldown_until,
        i.last_generated_at, i.published_variant_id
      FROM active_products ap
      CROSS JOIN (VALUES ('caption'),('product_description'),('image_prompt_brief')) AS ct(content_type)
      LEFT JOIN ai_content_items i
        ON i.subject_id = ap.product_id AND i.subject_type = 'product' AND i.content_type = ct.content_type
    ),
    recent_views AS (
      SELECT product_id::text, COUNT(*) AS views_14d
      FROM product_views WHERE view_date >= CURRENT_DATE - INTERVAL '14 days'
      GROUP BY product_id
    ),
    recent_perf AS (
      SELECT content_item_id,
        AVG(performance_score) AS avg_perf_score,
        AVG(intent_rate)       AS avg_intent_rate,
        COUNT(*)               AS days_observed
      FROM ai_content_performance_daily
      WHERE recorded_date >= CURRENT_DATE - INTERVAL '7 days' AND performance_score IS NOT NULL
      GROUP BY content_item_id
    ),
    recent_variants AS (
      SELECT i.subject_id AS product_id, COUNT(*) AS variants_last_48h
      FROM ai_content_variants v
      JOIN ai_content_items i ON i.id = v.content_item_id
      WHERE v.generated_at >= NOW() - INTERVAL '48 hours'
      GROUP BY i.subject_id
    ),
    types_per_product AS (
      SELECT subject_id AS product_id, COUNT(DISTINCT content_type) AS total_types_for_product
      FROM ai_content_items WHERE subject_type = 'product'
      GROUP BY subject_id
    )
    SELECT
      c.product_id, c.product_name, c.precio,
      c.estado_validacion, c.estado_admin,
      c.content_type, c.item_id, c.item_status,
      c.generation_count, c.cooldown_until, c.last_generated_at, c.published_variant_id,
      COALESCE(rv.views_14d, 0)                      AS views_14d,
      rp.avg_perf_score, rp.avg_intent_rate, rp.days_observed,
      COALESCE(vv.variants_last_48h, 0)              AS variants_last_48h,
      COALESCE(tp.total_types_for_product, 0)        AS total_types_for_product
    FROM coverage c
    LEFT JOIN recent_views rv   ON rv.product_id      = c.product_id
    LEFT JOIN recent_perf  rp   ON rp.content_item_id = c.item_id
    LEFT JOIN recent_variants vv ON vv.product_id     = c.product_id
    LEFT JOIN types_per_product tp ON tp.product_id   = c.product_id
    ORDER BY c.product_id, c.content_type
  `);

  const w = config.priority.weights;
  const candidates = [];
  const anomalies  = [];

  for (const row of rows) {
    const blockReason = checkBlock(row, config);
    const factors = {
      content_gap:             r3(computeContentGap(row)),
      product_potential:       r3(computeProductPotential(row)),
      performance_opportunity: r3(computePerformanceOpportunity(row, config.safety.min_impressions)),
      recency_decay:           r3(computeRecencyDecay(row)),
      diversity_factor:        r3(computeDiversityFactor(row)),
    };
    const score = r3(clamp(
      w.content_gap            * factors.content_gap            +
      w.product_potential      * factors.product_potential      +
      w.performance_opportunity * factors.performance_opportunity +
      w.recency_decay          * factors.recency_decay          +
      w.diversity_factor       * factors.diversity_factor
    ));
    candidates.push({ row, score, factors, blockReason });
  }

  // Sort eligible by score descending
  const eligible   = candidates.filter(c => !c.blockReason).sort((a, b) => b.score - a.score);
  const maxPerRun  = Math.min(config.queue.max_items_per_run, budget.remaining);
  const exploitN   = Math.max(1, Math.floor(maxPerRun * (1 - config.exploration.rate)));
  const exploreN   = maxPerRun - exploitN;

  const topTier    = eligible.slice(0, exploitN);
  const lowerTier  = eligible.slice(exploitN).filter(c => c.score >= 0.10);

  // Shuffle lower tier for exploration
  for (let i = lowerTier.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lowerTier[i], lowerTier[j]] = [lowerTier[j], lowerTier[i]];
  }
  const explorePicks = lowerTier.slice(0, exploreN);

  const selected = [...topTier, ...explorePicks];
  return { selected, anomalies, totalCandidates: candidates.length };
}

// ─── Extract patterns (lightweight version for runner) ────────────────────────

async function extractPatternsLight(client) {
  const dateFrom = new Date(Date.now() - 14 * 86400 * 1000).toISOString().slice(0, 10);

  const { rows: typeRows } = await client.query(
    `SELECT i.content_type,
       COUNT(DISTINCT v.id)              AS sample_count,
       AVG(v.generation_score)           AS avg_gen_score,
       AVG(p.performance_score)          AS avg_perf_score
     FROM ai_content_items i
     JOIN ai_content_variants v ON v.content_item_id = i.id
     LEFT JOIN ai_content_performance_daily p ON p.content_item_id = i.id AND p.recorded_date >= $1
     WHERE v.generated_at >= $1
     GROUP BY i.content_type
     ORDER BY AVG(v.generation_score) DESC NULLS LAST`,
    [dateFrom]
  );

  const { rows: rejRows } = await client.query(
    `SELECT rejection_reason, COUNT(*) AS count
     FROM ai_content_variants
     WHERE status IN ('rejected','guardrail_failed','discarded')
       AND rejection_reason IS NOT NULL
       AND generated_at >= $1
     GROUP BY rejection_reason ORDER BY count DESC LIMIT 5`,
    [dateFrom]
  );

  return {
    content_type_rankings: typeRows.map(r => ({
      content_type:          r.content_type,
      sample_count:          Number(r.sample_count),
      avg_generation_score:  r.avg_gen_score != null ? Math.round(Number(r.avg_gen_score) * 1000) / 1000 : null,
      avg_performance_score: r.avg_perf_score != null ? Math.round(Number(r.avg_perf_score) * 1000) / 1000 : null,
    })),
    top_rejection_reasons: rejRows.map(r => ({
      reason: r.rejection_reason,
      count:  Number(r.count),
    })),
  };
}

// ─── Trigger generation via internal API ─────────────────────────────────────

async function triggerGeneration(item, token, internalUrl) {
  const url = `${internalUrl}/api/admin/ai/content/generate`;
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        subject_type: "product",
        subject_id:   item.row.product_id,
        content_type: item.row.content_type,
      }),
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== CONTENT OPTIMIZER ===\n");

  const config       = loadConfig();
  const today        = new Date().toISOString().slice(0, 10);
  const budget       = loadBudgetState(config.generation.max_daily_budget);
  const autoGenerate = process.env.OPTIMIZER_AUTO_GENERATE === "true";
  const internalUrl  = process.env.INTERNAL_API_URL || "http://localhost:4000";
  const serviceToken = process.env.OPTIMIZER_SERVICE_TOKEN || "";

  console.log(`[config] budget=${budget.used}/${budget.limit} remaining=${budget.remaining}`);
  console.log(`[config] auto_generate=${autoGenerate}`);

  if (budget.remaining === 0) {
    console.log("[optimizer] Daily budget exhausted — skipping queue build.");
    return;
  }

  const client = createClient();
  await client.connect();

  let generationResults = [];

  try {
    // Step 1: Build priority queue
    const { selected, anomalies, totalCandidates } = await buildQueue(client, config, budget);

    console.log(`\n[queue] ${selected.length} items selected from ${totalCandidates} candidates`);
    if (anomalies.length > 0) {
      console.log(`[anomalies] ${anomalies.length} items flagged`);
    }

    // Step 2: Extract lightweight patterns
    const patterns = await extractPatternsLight(client);
    console.log(`\n[patterns] Top type: ${patterns.content_type_rankings[0]?.content_type ?? "n/a"}`);

    // Step 3: Log decisions
    const decisions = selected.map((item, i) => ({
      rank:             i + 1,
      product_id:       item.row.product_id,
      product_name:     item.row.product_name,
      content_type:     item.row.content_type,
      item_id:          item.row.item_id,
      priority_score:   item.score,
      priority_factors: item.factors,
      is_exploration:   i >= Math.floor(selected.length * (1 - config.exploration.rate)),
      decision:         autoGenerate ? "triggered_generation" : "queued_pending_manual",
      confidence:       item.score >= 0.70 ? "high" : item.score >= 0.40 ? "medium" : "low",
      decided_at:       new Date().toISOString(),
    }));

    // Step 4: Optionally trigger generation
    let budgetUsedThisRun = 0;

    if (autoGenerate && serviceToken) {
      console.log(`\n[generate] Triggering generation for ${selected.length} items...`);
      for (const item of selected) {
        if (budget.used + budgetUsedThisRun >= budget.limit) {
          console.log("[generate] Budget cap reached — stopping.");
          break;
        }
        const result = await triggerGeneration(item, serviceToken, internalUrl);
        generationResults.push({
          product_id:   item.row.product_id,
          content_type: item.row.content_type,
          ...result,
        });
        if (result.ok) budgetUsedThisRun++;
        console.log(`  ${item.row.product_name} [${item.row.content_type}] → ${result.ok ? "ok" : "failed"}`);
      }
    } else if (autoGenerate && !serviceToken) {
      console.warn("[generate] OPTIMIZER_AUTO_GENERATE=true but OPTIMIZER_SERVICE_TOKEN not set. Skipping.");
    } else {
      console.log("[generate] Auto-generate is OFF. Queue written for manual review.");
    }

    // Step 5: Write artifacts
    const artifactPath = path.join(ARTIFACTS_DIR, `optimizer-${today}.json`);
    const artifact = {
      generated_at:     new Date().toISOString(),
      run_date:         today,
      budget:           { ...budget, used_this_run: budgetUsedThisRun },
      queue_size:       selected.length,
      total_candidates: totalCandidates,
      auto_generate:    autoGenerate,
      generation_results: generationResults,
      decisions,
      patterns,
      anomalies,
      config_snapshot: {
        exploration_rate:  config.exploration.rate,
        max_per_run:       config.queue.max_items_per_run,
        max_daily_budget:  config.generation.max_daily_budget,
      },
    };

    fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2), "utf8");
    console.log(`\n[artifact] Written: ${artifactPath}`);

    // Update decisions memory
    const existingDecisions = fs.existsSync(DECISIONS_PATH)
      ? JSON.parse(fs.readFileSync(DECISIONS_PATH, "utf8"))
      : {};

    const updatedMemory = {
      ...existingDecisions,
      updated_at:   new Date().toISOString(),
      run_date:     today,
      budget_used:  budget.used + budgetUsedThisRun,
      budget_limit: budget.limit,
      last_queue:   decisions,
      // Preserve per-item performance decisions from ContentLearningService
      decisions:    existingDecisions.decisions || {},
    };

    fs.writeFileSync(DECISIONS_PATH, JSON.stringify(updatedMemory, null, 2), "utf8");
    console.log(`[memory] Decisions updated: ${DECISIONS_PATH}`);

    // Summary
    console.log(`\n[summary]`);
    console.log(`  candidates:  ${totalCandidates}`);
    console.log(`  queued:      ${selected.length}`);
    console.log(`  exploitation: ${selected.filter((_, i) => i < Math.floor(selected.length * (1 - config.exploration.rate))).length}`);
    console.log(`  exploration:  ${selected.filter((_, i) => i >= Math.floor(selected.length * (1 - config.exploration.rate))).length}`);
    console.log(`  budget_used:  ${budget.used + budgetUsedThisRun}/${budget.limit}`);
    if (anomalies.length) console.log(`  anomalies:    ${anomalies.length}`);

  } finally {
    await client.end();
  }

  console.log("\n=== CONTENT OPTIMIZER DONE ===\n");
}

main().catch((err) => {
  console.error("[optimizer] Fatal error:", err.message);
  process.exit(1);
});
