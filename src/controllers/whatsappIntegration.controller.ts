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
  try {
    const payload = (req.body ?? {}) as WhatsAppWebhookPayload;
    const firstEntry = payload?.entry?.[0];
    const firstChange = firstEntry?.changes?.[0];
    const firstValue = firstChange?.value;
    const firstMessage = firstValue?.messages?.[0];

    console.log("📥 Incoming webhook:");
    console.log(JSON.stringify(req.body ?? {}, null, 2));

    console.log("[whatsapp][webhook] received", {
      hasBody: Boolean(req.body),
      object: (payload as any)?.object ?? null,
      entryCount: Array.isArray(payload?.entry) ? payload.entry.length : 0,
    });

    console.log("📞 From:", firstValue?.contacts?.[0]?.wa_id ?? firstMessage?.from ?? null);
    console.log("📨 Raw value:", JSON.stringify(firstValue ?? {}, null, 2));

    if (!payload || typeof payload !== "object") {
      console.warn("[whatsapp][webhook] invalid payload type");
      return void res.sendStatus(200);
    }

    if (!firstValue?.messages?.length) {
      console.log("ℹ️ Non-message event received");
      return void res.sendStatus(200);
    }

    console.log("📩 Message type:", firstMessage?.type ?? "unknown");
    console.log("💬 Message text:", firstMessage?.text?.body ?? null);

    let messages = [] as ReturnType<typeof normalizeInboundMessages>;

    try {
      messages = normalizeInboundMessages(payload);
    } catch (error: any) {
      console.error(
        "❌ WEBHOOK NORMALIZER ERROR:",
        error?.stack ?? error?.message ?? error
      );
      return void res.sendStatus(200);
    }

    console.log("[whatsapp][webhook] parsed messages", {
      count: messages.length,
      types: messages.map((message) => message.type),
      ids: messages.map((message) => message.waMessageId),
    });

    if (!messages.length) {
      console.log("⚠️ No supported messages found in payload");
      return void res.sendStatus(200);
    }

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
          error?.stack ?? error?.message ?? error
        );
      }
    }

    return void res.sendStatus(200);
  } catch (error: any) {
    console.error("❌ WEBHOOK ERROR:", error?.stack ?? error?.message ?? error);
    return void res.sendStatus(200);
  }
};
