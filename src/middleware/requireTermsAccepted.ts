// src/middleware/requireTermsAccepted.ts
//
// Enforcement gate for consent compliance.
// Must be placed AFTER verifyToken() on any route that requires a valid
// terms acceptance. On its own it does nothing — verifyToken must have
// already populated req.user.
//
// Usage:
//   router.get('/sensitive', requireAuth, requireTermsAccepted, handler)
//   router.use('/admin-zone', requireRole('admin'), requireTermsAccepted)
//
// On failure → 403 with:
//   { ok: false, code: 'TERMS_REQUIRED', needsConsent: true, currentVersion }

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { resolveConsentAccess } from "../services/consent.service";

export const requireTermsAccepted: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = (req as any).user?.id as number | undefined;

    if (!userId) {
      // verifyToken should have handled this — defensive fallback only
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const consent = await resolveConsentAccess(userId);

    if (!consent.missingPolicies.includes("terms")) {
      next();
      return;
    }

    res.status(403).json({
      ok:             false,
      code:           "TERMS_REQUIRED",
      needsConsent:   true,
      currentVersion: consent.activeVersions.terms?.versionCode ?? null,
      consent,
      message:
        "Debes aceptar los términos de uso actualizados para continuar. " +
        "Visita POST /api/consent/accept para registrar tu consentimiento.",
    });
  } catch (err) {
    console.error("[requireTermsAccepted] error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};
