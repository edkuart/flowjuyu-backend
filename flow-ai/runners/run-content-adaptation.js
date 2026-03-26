/**
 * flow-ai/runners/run-content-adaptation.js
 *
 * Phase 5: Content Adaptation Runner
 *
 * Responsibilities (in order):
 *   1. Refresh template performance metrics (TemplatePerformanceService)
 *   2. Evaluate template health, apply transitions (TemplateHealthService)
 *   3. Extract edit patterns, update content-patterns.json (EditLearningService)
 *   4. Propose evolved candidate templates if signals justify it (PromptEvolutionService)
 *   5. Write adaptation report artifact
 *
 * Self-contained: uses pg + dotenv directly for steps 1–2; TypeScript services
 * are called via a helper that spawns a ts-node or compiled-JS process.
 *
 * Because this runner cannot directly import TypeScript, it calls the backend's
 * internal admin API for the TypeScript-heavy operations (pattern extraction,
 * evolution proposals). If INTERNAL_API_URL is not set, it falls back to
 * raw SQL for the metrics-only operations it can handle natively.
 *
 * When ADAPTER_API_ENABLED=true + OPTIMIZER_SERVICE_TOKEN is set:
 *   → Calls /api/admin/ai/content/templates/adapt (new endpoint)
 *     which runs the full TypeScript adaptation pipeline server-side.
 *
 * When not (default / standalone):
 *   → Runs raw SQL metrics refresh + health evaluation directly via pg.
 *   → Writes the artifact but skips evolution proposals (requires TypeScript services).
 *
 * Exits 0 on success, 1 on fatal error.
 */

require("dotenv").config();
const { Client } = require("pg");
const fs   = require("fs");
const path = require("path");

// ─── Paths ────────────────────────────────────────────────────────────────────

const ARTIFACTS_DIR   = path.join(__dirname, "../artifacts");
const MEMORY_DIR      = path.join(__dirname, "../memory");
const PATTERNS_FILE   = path.join(MEMORY_DIR, "content-patterns.json");

if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
if (!fs.existsSync(MEMORY_DIR))    fs.mkdirSync(MEMORY_DIR,    { recursive: true });

// ─── Thresholds (mirror of TemplateHealthService) ────────────────────────────

const REJECTION_RATE_PAUSE = 0.45;
const EDIT_RATE_DEGRADE    = 0.60;
const MIN_SAMPLES          = 5;

// ─── DB ───────────────────────────────────────────────────────────────────────

function createClient() {
  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("supabase")
      ? { rejectUnauthorized: false }
      : false,
  });
}

// ─── Step 1: Compute per-template performance metrics ─────────────────────────

async function computeTemplateMetrics(client) {
  const { rows } = await client.query(`
    SELECT
      v.template_id                                                          AS slug,
      COUNT(v.id)                                                            AS sample_count,
      AVG(v.generation_score)                                                AS avg_gen_score,
      AVG(p.performance_score)                                               AS avg_perf_score,
      COUNT(v.id) FILTER (
        WHERE v.status IN ('rejected','discarded','guardrail_failed')
      )                                                                      AS rejected_count,
      COUNT(v.id) FILTER (
        WHERE v.status IN ('approved','edited_and_approved','published')
      )                                                                      AS approved_count,
      COUNT(v.id) FILTER (
        WHERE v.status = 'edited_and_approved'
      )                                                                      AS edited_count
    FROM ai_content_variants v
    LEFT JOIN ai_content_performance_daily p ON p.content_variant_id = v.id
    GROUP BY v.template_id
  `);

  const metrics = {};
  for (const r of rows) {
    const n        = Number(r.sample_count) || 0;
    const rejected = Number(r.rejected_count) || 0;
    const approved = Number(r.approved_count) || 0;
    const edited   = Number(r.edited_count) || 0;

    metrics[r.slug] = {
      slug:                 r.slug,
      sample_count:         n,
      generation_score_avg: n >= MIN_SAMPLES && r.avg_gen_score != null
        ? Math.round(Number(r.avg_gen_score) * 1000) / 1000 : null,
      performance_score_avg: n >= MIN_SAMPLES && r.avg_perf_score != null
        ? Math.round(Number(r.avg_perf_score) * 1000) / 1000 : null,
      rejection_rate: n >= MIN_SAMPLES
        ? Math.round((rejected / n) * 1000) / 1000 : null,
      edit_rate: approved >= MIN_SAMPLES
        ? Math.round((edited / approved) * 1000) / 1000 : null,
    };
  }
  return metrics;
}

// ─── Step 2: Apply metrics to template records + health evaluation ─────────────

