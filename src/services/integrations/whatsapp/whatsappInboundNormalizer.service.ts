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

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages?.length) continue;

      for (const message of value.messages) {
        const phone = normalizePhoneToE164(
          message.from ?? value.contacts?.[0]?.wa_id ?? ""
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
        }
      }
    }
  }

  return messages;
}
