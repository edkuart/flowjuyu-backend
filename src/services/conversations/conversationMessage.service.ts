import ConversationMessage from "../../models/ConversationMessage.model";
import type { NormalizedInboundMessage } from "../integrations/whatsapp/whatsapp.types";

export async function findInboundMessageByWaId(
  channel: string,
  waMessageId: string
): Promise<ConversationMessage | null> {
  return ConversationMessage.findOne({
    where: {
      channel,
      wa_message_id: waMessageId,
    },
  });
}

export async function saveInboundMessageIfNew(params: {
  sessionId: string;
  message: NormalizedInboundMessage;
}): Promise<{ created: boolean; record: ConversationMessage }> {
  const existing = await findInboundMessageByWaId(
    params.message.channel,
    params.message.waMessageId
  );

  if (existing) {
    return { created: false, record: existing };
  }

  const record = await ConversationMessage.create({
    session_id: params.sessionId,
    channel: params.message.channel,
    direction: "inbound",
    message_type: params.message.type,
    content_text: params.message.text ?? null,
    media_id: params.message.mediaId ?? null,
    mime_type: params.message.mimeType ?? null,
    wa_message_id: params.message.waMessageId,
    status: "received",
    raw_payload: (params.message.rawPayload as object) ?? null,
  });

  return { created: true, record };
}

export async function markMessageProcessed(
  message: ConversationMessage,
  status: "processed" | "ignored" = "processed"
): Promise<void> {
  await message.update({ status });
}

export async function saveOutboundTextMessage(params: {
  sessionId: string;
  contentText: string;
  waMessageId?: string | null;
  status: "sent" | "failed";
  rawPayload?: unknown;
}): Promise<ConversationMessage> {
  return ConversationMessage.create({
    session_id: params.sessionId,
    channel: "whatsapp",
    direction: "outbound",
    message_type: "text",
    content_text: params.contentText,
    media_id: null,
    mime_type: null,
    wa_message_id: params.waMessageId ?? null,
    status: params.status,
    raw_payload: (params.rawPayload as object) ?? null,
  });
}

export async function updateInboundMessageTranscription(
  message: ConversationMessage,
  contentText: string
): Promise<ConversationMessage> {
  await message.update({
    content_text: contentText,
  });

  return message;
}
