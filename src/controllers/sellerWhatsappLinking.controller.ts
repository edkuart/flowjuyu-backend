import type { RequestHandler } from "express";
import {
  generateSellerWhatsappLinkingToken,
  getSellerWhatsappLinkStatus,
  revokeSellerWhatsappLink,
} from "../services/integrations/whatsapp/whatsappLinking.service";
import { logAuditEventFromRequest } from "../services/audit.service";

export const getWhatsappLinkStatus: RequestHandler = async (req, res) => {
  const sellerUserId = Number(req.user!.id);
  const status = await getSellerWhatsappLinkStatus(sellerUserId);
  res.set("Cache-Control", "no-store");

  res.json({
    ok: true,
    data: {
      ...status,
      instructions:
        "Genera un código y envíalo por WhatsApp al bot desde el número que quieres vincular.",
    },
  });
};

export const createWhatsappLinkToken: RequestHandler = async (req, res) => {
  const sellerUserId = Number(req.user!.id);
  const result = await generateSellerWhatsappLinkingToken(sellerUserId);

  await logAuditEventFromRequest(req, {
    actor_user_id: sellerUserId,
    actor_role: req.user?.role ?? "seller",
    action: "whatsapp.link.token.generated",
    entity_type: "whatsapp_link_token",
    entity_id: result.tokenHint,
    target_user_id: sellerUserId,
    status: "success",
    severity: "medium",
    metadata: {
      expires_at: result.expiresAt,
    },
  });

  res.status(201).json({
    ok: true,
    data: {
      code: result.code,
      expiresAt: result.expiresAt,
      instructions:
        "Envía este código por WhatsApp al bot desde el número que quieres vincular. El código se puede usar una sola vez.",
    },
  });
};

export const revokeWhatsappLink: RequestHandler = async (req, res) => {
  const sellerUserId = Number(req.user!.id);
  const result = await revokeSellerWhatsappLink(sellerUserId, sellerUserId);

  await logAuditEventFromRequest(req, {
    actor_user_id: sellerUserId,
    actor_role: req.user?.role ?? "seller",
    action: result.revoked
      ? "whatsapp.link.revoked"
      : "whatsapp.link.revoke.noop",
    entity_type: "whatsapp_link",
    entity_id: result.phoneE164,
    target_user_id: sellerUserId,
    status: "success",
    severity: "medium",
    metadata: {
      phone_e164: result.phoneE164,
    },
  });

  res.json({
    ok: true,
    data: result,
    message: result.revoked
      ? "El vínculo de WhatsApp fue revocado correctamente."
      : "No había un número vinculado para revocar.",
  });
};
