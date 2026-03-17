// src/services/kyc.service.ts
//
// Automated KYC analysis run at seller registration time.
//
// Checklist (3 signals):
//   dpi_legible      — valid 13-digit DPI number
//   datos_coinciden  — both DPI photo sides uploaded
//   selfie_coincide  — selfie uploaded (facial match placeholder)
//
// Score breakdown (max 100 today, 100 when facial match is live):
//   +30  valid DPI format
//   +20  DPI images present (frente + reverso)
//   +20  selfie present
//   +30  facial match  ← PLACEHOLDER (always 0 until API integration)
//
// Risk bands (mirrors admin review thresholds):
//   >= 80  bajo
//   >= 50  medio
//   <  50  alto

// ── Types ──────────────────────────────────────────────────────────────────────

export interface KYCChecklist {
  dpi_legible:     boolean
  selfie_coincide: boolean
  datos_coinciden: boolean
}

export interface KYCResult {
  score:     number
  riesgo:    "alto" | "medio" | "bajo"
  checklist: KYCChecklist
}

interface KYCInput {
  dpi:         string
  fotoFrente:  string | null
  fotoReverso: string | null
  selfie:      string | null
}

// ── DPI validation ─────────────────────────────────────────────────────────────

const DPI_REGEX = /^\d{13}$/

// ── Main function ──────────────────────────────────────────────────────────────

export function runKYCAnalysis(input: KYCInput): KYCResult {
  const { dpi, fotoFrente, fotoReverso, selfie } = input

  let score = 0

  // Signal 1 — DPI format (+30)
  const dpiLegible = DPI_REGEX.test((dpi ?? "").trim())
  if (dpiLegible) score += 30

  // Signal 2 — DPI documents present (+20)
  const datosCoiniciden = !!(fotoFrente && fotoReverso)
  if (datosCoiniciden) score += 20

  // Signal 3 — Selfie present (+20, facial match placeholder)
  const selfiePresente = !!selfie
  if (selfiePresente) score += 20

  // Signal 4 — Facial match (+30) — PLACEHOLDER
  // Uncomment and implement when facial recognition API is available:
  // const facialMatch = await verifyFacialMatch(fotoFrente, selfie)
  // if (facialMatch) score += 30

  const clamped = Math.max(0, Math.min(100, score))

  let riesgo: "alto" | "medio" | "bajo" = "alto"
  if (clamped >= 80) riesgo = "bajo"
  else if (clamped >= 50) riesgo = "medio"

  return {
    score:  clamped,
    riesgo,
    checklist: {
      dpi_legible:     dpiLegible,
      datos_coinciden: datosCoiniciden,
      selfie_coincide: selfiePresente,
    },
  }
}

// ── Score from checklist (used by admin review panel) ─────────────────────────
//
// Call this when an admin manually ticks the checklist.
// Uses 3 checks → divides by 3 to stay consistent with runKYCAnalysis().

// Known checklist keys — fixed list, never inferred from incoming data
const CHECKLIST_KEYS: (keyof KYCChecklist)[] = [
  "dpi_legible",
  "selfie_coincide",
  "datos_coinciden",
]

/**
 * Strip any unexpected keys from an incoming body and return a clean KYCChecklist.
 * Protects against stale keys (comercio_legitimo, ubicacion_coherente, etc.)
 * that would corrupt the divisor in score calculation.
 */
export function sanitizeChecklist(raw: Record<string, unknown>): KYCChecklist {
  return {
    dpi_legible:     raw["dpi_legible"]     === true,
    selfie_coincide: raw["selfie_coincide"] === true,
    datos_coinciden: raw["datos_coinciden"] === true,
  }
}

export function scoreFromChecklist(checklist: KYCChecklist): {
  score:  number
  riesgo: "alto" | "medio" | "bajo"
} {
  const passed = CHECKLIST_KEYS.filter((k) => checklist[k] === true).length
  const score  = Math.round((passed / CHECKLIST_KEYS.length) * 100)  // always /3

  let riesgo: "alto" | "medio" | "bajo" = "alto"
  if (score >= 80) riesgo = "bajo"
  else if (score >= 50) riesgo = "medio"

  return { score, riesgo }
}
