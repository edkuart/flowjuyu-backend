/**
 * flow-ai/runners/run-brain-cycle.js
 *
 * Triggers the Flowjuyu AI Brain Cycle via the admin HTTP API.
 *
 * The brain cycle services require a running database connection,
 * so they are invoked through the Express server rather than
 * executed directly. This keeps all DB lifecycle management inside
 * the server process.
 *
 * Requirements:
 *   - The Flowjuyu backend server must be running.
 *   - The env var BRAIN_CYCLE_TOKEN must be set to a valid admin JWT,
 *     OR BRAIN_CYCLE_SECRET can be used as a shared local secret.
 *
 * Usage:
 *   node flow-ai/runners/run-brain-cycle.js
 *
 * Environment variables:
 *   BRAIN_CYCLE_URL     Base URL of the backend (default: http://localhost:8800)
 *   BRAIN_CYCLE_TOKEN   Admin Bearer token for authentication
 */

require("dotenv").config();

const https = require("https");
const http  = require("http");
const path  = require("path");

// ─────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────

const BASE_URL  = process.env.BRAIN_CYCLE_URL   || "http://localhost:8800";
const TOKEN     = process.env.BRAIN_CYCLE_TOKEN || "";
const ENDPOINT  = "/api/admin/ai/brain";
const TIMEOUT   = 5 * 60 * 1000; // 5 minutes — cycle can take a while

// ─────────────────────────────────────────────────────────
// HTTP helper
// ─────────────────────────────────────────────────────────

function post(url, token) {
  return new Promise((resolve, reject) => {
    const parsed    = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   "POST",
      headers: {
        "Content-Type":  "application/json",
        "Content-Length": "0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      timeout: TIMEOUT,
    };

    const req = transport.request(options, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request timed out after ${TIMEOUT / 1000}s`));
    });

    req.on("error", reject);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────

async function main() {
  console.log("\n══════════════════════════════════════════");
  console.log("  FLOWJUYU AI BRAIN CYCLE RUNNER");
  console.log("══════════════════════════════════════════");
  console.log(`  Endpoint: POST ${BASE_URL}${ENDPOINT}`);
  console.log(`  Auth:     ${TOKEN ? "Bearer token provided" : "⚠ No token set (BRAIN_CYCLE_TOKEN)"}`);
  console.log("══════════════════════════════════════════\n");

  if (!TOKEN) {
    console.warn(
      "[brain-runner] WARNING: BRAIN_CYCLE_TOKEN is not set.\n" +
      "  Set it to a valid admin JWT before running in production.\n" +
      "  The request will likely return 401.\n"
    );
  }

  const start = Date.now();

  try {
    const { status, body } = await post(`${BASE_URL}${ENDPOINT}`, TOKEN);
    const elapsed = Date.now() - start;

    if (status === 200 && body.ok) {
      const cycle = body.cycle || {};
      console.log(`✓ Brain cycle completed in ${elapsed}ms`);
      console.log(`  Report file : ${cycle.report_file  ?? "—"}`);
      console.log(`  Duration    : ${cycle.duration_ms  ?? elapsed}ms`);

      if (cycle.scan) {
        console.log(`  Issues found: ${cycle.scan.issues?.length ?? 0}`);
        console.log(`  Tasks created: ${cycle.scan.tasks_created ?? 0}`);
      }
      if (cycle.risks) {
        console.log(`  Risks found : ${cycle.risks.risks?.length ?? 0}`);
      }
    } else {
      console.error(`✗ Brain cycle failed — HTTP ${status}`);
      console.error("  Response:", JSON.stringify(body, null, 2));
      process.exit(1);
    }
  } catch (err) {
    console.error("✗ Brain cycle runner error:", err.message);
    process.exit(1);
  }
}

main();
