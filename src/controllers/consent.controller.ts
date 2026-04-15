// src/controllers/consent.controller.ts
//
// Endpoints:
//   GET  /api/consent/status                    → getConsentStatus
//   POST /api/consent/accept                    → acceptConsent
//   GET  /api/consent/preferences               → getConsentPreferences
//   PUT  /api/consent/preferences               → updateConsentPreferences
//   GET  /api/consent/prompts/:promptKey        → getMarketingPrompt
//   PUT  /api/consent/prompts/:promptKey        → updateMarketingPrompt
//   POST /api/consent/prompts/:promptKey/accept → acceptMarketingPromptFromNudge
//
// All require requireAuth — mounted via consent.routes.ts.

import type { Request, Response, RequestHandler } from "express";
import {
  buildSessionConsentContract,
  recordConsent,
  checkTermsCompliance,
  getActivePolicyVersion,
  resolveConsentAccess,
  getCommunicationPreferences,
  updateCommunicationPreferences,
  getMarketingPromptSnapshot,
  updateMarketingPromptState,
  acceptMarketingPrompt,
  type CommunicationPreferenceUpdateInput,
  type ConsentType,
  type MarketingPromptKey,
} from "../services/consent.service";
import { logAuditEventFromRequest } from "../services/audit.service";

const VALID_CONSENT_TYPES = new Set<ConsentType>([
  "terms",
  "privacy",
  "marketing_email",
  "marketing_whatsapp",
  "data_processing",
  "kyc_data",
]);

const VALID_PROMPT_KEYS = new Set<MarketingPromptKey>([
  "seller_marketing_email_dashboard",
  "buyer_marketing_email_favorites",
]);

const VALID_PROMPT_STATUSES = new Set(["shown", "dismissed", "snoozed"] as const);

type PromptStatusInput = "shown" | "dismissed" | "snoozed";

function isValidConsentType(v: unknown): v is ConsentType {
  return typeof v === "string" && VALID_CONSENT_TYPES.has(v as ConsentType);
}

function isValidPromptKey(v: unknown): v is MarketingPromptKey {
  return typeof v === "string" && VALID_PROMPT_KEYS.has(v as MarketingPromptKey);
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parsePromptError(res: Response, err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  if (err.message === "PROMPT_ROLE_MISMATCH") {
    res.status(403).json({ ok: false, message: "Prompt no disponible para este rol" });
    return true;
  }

  if (err.message === "USER_NOT_FOUND") {
    res.status(404).json({ ok: false, message: "Usuario no encontrado" });
    return true;
  }

  return false;
}

export const getConsentStatus: RequestHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    if (!userId) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const [compliance, activeTerms, activePrivacy, resolved] = await Promise.all([
      checkTermsCompliance(userId),
      getActivePolicyVersion("terms"),
      getActivePolicyVersion("privacy"),
      resolveConsentAccess(userId),
    ]);

    res.json({
      ok: true,
      compliance,
      consent: buildSessionConsentContract(resolved),
      policies: {
        terms: activeTerms
          ? {
              version: activeTerms.version_code,
              url: activeTerms.url,
              label: activeTerms.version_label,
            }
          : null,
        privacy: activePrivacy
          ? {
              version: activePrivacy.version_code,
              url: activePrivacy.url,
              label: activePrivacy.version_label,
            }
          : null,
      },
    });
  } catch (err) {
    console.error("[consent] getConsentStatus error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};

export const getConsentPreferences: RequestHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    if (!userId) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const preferences = await getCommunicationPreferences(userId);
    res.json({ ok: true, preferences });
  } catch (err) {
    console.error("[consent] getConsentPreferences error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};

export const updateConsentPreferences: RequestHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    if (!userId) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const hasMarketingEmail = Object.prototype.hasOwnProperty.call(body, "marketingEmail");
    const hasMarketingWhatsapp = Object.prototype.hasOwnProperty.call(body, "marketingWhatsapp");

    if (!hasMarketingEmail && !hasMarketingWhatsapp) {
      res.status(400).json({
        ok: false,
        message: "Debes enviar marketingEmail y/o marketingWhatsapp",
      });
      return;
    }

    const marketingEmail = hasMarketingEmail
      ? parseOptionalBoolean(body.marketingEmail)
      : undefined;
    const marketingWhatsapp = hasMarketingWhatsapp
      ? parseOptionalBoolean(body.marketingWhatsapp)
      : undefined;

    if (
      (hasMarketingEmail && typeof marketingEmail !== "boolean") ||
      (hasMarketingWhatsapp && typeof marketingWhatsapp !== "boolean")
    ) {
      res.status(400).json({
        ok: false,
        message: "marketingEmail y marketingWhatsapp deben ser booleanos",
      });
      return;
    }

    const result = await updateCommunicationPreferences(
      userId,
      {
        marketingEmail,
        marketingWhatsapp,
      } satisfies CommunicationPreferenceUpdateInput,
      {
        source: "preferences_page",
        ipAddress: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
      },
    );

    if (result.changedFields.length > 0) {
      void logAuditEventFromRequest(req, {
        actor_user_id: userId,
        actor_role: (req as any).user?.role ?? "buyer",
        action: "consent.preferences.updated",
        entity_type: "user_consent_preferences",
        entity_id: String(userId),
        status: "success",
        severity: "low",
        metadata: {
          changed_fields: result.changedFields,
          preferences: result.preferences,
        },
      });
    }

    res.json({
      ok: true,
      preferences: result.preferences,
      changedFields: result.changedFields,
    });
  } catch (err) {
    console.error("[consent] updateConsentPreferences error:", err);
    res.status(500).json({ ok: false, message: "Error al actualizar preferencias" });
  }
};

export const getMarketingPrompt: RequestHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    if (!userId) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const promptKey = req.params.promptKey;
    if (!isValidPromptKey(promptKey)) {
      res.status(400).json({ ok: false, message: "promptKey inválido" });
      return;
    }

    const snapshot = await getMarketingPromptSnapshot(userId, promptKey);
    res.json({ ok: true, ...snapshot });
  } catch (err) {
    if (parsePromptError(res, err)) return;
    console.error("[consent] getMarketingPrompt error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};

export const updateMarketingPrompt: RequestHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    if (!userId) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const promptKey = req.params.promptKey;
    if (!isValidPromptKey(promptKey)) {
      res.status(400).json({ ok: false, message: "promptKey inválido" });
      return;
    }

    const status = (req.body as { status?: unknown } | undefined)?.status;
    if (typeof status !== "string" || !VALID_PROMPT_STATUSES.has(status as PromptStatusInput)) {
      res.status(400).json({ ok: false, message: "status inválido" });
      return;
    }

    const metadata = isPlainObject((req.body as { metadata?: unknown } | undefined)?.metadata)
      ? ((req.body as { metadata?: Record<string, unknown> }).metadata ?? null)
      : null;

    const snapshot = await updateMarketingPromptState(userId, promptKey, {
      status: status as PromptStatusInput,
      metadata,
    });

    void logAuditEventFromRequest(req, {
      actor_user_id: userId,
      actor_role: (req as any).user?.role ?? "buyer",
      action: `consent.prompt.${status}`,
      entity_type: "marketing_prompt",
      entity_id: `${userId}:${promptKey}`,
      status: "success",
      severity: "low",
      metadata: {
        prompt_key: promptKey,
        prompt_status: status,
        prompt: snapshot.prompt,
      },
    });

    res.json({ ok: true, ...snapshot });
  } catch (err) {
    if (parsePromptError(res, err)) return;
    console.error("[consent] updateMarketingPrompt error:", err);
    res.status(500).json({ ok: false, message: "Error al actualizar el prompt" });
  }
};

