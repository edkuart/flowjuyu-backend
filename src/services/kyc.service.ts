// src/services/kyc.service.ts
//
// KYC/identity verification analysis run at seller registration time.
//
// Phase 1 goal:
//   Harden the current backend so it never auto-approves a seller purely
//   because files were uploaded. Instead, store structured evidence and keep
//   the flow ready for OCR / face-match / authoritative-provider integrations.

export interface KYCChecklist {
  dpi_legible: boolean
  selfie_coincide: boolean
  datos_coinciden: boolean
}

export interface KycDocumentExtraction {
  fullName?: string | null
  dpi?: string | null
  birthDate?: string | null
  expiryDate?: string | null
  confidence?: number | null
}

export interface KycDocumentAssessment {
  frontLooksLikeId: boolean | null
  backLooksLikeId: boolean | null
  likelyDocumentType: string | null
  confidence: number | null
  reason: string | null
}

export interface KycEvidence {
  provider: string
  provider_status: "not_configured" | "pending_manual_review" | "verified" | "failed"
  submitted_name: string
  normalized_submitted_name: string
  submitted_dpi: string
  normalized_submitted_dpi: string
  has_dpi_front: boolean
  has_dpi_back: boolean
  has_selfie: boolean
  duplicate_dpi_count: number
  extracted_document?: KycDocumentExtraction | null
  document_assessment?: KycDocumentAssessment | null
  extracted_name_match: boolean | null
  extracted_dpi_match: boolean | null
  face_match: boolean | null
  face_match_score: number | null
  missing_capabilities: string[]
  review_reasons: string[]
}

export interface KycDecision {
  autoApproved: boolean
  estadoValidacion: "pendiente" | "en_revision" | "aprobado" | "rechazado"
  estadoAdmin: "activo" | "inactivo"
  reason: string
}

export interface KYCResult {
  score: number
  riesgo: "alto" | "medio" | "bajo"
  checklist: KYCChecklist
  evidence: KycEvidence
  decision: KycDecision
}

interface KYCInput {
  sellerName: string
  dpi: string
  fotoFrente: string | null
  fotoReverso: string | null
  selfie: string | null
  duplicateDpiCount?: number
  providerName?: string
  providerStatus?: KycEvidence["provider_status"]
  extractedDocument?: KycDocumentExtraction | null
  documentAssessment?: KycDocumentAssessment | null
  faceMatch?: boolean | null
  faceMatchScore?: number | null
}

const DPI_REGEX = /^\d{13}$/

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function normalizeHumanName(value: string): string {
  return normalizeWhitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
}

function normalizeDpi(value: string): string {
  return value.replace(/\D+/g, "")
}

function hasUsableExtraction(extracted?: KycDocumentExtraction | null): boolean {
  return Boolean(extracted?.fullName || extracted?.dpi || extracted?.birthDate || extracted?.expiryDate)
}

