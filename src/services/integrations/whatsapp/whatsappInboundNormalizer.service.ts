import type {
  NormalizedInboundMessage,
  WhatsAppWebhookPayload,
} from "./whatsapp.types";

function normalizePhoneToE164(input: string): string {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits) return "";
  return `+${digits}`;
}

export function normalizeInboundMessages(
  payload: WhatsAppWebhookPayload
): NormalizedInboundMessage[] {
  const messages: NormalizedInboundMessage[] = [];

  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];

    for (const change of changes) {
      const value = change.value;
      const inboundMessages = Array.isArray(value?.messages) ? value.messages : [];
      if (!inboundMessages.length) continue;

      for (const message of inboundMessages) {
        const phone = normalizePhoneToE164(
          message.from ?? value?.contacts?.[0]?.wa_id ?? ""
        );
        const waMessageId = String(message.id ?? "").trim();

        if (!phone || !waMessageId) continue;

        if (message.type === "text") {
          const text = String(message.text?.body ?? "").trim();
          messages.push({
            channel: "whatsapp",
            phone,
            waMessageId,
            type: "text",
            text,
            rawPayload: message,
          });
          continue;
        }

        if (message.type === "image") {
          messages.push({
            channel: "whatsapp",
            phone,
            waMessageId,
            type: "image",
            mediaId: message.image?.id,
            mimeType: message.image?.mime_type,
            rawPayload: message,
          });
          continue;
        }

        if (message.type === "audio") {
          messages.push({
            channel: "whatsapp",
            phone,
            waMessageId,
            type: "audio",
            mediaId: message.audio?.id,
            mimeType: message.audio?.mime_type,
            rawPayload: message,
          });
          continue;
        }

        console.log("[whatsapp][normalizer] unsupported message type", {
          type: message.type ?? "unknown",
          waMessageId,
          phone,
        });
      }
    }
  }

  return messages;
}