export const acceptMarketingPromptFromNudge: RequestHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    if (!userId) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const promptKey = req.params.promptKey;
    if (!isValidPromptKey(promptKey)) {
      res.status(400).json({ ok: false, message: "promptKey inválido" });
      return;
    }

    const metadata = isPlainObject((req.body as { metadata?: unknown } | undefined)?.metadata)
      ? ((req.body as { metadata?: Record<string, unknown> }).metadata ?? null)
      : null;

    const result = await acceptMarketingPrompt(userId, promptKey, {
      source: "marketing_prompt",
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
      metadata,
    });

    void logAuditEventFromRequest(req, {
      actor_user_id: userId,
      actor_role: (req as any).user?.role ?? "buyer",
      action: "consent.prompt.accepted",
      entity_type: "marketing_prompt",
      entity_id: `${userId}:${promptKey}`,
      status: "success",
      severity: "low",
      metadata: {
        prompt_key: promptKey,
        changed_fields: result.changedFields,
        prompt: result.prompt,
        preferences: result.preferences,
      },
    });

    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    if (parsePromptError(res, err)) return;
    console.error("[consent] acceptMarketingPromptFromNudge error:", err);
    res.status(500).json({ ok: false, message: "Error al activar marketing" });
  }
};

export const acceptConsent: RequestHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    if (!userId) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const { consentType, accepted = true } = req.body as {
      consentType?: unknown;
      accepted?: unknown;
    };

    if (!isValidConsentType(consentType)) {
      res.status(400).json({
        ok: false,
        message: `consentType inválido. Valores aceptados: ${[...VALID_CONSENT_TYPES].join(", ")}`,
      });
      return;
    }

    const granted = accepted !== false && accepted !== "false";

    const consent = await recordConsent({
      userId,
      consentType,
      accepted: granted,
      source: "settings_page",
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });

    void logAuditEventFromRequest(req, {
      actor_user_id: userId,
      actor_role: (req as any).user?.role ?? "buyer",
      action: granted
        ? `consent.${consentType}.accepted`
        : `consent.${consentType}.revoked`,
      entity_type: "user_consent",
      entity_id: String(consent.id),
      status: "success",
      severity: "low",
      metadata: {
        consent_type: consentType,
        granted,
      },
    });

    const compliance = await checkTermsCompliance(userId);

    res.status(201).json({
      ok: true,
      consentId: consent.id,
      compliance,
    });
  } catch (err) {
    console.error("[consent] acceptConsent error:", err);
    res.status(500).json({
      ok: false,
      message: "Error al registrar consentimiento",
    });
  }
};
