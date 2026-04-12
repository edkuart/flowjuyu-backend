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
//
// The extra DB hit (SELECT terms_current FROM users WHERE id = ?) only occurs
// on routes that explicitly apply this middleware. It touches a single PK-indexed
// row and is intentionally narrow (two columns only).

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { User } from "../models/user.model";
import { getActivePolicyVersion } from "../services/consent.service";

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

    // Narrow SELECT — avoid loading the entire user row
    const user = await User.findByPk(userId, {
      attributes: ["id", "terms_current"],
    });

    if (!user) {
      res.status(401).json({ ok: false, message: "Usuario no encontrado" });
      return;
    }

    if (user.terms_current) {
      next();
      return;
    }

    // Resolve the active version only when enforcement fires.
    // This avoids a second query on every compliant request.
    let currentVersion: string | null = null;
    try {
      const activeTerms = await getActivePolicyVersion("terms");
      currentVersion = activeTerms?.version ?? null;
    } catch {
      // Non-fatal — return the 403 even if version lookup fails
    }

    res.status(403).json({
      ok:             false,
      code:           "TERMS_REQUIRED",
      needsConsent:   true,
      currentVersion,
      message:
        "Debes aceptar los términos de uso actualizados para continuar. " +
        "Visita POST /api/consent/accept para registrar tu consentimiento.",
    });
  } catch (err) {
    console.error("[requireTermsAccepted] error:", err);
    res.status(500).json({ ok: false, message: "Error interno" });
  }
};