export function runKYCAnalysis(input: KYCInput): KYCResult {
  const {
    sellerName,
    dpi,
    fotoFrente,
    fotoReverso,
    selfie,
    duplicateDpiCount = 0,
    providerName = "internal_consistency_v1",
    providerStatus = "pending_manual_review",
    extractedDocument = null,
    documentAssessment = null,
    faceMatch = null,
    faceMatchScore = null,
  } = input

  const normalizedSubmittedName = normalizeHumanName(String(sellerName ?? ""))
  const normalizedSubmittedDpi = normalizeDpi(String(dpi ?? ""))
  const normalizedExtractedName = normalizeHumanName(String(extractedDocument?.fullName ?? ""))
  const normalizedExtractedDpi = normalizeDpi(String(extractedDocument?.dpi ?? ""))

  const dpiLegible = DPI_REGEX.test(normalizedSubmittedDpi)
  const docsPresent = Boolean(fotoFrente && fotoReverso)
  const selfiePresent = Boolean(selfie)
  const documentLooksValid =
    documentAssessment?.frontLooksLikeId === true &&
    documentAssessment?.backLooksLikeId === true
  const documentLooksInvalid =
    documentAssessment?.frontLooksLikeId === false &&
    documentAssessment?.backLooksLikeId === false
  const extractedNameMatch = extractedDocument?.fullName
    ? normalizedSubmittedName === normalizedExtractedName
    : null
  const extractedDpiMatch = extractedDocument?.dpi
    ? normalizedSubmittedDpi === normalizedExtractedDpi
    : null

  let score = 0
  if (dpiLegible) score += 30
  if (docsPresent) score += 25
  if (selfiePresent) score += 15
  if (duplicateDpiCount === 0 && dpiLegible) score += 10
  if (documentLooksValid) score += 20
  if (extractedNameMatch === true) score += 10
  if (extractedDpiMatch === true) score += 10

  const reviewReasons: string[] = []
  const missingCapabilities: string[] = []

  if (!dpiLegible) reviewReasons.push("dpi_invalid_format")
  if (!docsPresent) reviewReasons.push("missing_dpi_images")
  if (!selfiePresent) reviewReasons.push("missing_selfie")
  if (duplicateDpiCount > 0) reviewReasons.push("duplicate_dpi_detected")
  if (documentLooksInvalid) reviewReasons.push("document_not_dpi")

  if (documentAssessment == null) {
    missingCapabilities.push("document_type_detection")
  } else if (!documentLooksValid) {
    reviewReasons.push("document_type_not_confirmed")
  }

  if (!hasUsableExtraction(extractedDocument)) {
    missingCapabilities.push("document_ocr_extraction")
    reviewReasons.push("document_data_not_verified")
  }
  if (extractedDocument?.fullName && extractedNameMatch === false) {
    reviewReasons.push("name_mismatch_against_document")
  }
  if (extractedDocument?.dpi && extractedDpiMatch === false) {
    reviewReasons.push("dpi_mismatch_against_document")
  }
  if (faceMatch == null) {
    missingCapabilities.push("selfie_face_match")
    reviewReasons.push("face_match_not_verified")
  } else if (faceMatch === false) {
    reviewReasons.push("face_match_failed")
  }

  const clamped = Math.max(0, Math.min(100, score))

  let riesgo: "alto" | "medio" | "bajo" = "alto"
  if (clamped >= 75) riesgo = "bajo"
  else if (clamped >= 45) riesgo = "medio"

  const canAutoApprove =
    dpiLegible &&
    docsPresent &&
    documentLooksValid &&
    selfiePresent &&
    duplicateDpiCount === 0 &&
    extractedNameMatch === true &&
    extractedDpiMatch === true &&
    faceMatch === true

  const shouldAutoReject =
    documentLooksInvalid &&
    (documentAssessment?.confidence ?? 0) >= 0.85

  const decision: KycDecision = canAutoApprove
    ? {
        autoApproved: true,
        estadoValidacion: "aprobado",
        estadoAdmin: "activo",
        reason: "identity_verified_with_strong_automated_signals",
      }
    : shouldAutoReject
      ? {
          autoApproved: false,
          estadoValidacion: "rechazado",
          estadoAdmin: "inactivo",
          reason: "document_not_dpi",
        }
    : {
        autoApproved: false,
        estadoValidacion: docsPresent || selfiePresent ? "en_revision" : "pendiente",
        estadoAdmin: "inactivo",
        reason: reviewReasons[0] ?? "manual_review_required",
      }

  return {
    score: clamped,
    riesgo,
    checklist: {
      dpi_legible: dpiLegible && !documentLooksInvalid,
      datos_coinciden: docsPresent && documentLooksValid,
      selfie_coincide: selfiePresent,
    },
    evidence: {
      provider: providerName,
      provider_status: canAutoApprove ? "verified" : providerStatus,
      submitted_name: normalizeWhitespace(String(sellerName ?? "")),
      normalized_submitted_name: normalizedSubmittedName,
      submitted_dpi: normalizeWhitespace(String(dpi ?? "")),
      normalized_submitted_dpi: normalizedSubmittedDpi,
      has_dpi_front: Boolean(fotoFrente),
      has_dpi_back: Boolean(fotoReverso),
      has_selfie: selfiePresent,
      duplicate_dpi_count: duplicateDpiCount,
      extracted_document: extractedDocument,
      document_assessment: documentAssessment,
      extracted_name_match: extractedNameMatch,
      extracted_dpi_match: extractedDpiMatch,
      face_match: faceMatch,
      face_match_score: faceMatchScore,
      missing_capabilities: missingCapabilities,
      review_reasons: reviewReasons,
    },
    decision,
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