async function refreshAndEvaluate(client, metrics) {
  const { rows: templates } = await client.query(`
    SELECT id, slug, template_key, content_type, health_status, is_active,
           sample_count, generation_score_avg, performance_score_avg,
           rejection_rate, edit_rate
    FROM ai_content_templates
    WHERE health_status NOT IN ('candidate', 'retired')
  `);

  const transitions = [];

  for (const t of templates) {
    const m = metrics[t.slug];

    // Update metrics
    if (m) {
      await client.query(
        `UPDATE ai_content_templates
         SET sample_count=$1, generation_score_avg=$2, performance_score_avg=$3,
             rejection_rate=$4, edit_rate=$5, updated_at=NOW()
         WHERE id=$6`,
        [m.sample_count, m.generation_score_avg, m.performance_score_avg,
         m.rejection_rate, m.edit_rate, t.id]
      );
    }

    // Health evaluation (only with sufficient samples)
    const rr = m?.rejection_rate ?? null;
    const er = m?.edit_rate ?? null;
    const n  = m?.sample_count ?? 0;

    if (n < MIN_SAMPLES) continue;

    let newStatus = t.health_status;
    let reason    = "";

    // Check if we'd pause and whether another active template exists
    if (rr != null && rr >= REJECTION_RATE_PAUSE) {
      const { rows: others } = await client.query(
        `SELECT COUNT(*) AS cnt FROM ai_content_templates
         WHERE content_type=$1 AND is_active=true AND health_status IN ('active','degraded') AND id<>$2`,
        [t.content_type, t.id]
      );
      const othersExist = Number(others[0]?.cnt) > 0;

      if (othersExist) {
        newStatus = "paused";
        reason    = `rejection_rate=${rr} ≥ ${REJECTION_RATE_PAUSE}`;
      } else {
        newStatus = "degraded"; // last standing — degrade not pause
        reason    = `rejection_rate=${rr} ≥ threshold, but no backup template — degraded`;
      }
    } else if (er != null && er >= EDIT_RATE_DEGRADE && t.health_status === "active") {
      newStatus = "degraded";
      reason    = `edit_rate=${er} ≥ ${EDIT_RATE_DEGRADE}`;
    } else if (t.health_status === "degraded" && (rr == null || rr < REJECTION_RATE_PAUSE * 0.7) && (er == null || er < EDIT_RATE_DEGRADE * 0.7)) {
      newStatus = "active";
      reason    = "metrics recovered";
    }

    if (newStatus !== t.health_status) {
      const updateFields = newStatus === "paused"
        ? `health_status=$1, is_active=false, paused_at=NOW(), pause_reason=$2, updated_at=NOW()`
        : `health_status=$1, is_active=${newStatus !== "retired"}, updated_at=NOW()`;

      await client.query(
        `UPDATE ai_content_templates SET ${updateFields} WHERE id=$3`,
        newStatus === "paused"
          ? [newStatus, reason, t.id]
          : [newStatus, t.id]
      );

      transitions.push({ slug: t.slug, from: t.health_status, to: newStatus, reason });
      console.log(`  [health] ${t.slug}: ${t.health_status} → ${newStatus} (${reason})`);
    }
  }

  return transitions;
}

// ─── Step 3: Lightweight pattern extraction (standalone) ─────────────────────

