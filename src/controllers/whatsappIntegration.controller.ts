import type { RequestHandler } from "express";
import { handleInboundMessage } from "../services/conversations/conversationOrchestrator.service";
import { normalizeInboundMessages } from "../services/integrations/whatsapp/whatsappInboundNormalizer.service";
import type { WhatsAppWebhookPayload } from "../services/integrations/whatsapp/whatsapp.types";

export const verifyWhatsappWebhook: RequestHandler = async (req, res) => {
  const mode = String(req.query["hub.mode"] ?? "");
  const token = String(req.query["hub.verify_token"] ?? "");
  const challenge = String(req.query["hub.challenge"] ?? "");
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim() ?? "";

  if (mode === "subscribe" && expectedToken && token === expectedToken) {
    res.status(200).send(challenge);
    return;
  }

  res.status(403).json({ ok: false, message: "Invalid verify token" });
};

export const receiveWhatsappWebhook: RequestHandler = async (req, res) => {
  const payload = (req.body ?? {}) as WhatsAppWebhookPayload;

  console.log("[whatsapp][webhook] received", {
    hasBody: Boolean(req.body),
    object: (payload as any)?.object ?? null,
    entryCount: Array.isArray(payload?.entry) ? payload.entry.length : 0,
  });

  if (!payload || typeof payload !== "object") {
    console.warn("[whatsapp][webhook] invalid payload type");
    res.status(200).json({ ok: true, received: 0, ignored: "invalid_payload" });
    return;
  }

  const messages = normalizeInboundMessages(payload);

  console.log("[whatsapp][webhook] parsed messages", {
    count: messages.length,
    types: messages.map((message) => message.type),
    ids: messages.map((message) => message.waMessageId),
  });

  for (const message of messages) {
    try {
      console.log("[whatsapp][webhook] dispatch orchestrator", {
        waMessageId: message.waMessageId,
        phone: message.phone,
        type: message.type,
      });
      await handleInboundMessage(message);
    } catch (error: any) {
      console.error(
        `[whatsapp][webhook] failed message=${message.waMessageId}:`,
        error?.message ?? error
      );
    }
  }

  res.status(200).json({ ok: true, received: messages.length });
};
