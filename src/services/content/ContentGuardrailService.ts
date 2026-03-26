// src/services/content/ContentGuardrailService.ts
//
// Deterministic guardrail checks for cultural authenticity and brand safety.
// All checks run against the actual product DB record — no LLM calls here.
//
// HARD BLOCKS (cultural_risk): origin_claim, technique_claim, symbolic_claim
// BRAND BLOCKS (bad_tone):      urgency language, forbidden openers
// ACCURACY BLOCK: price_mismatch
//
// If a check cannot run due to a DB error, the variant is held (guardrail_check_error),
// never silently passed.
//
// TODO Phase 3: extend with seller.departamento + municipio for origin checks.

import AiContentVariant from "../../models/AiContentVariant.model";

// ─── Reference term lists ────────────────────────────────────────────────────

// Guatemalan textile technique terms that require product.descripcion support
const TECHNIQUE_TERMS = [
  "jaspe",
  "telar de cintura",
  "backstrap",
  "brocado",
  "bordado",
  "ikat",
  "tejido a mano",
  "hilado",
  "teñido",
  "urdido",
  "tramado",
  "macramé",
];

// Sub-national geographic terms that require product.region_custom support.
// Country-level ("guatemala") is always safe and excluded from this check.
const SPECIFIC_GEO_TERMS = [
  "quiché",
  "quetzaltenango",
  "huehuetenango",
  "sacatepéquez",
  "chimaltenango",
  "sololá",
  "totonicapán",
  "alta verapaz",
  "baja verapaz",
  "petén",
  "izabal",
  "zacapa",
  "chiquimula",
  "jalapa",
  "jutiapa",
  "escuintla",
  "retalhuleu",
  "suchitepéquez",
  "santa rosa",
  "salcajá",
  "momostenango",
  "chichicastenango",
  "antigua",
  "cobán",
  "nebaj",
  "todos santos",
];

// Symbolic/ceremonial interpretation — never allowed without taxonomy source
const SYMBOLIC_TRIGGERS = [
  "simboliza",
  "representa el",
  "identidad maya",
  "cosmovisión",
  "espiritual",
  "ceremonial",
  "sagrado",
  "ritual maya",
  "cosmología",
  "nahual",
  "calendario maya",
];

// Brand tone violations
const BAD_TONE_PATTERNS = [
  /^descubre\b/i,
  /^presentamos\b/i,
  /^conoce\b/i,
  /^introducing\b/i,
  /^discover\b/i,
  /^meet\b/i,
  /\blimitad[ao]s?\b/i,
  /\búltimas?\s+unidades?\b/i,
  /\boferta\s+especial\b/i,
  /\bprecio\s+especial\b/i,
  /\benvío\s+gratis\b/i,
];

// ─── Result types ────────────────────────────────────────────────────────────

export interface GuardrailResult {
  passed: boolean;
  failures: string[];
}

// ─── Public interface ────────────────────────────────────────────────────────

/**
 * Run all guardrail checks for a variant.
 * Returns { passed, failures } where failures is an array of check names.
 * An empty failures array means all checks passed.
 */
export async function runGuardrails(
  variant: AiContentVariant,
  productId: string
): Promise<GuardrailResult> {
  const failures: string[] = [];
  const text = variant.content_body;
  const lc   = text.toLowerCase();

  // Load product record
  let product: {
    nombre: string;
    descripcion: string | null;
    precio: number;
    region_custom: string | null;
  } | null = null;

  try {
    const { default: Product } = await import("../../models/product.model");
    const raw = await Product.findByPk(productId, {
      attributes: ["nombre", "descripcion", "precio", "region_custom"],
    });
    if (!raw) {
      failures.push("guardrail_check_error");
      return { passed: false, failures };
    }
    product = {
      nombre:        raw.nombre,
      descripcion:   raw.descripcion ?? null,
      precio:        Number(raw.precio),
      region_custom: raw.region_custom ?? null,
    };
  } catch {
    failures.push("guardrail_check_error");
    return { passed: false, failures };
  }

  // ── 1. origin_claim ───────────────────────────────────────────────────────
  // Any sub-national geographic term must appear in product.region_custom.
  const productRegion = (product.region_custom ?? "").toLowerCase();
  for (const geoTerm of SPECIFIC_GEO_TERMS) {
    if (lc.includes(geoTerm)) {
      if (!productRegion.includes(geoTerm)) {
        failures.push("origin_claim");
        break;
      }
    }
  }

  // ── 2. technique_claim ────────────────────────────────────────────────────
  // Any weaving/dyeing technique must appear in product.descripcion.
  const productDesc = (product.descripcion ?? "").toLowerCase();
  for (const technique of TECHNIQUE_TERMS) {
    if (lc.includes(technique)) {
      if (!productDesc.includes(technique)) {
        failures.push("technique_claim");
        break;
      }
    }
  }

  // ── 3. symbolic_claim ─────────────────────────────────────────────────────
  // No symbolic/ceremonial interpretation without taxonomy source (never allowed in MVS).
  const hasSymbolic = SYMBOLIC_TRIGGERS.some((t) => lc.includes(t));
  if (hasSymbolic) {
    failures.push("symbolic_claim");
  }

  // ── 4. price_mismatch ─────────────────────────────────────────────────────
  // Any number that looks like a price must match product.precio exactly.
  const pricePattern = /Q?\s*(\d[\d,]*(?:\.\d{1,2})?)/g;
  const priceMatches = text.match(pricePattern) ?? [];
  for (const match of priceMatches) {
    const extracted = parseFloat(match.replace(/[Q,\s]/g, ""));
    // Ignore small numbers (likely not prices), allow float tolerance
    if (!isNaN(extracted) && extracted > 10) {
      if (Math.abs(extracted - product.precio) > 0.01) {
        failures.push("price_mismatch");
        break;
      }
    }
  }

  // ── 5. bad_tone ───────────────────────────────────────────────────────────
  const hasBadTone = BAD_TONE_PATTERNS.some((p) => p.test(text));
  if (hasBadTone) {
    failures.push("bad_tone");
  }

  return { passed: failures.length === 0, failures };
}

/**
 * Write the guardrail result back to the variant record.
 * Maps the first failure to the appropriate rejection_reason.
 */
export async function applyGuardrailResult(
  variant: AiContentVariant,
  result: GuardrailResult
): Promise<void> {
  const now = new Date();

  if (result.passed) {
    await variant.update({
      status:               "scoring",
      guardrail_passed:     true,
      guardrail_checked_at: now,
      guardrail_failures:   [],
    });
    return;
  }

  const FAILURE_TO_REASON: Record<string, string> = {
    origin_claim:          "cultural_risk",
    technique_claim:       "cultural_risk",
    symbolic_claim:        "cultural_risk",
    price_mismatch:        "price_mismatch",
    bad_tone:              "bad_tone",
    guardrail_check_error: "guardrail_check_error",
  };

  const rejection_reason =
    FAILURE_TO_REASON[result.failures[0]] ?? "cultural_risk";

  await variant.update({
    status:               "guardrail_failed",
    guardrail_passed:     false,
    guardrail_checked_at: now,
    guardrail_failures:   result.failures,
    rejection_reason:     rejection_reason as any,
  });
}
