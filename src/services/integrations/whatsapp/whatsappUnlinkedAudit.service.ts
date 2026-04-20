import WhatsappUnlinkedSellerAttempt, {
  type WhatsappUnlinkedAttemptReason,
} from "../../../models/WhatsappUnlinkedSellerAttempt.model";
import { logAuditEvent } from "../../audit.service";

type RecordWhatsappUnlinkedAttemptInput = {
  sessionId: string | null;
  sellerUserId: number | null;
  phoneE164: string;
  waMessageId: string;
  messageType: string;
  messageText?: string | null;
  reason: WhatsappUnlinkedAttemptReason;
  metadata?: Record<string, unknown> | null;
};

function buildMessagePreview(input: string | null | undefined): string | null {
  const normalized = String(input ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  return normalized.slice(0, 280);
}

export async function recordWhatsappUnlinkedAttempt(
  input: RecordWhatsappUnlinkedAttemptInput
): Promise<void> {
  try {
    await WhatsappUnlinkedSellerAttempt.create({
      session_id: input.sessionId,
      seller_user_id: input.sellerUserId,
      phone_e164: input.phoneE164,
      wa_message_id: input.waMessageId,
      message_type: input.messageType,
      message_preview: buildMessagePreview(input.messageText),
      reason: input.reason,
      metadata: input.metadata ?? null,
    });
  } catch (error: any) {
    console.error("[whatsapp][unlinked-audit] failed to persist attempt", {
      wa_message_id: input.waMessageId,
      reason: input.reason,
      error: error?.message ?? String(error),
    });
  }

  await logAuditEvent({
    actor_user_id: input.sellerUserId,
    actor_role: input.sellerUserId ? "seller" : "anonymous",
    action: "whatsapp.unlinked_attempt",
    entity_type: "whatsapp_phone",
    entity_id: input.phoneE164,
    target_user_id: input.sellerUserId,
    ip_address: "unknown",
    user_agent: "whatsapp-webhook",
    http_method: "WEBHOOK",
    route: "/api/integrations/whatsapp/webhook",
    status: "blocked",
    severity: input.sellerUserId ? "medium" : "low",
    metadata: {
      reason: input.reason,
      wa_message_id: input.waMessageId,
      message_type: input.messageType,
      session_id: input.sessionId,
      ...((input.metadata ?? {}) as Record<string, unknown>),
    },
  });
}