async function extractPatternsSql(client) {
  const dateFrom = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);

  const { rows: editRows } = await client.query(
    `SELECT i.content_type,
       AVG(r.edit_char_delta) AS avg_edit_delta,
       COUNT(*) AS edit_count
     FROM ai_content_reviews r
     JOIN ai_content_variants v ON v.id = r.variant_id
     JOIN ai_content_items i ON i.id = v.content_item_id
     WHERE r.was_edited = true AND r.created_at >= $1
     GROUP BY i.content_type`,
    [dateFrom]
  );

  const { rows: hookRows } = await client.query(
    `SELECT i.content_type, v.content_body, v.generation_score
     FROM ai_content_variants v
     JOIN ai_content_items i ON i.id = v.content_item_id
     WHERE v.status = 'approved' AND v.generation_score >= 0.70 AND v.generated_at >= $1
     ORDER BY v.generation_score DESC LIMIT 10`,
    [dateFrom]
  );

  const { rows: rejRows } = await client.query(
    `SELECT i.content_type, v.rejection_reason, COUNT(*) AS cnt
     FROM ai_content_variants v
     JOIN ai_content_items i ON i.id = v.content_item_id
     WHERE v.rejection_reason IS NOT NULL AND v.generated_at >= $1
     GROUP BY i.content_type, v.rejection_reason ORDER BY cnt DESC LIMIT 10`,
    [dateFrom]
  );

  const patterns = {
    updated_at:       new Date().toISOString(),
    lookback_days:    30,
    edit_summary:     editRows.map(r => ({
      content_type:   r.content_type,
      avg_edit_delta: Math.round(Number(r.avg_edit_delta)),
      edit_count:     Number(r.edit_count),
    })),
    winning_hooks:    hookRows.map(r => ({
      content_type:   r.content_type,
      phrase:         r.content_body.trim().split(/\s+/).slice(0, 8).join(" "),
      avg_gen_score:  Math.round(Number(r.generation_score) * 1000) / 1000,
    })),
    failing_patterns: rejRows.map(r => ({
      content_type:   r.content_type,
      pattern:        r.rejection_reason,
      freq:           Number(r.cnt),
    })),
  };

  // Load existing patterns to preserve fields written by EditLearningService
  let existing = {};
  if (fs.existsSync(PATTERNS_FILE)) {
    try { existing = JSON.parse(fs.readFileSync(PATTERNS_FILE, "utf8")); } catch {}
  }

  const merged = { ...existing, ...patterns };
  fs.writeFileSync(PATTERNS_FILE, JSON.stringify(merged, null, 2), "utf8");
  return patterns;
}

// ─── Step 4: Call TypeScript adaptation API (optional) ────────────────────────

async function callAdaptationApi(token, internalUrl) {
  try {
    const res = await fetch(`${internalUrl}/api/admin/ai/content/templates/adapt`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return await res.json();
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== CONTENT ADAPTATION RUNNER ===\n");

  const today           = new Date().toISOString().slice(0, 10);
  const apiEnabled      = process.env.ADAPTER_API_ENABLED === "true";
  const internalUrl     = process.env.INTERNAL_API_URL || "http://localhost:4000";
  const serviceToken    = process.env.OPTIMIZER_SERVICE_TOKEN || "";

  const client = createClient();
  await client.connect();

  let adaptationApiResult = null;

  try {
    // Step 1: Compute metrics
    console.log("[metrics] Computing template performance metrics...");
    const metrics = await computeTemplateMetrics(client);
    console.log(`[metrics] ${Object.keys(metrics).length} template slugs analyzed.`);

    // Step 2: Refresh + evaluate health
    console.log("\n[health] Evaluating template health...");
    const transitions = await refreshAndEvaluate(client, metrics);
    console.log(`[health] ${transitions.length} health transitions applied.`);

    // Step 3: Pattern extraction
    console.log("\n[patterns] Extracting edit patterns...");
    const patterns = await extractPatternsSql(client);
    console.log(`[patterns] content-patterns.json updated.`);

    // Step 4: TypeScript adaptation (evolution proposals) — optional
    if (apiEnabled && serviceToken) {
      console.log("\n[evolution] Calling adaptation API for prompt proposals...");
      adaptationApiResult = await callAdaptationApi(serviceToken, internalUrl);
      console.log(`[evolution] API result: ${adaptationApiResult.ok ? "ok" : adaptationApiResult.error}`);
    } else {
      console.log("\n[evolution] Skipping evolution proposals (set ADAPTER_API_ENABLED=true + OPTIMIZER_SERVICE_TOKEN to enable).");
    }

    // Step 5: Write report artifact
    const report = {
      generated_at:        new Date().toISOString(),
      run_date:            today,
      template_metrics:    metrics,
      health_transitions:  transitions,
      pattern_summary: {
        winning_hooks_count:    patterns.winning_hooks.length,
        failing_patterns_count: patterns.failing_patterns.length,
        edit_summary:           patterns.edit_summary,
      },
      evolution_result:    adaptationApiResult,
    };

    const artifactPath = path.join(ARTIFACTS_DIR, `content-adaptation-${today}.json`);
    fs.writeFileSync(artifactPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`\n[artifact] Written: ${artifactPath}`);

    // Summary
    console.log(`\n[summary]`);
    console.log(`  templates analyzed:  ${Object.keys(metrics).length}`);
    console.log(`  health transitions:  ${transitions.length}`);
    console.log(`  winning hooks saved: ${patterns.winning_hooks.length}`);
    if (transitions.length) {
      transitions.forEach(t => console.log(`    ${t.slug}: ${t.from} → ${t.to}`));
    }

  } finally {
    await client.end();
  }

  console.log("\n=== CONTENT ADAPTATION DONE ===\n");
}

main().catch((err) => {
  console.error("[adaptation] Fatal error:", err.message);
  process.exit(1);
});
