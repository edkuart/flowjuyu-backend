import { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import {
  createCheckoutSession,
  captureCreditPayment,
} from "../services/videoStudio/videoCreditCheckout.service";

export const checkoutRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?.id ?? req.ip),
  message: { ok: false, code: "RATE_LIMITED", message: "Demasiadas solicitudes. Espera un momento." },
});

/* ============================================================
   POST /api/seller/video-credits/checkout
   Creates a PayPal order and returns the approve URL.

   Body: { package_id: "starter"|"creador"|"pro", project_id: string }
   Response: { ok: true, approve_url: string, order_id: string }
============================================================ */
export const createCreditCheckout: RequestHandler = async (req, res) => {
  try {
    const userId    = req.user!.id;
    const packageId = typeof req.body?.package_id === "string" ? req.body.package_id.trim() : "";
    const projectId = typeof req.body?.project_id === "string" ? req.body.project_id.trim() : "";

    if (!packageId) { res.status(400).json({ ok: false, message: "package_id requerido" }); return; }
    if (!projectId) { res.status(400).json({ ok: false, message: "project_id requerido" }); return; }

    const result = await createCheckoutSession({ userId, packageId, projectId });
    res.status(201).json({ ok: true, approve_url: result.approveUrl, order_id: result.orderId });
  } catch (err: any) {
    console.error("createCreditCheckout error:", err);
    const message = err?.message?.includes("Paquete no válido")
      ? err.message
      : "Error al iniciar el pago. Intenta de nuevo.";
    res.status(500).json({ ok: false, message });
  }
};

/* ============================================================
   POST /api/seller/video-credits/capture
   Called by the frontend after PayPal redirects back.
   Verifies order ownership, captures payment, adds credits.

   Body: { order_id: string }  (the PayPal Order ID from ?token= param)
   Response: { ok: true, gtq_cents: number, new_balance: number }
============================================================ */
export const captureCreditPaymentHandler: RequestHandler = async (req, res) => {
  try {
    const userId       = req.user!.id;
    const paypalOrderId = typeof req.body?.order_id === "string" ? req.body.order_id.trim() : "";

    if (!paypalOrderId) {
      res.status(400).json({ ok: false, message: "order_id requerido" });
      return;
    }

    const result = await captureCreditPayment({ userId, paypalOrderId });
    res.json({ ok: true, gtq_cents: result.gtqCents, new_balance: result.newBalance });
  } catch (err: any) {
    console.error("captureCreditPayment error:", err);
    const code = (err as any).code ?? "CAPTURE_ERROR";
    const status =
      code === "FORBIDDEN"         ? 403 :
      code === "ORDER_NOT_FOUND"   ? 404 :
      code === "INVALID_STATUS"    ? 409 : 502;
    res.status(status).json({ ok: false, code, message: err.message ?? "Error al procesar el pago" });
  }
};

// Keep the old Stripe webhook handler stub so the route file compiles.
// This will be removed once AI credits also migrates to PayPal.
export const handleVideoCreditWebhook: RequestHandler = (_req, res) => {
  res.status(404).json({ ok: false, message: "Stripe no está habilitado. Usa PayPal." });
};
