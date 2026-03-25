/**
 * flow-ai/runners/run-llm-executor.js
 *
 * Automated LLM execution — controlled intelligence layer.
 *
 * Reads the latest llm-trigger-*.md prompt (written by run-llm-trigger.js)
 * and calls the Anthropic API to produce a structured analysis response.
 *
 * Output:
 *   flow-ai/artifacts/llm-response-YYYY-MM-DD.json
 *
 * Guards:
 *   - Soft exits if ANTHROPIC_API_KEY is not set
 *   - Soft exits if no trigger prompt exists (run-llm-trigger.js first)
 *   - Skips if today's response already exists (idempotent)
 *
 * Safety constraints:
 *   - ONLY generates analysis text — never modifies code, DB, or system state
 *   - max_tokens capped at 4096 (cost control)
 *   - effort: "medium" (adaptive thinking, balanced cost/quality)
 *   - timeout protection via SDK-level timeout
 *   - All output is written as a read-only artifact
 *
 * Run order: AFTER llm-trigger in daily cycle.
 *
 * Cost estimate: ~2000–5000 input tokens + ~1000–3000 output tokens per run.
 * Runs ONLY when high-priority issues exist (gated by llm-trigger).
 *
 * --- CHANGES LOG ---
 * v1.0: Initial implementation.
 */

"use strict";
require("dotenv").config();
console.log("ANTHROPIC_API_KEY loaded:", !!process.env.ANTHROPIC_API_KEY);

const fs   = require("fs");
const path = require("path");

// ── SDK import (CommonJS) ──────────────────────────────────────────────────

const Anthropic = require("@anthropic-ai/sdk");

// ── Paths ──────────────────────────────────────────────────────────────────

const BASE         = path.join(__dirname, "..");
const promptsDir   = path.join(BASE, "prompts");
const artifactsDir = path.join(BASE, "artifacts");

// ── Constants ──────────────────────────────────────────────────────────────

const MODEL      = "claude-opus-4-6";
const MAX_TOKENS = 4096;
const TIMEOUT_MS = 90_000; // 90 seconds

// System prompt enforces analysis-only mode.
const SYSTEM_PROMPT = `You are the Flowjuyu AI Analyst operating in ANALYSIS-ONLY mode.

Your job is to analyze the provided marketplace telemetry and priority data, then respond
in the exact structured format requested in the prompt.

HARD CONSTRAINTS — you must never violate these:
- Do NOT suggest code edits, file writes, or deployments
- Do NOT propose database operations or destructive actions
- Do NOT invent metrics, files, or data that are not in the prompt
- Stay grounded in the numbers provided
- Qualify uncertainty clearly when you are inferring rather than reading from data

Your output is stored as a read-only artifact and reviewed by a developer before any action is taken.`;

// ── Helpers ────────────────────────────────────────────────────────────────

function readFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    console.warn(`  [llm-executor] Could not read ${path.basename(filePath)}: ${err.message}`);
    return null;
  }
}

/**
 * Returns the latest llm-trigger-*.md file info, or null.
 */
function findLatestTriggerPrompt() {
  if (!fs.existsSync(promptsDir)) return null;

  const files = fs.readdirSync(promptsDir)
    .filter(f => f.startsWith("llm-trigger-") && f.endsWith(".md"))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  const filename = files[0];
  const match    = filename.match(/llm-trigger-(\d{4}-\d{2}-\d{2})\.md$/);
  const date     = match ? match[1] : null;

  return { filename, date, filePath: path.join(promptsDir, filename) };
}

/**
 * Counts how many issue blocks are in the trigger prompt
 * (used to populate issues_analyzed in the artifact).
 */
function countIssueBlocks(content) {
  const matches = content.match(/^### Issue \d+:/gm);
  return matches ? matches.length : 0;
}

/**
 * Extracts text content from the API response.
 */
function extractResponseText(message) {
  return message.content
    .filter(block => block.type === "text")
    .map(block => block.text)
    .join("\n\n");
}

// ── LLM call ──────────────────────────────────────────────────────────────

/**
 * Calls the Anthropic API with the trigger prompt.
 * Uses streaming + finalMessage() for timeout safety on long outputs.
 *
 * Returns the full SDK Message object.
 */
async function callLLM(promptContent) {
  const client = new Anthropic({
    apiKey:  process.env.ANTHROPIC_API_KEY,
    timeout: TIMEOUT_MS,
  });

  console.log(`  Model:       ${MODEL}`);
  console.log(`  Max tokens:  ${MAX_TOKENS}`);
  console.log(`  Effort:      medium (adaptive thinking)`);
  console.log(`\n--- LLM RESPONSE ---\n`);

  const stream = await client.messages.stream({
    model:         MODEL,
    max_tokens:    MAX_TOKENS,
    thinking:      { type: "adaptive" },
    output_config: { effort: "medium" },
    system:        SYSTEM_PROMPT,
    messages: [
      { role: "user", content: promptContent },
    ],
  });

  // Stream response text to console in real-time
  stream.on("text", (delta) => {
    process.stdout.write(delta);
  });

  const message = await stream.finalMessage();

  console.log(`\n\n--- END OF RESPONSE ---\n`);

  return message;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== FLOWJUYU LLM EXECUTOR ===\n");

  // ── Guard: API key ────────────────────────────────────────────────────

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("  ERROR: ANTHROPIC_API_KEY is not set.");
    console.error("  Set it in your environment before running this script.");
    console.error("\nLLM executor aborted — missing API key.\n");
    process.exit(1);
  }

  // ── Guard: trigger prompt ────────────────────────────────────────────

  const trigger = findLatestTriggerPrompt();

  if (!trigger) {
    console.log("  No trigger prompt found.");
    console.log("  Run: node flow-ai/runners/run-llm-trigger.js");
    console.log("\nLLM executor skipped — no trigger prompt.\n");
    process.exit(0);
  }

  console.log(`  Trigger prompt: ${trigger.filename}`);
  console.log(`  Trigger date:   ${trigger.date ?? "(unknown)"}`);

  // ── Guard: idempotency ───────────────────────────────────────────────

  const today     = new Date().toISOString().split("T")[0];
  const outFile   = path.join(artifactsDir, `llm-response-${today}.json`);

  if (fs.existsSync(outFile)) {
    console.log(`\n  Response for ${today} already exists — skipping.`);
    console.log(`  File: ${outFile}\n`);
    process.exit(0);
  }

  // ── Load prompt content ──────────────────────────────────────────────

  const promptContent = readFile(trigger.filePath);

  if (!promptContent || promptContent.trim().length === 0) {
    console.error("  ERROR: Trigger prompt file is empty or unreadable.");
    console.error("\nLLM executor aborted.\n");
    process.exit(1);
  }

  const issueCount = countIssueBlocks(promptContent);
  console.log(`  Issues in prompt: ${issueCount}`);

  // ── Ensure artifacts directory ───────────────────────────────────────

  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  // ── Call LLM ────────────────────────────────────────────────────────

  console.log(`\n  Calling ${MODEL}...\n`);

  let message;
  try {
    message = await callLLM(promptContent);
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error(`\n  API error (HTTP ${err.status}): ${err.message}`);
    } else {
      console.error(`\n  Unexpected error: ${err.message}`);
    }
    console.error("\nLLM executor failed — no artifact written.\n");
    process.exit(1);
  }

  // ── Extract and log usage ────────────────────────────────────────────

  const usage      = message.usage ?? {};
  const inputTok   = usage.input_tokens  ?? 0;
  const outputTok  = usage.output_tokens ?? 0;
  const totalTok   = inputTok + outputTok;

  // Estimated cost at Opus 4.6 rates: $5/1M input, $25/1M output
  const estimatedCostUsd =
    (inputTok / 1_000_000) * 5.00 +
    (outputTok / 1_000_000) * 25.00;

  console.log(`  Tokens used:   ${totalTok} (input=${inputTok}, output=${outputTok})`);
  console.log(`  Estimated cost: $${estimatedCostUsd.toFixed(4)}`);
  console.log(`  Stop reason:   ${message.stop_reason}`);

  // ── Build artifact ───────────────────────────────────────────────────

  const responseText = extractResponseText(message);

  const artifact = {
    schema_version:  "1.0",
    timestamp:       new Date().toISOString(),
    date:            today,
    prompt_file:     trigger.filename,
    issues_analyzed: issueCount,
    model:           MODEL,
    stop_reason:     message.stop_reason,
    tokens_used: {
      input:  inputTok,
      output: outputTok,
      total:  totalTok,
    },
    estimated_cost_usd: parseFloat(estimatedCostUsd.toFixed(6)),
    response:           responseText,
  };

  // ── Write artifact ───────────────────────────────────────────────────

  fs.writeFileSync(outFile, JSON.stringify(artifact, null, 2), "utf8");

  console.log(`\n  Artifact written: ${outFile}`);
  console.log(`  Response length:  ${responseText.length} chars`);
  console.log(`  Issues analyzed:  ${issueCount}`);
  console.log("\nLLM executor complete. Review the artifact before taking any action.\n");
}

main().catch((err) => {
  console.error("\n  Fatal error in LLM executor:", err.message);
  process.exit(1);
});
