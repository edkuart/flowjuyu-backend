export type NormalizedInboundMessage = {
  channel: "whatsapp";
  phone: string;
  waMessageId: string;
  type: "text" | "image" | "audio";
  text?: string;
  mediaId?: string;
  mimeType?: string;
  rawPayload: unknown;
};

export type WhatsAppWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: {
          phone_number_id?: string;
          display_phone_number?: string;
        };
        contacts?: Array<{
          wa_id?: string;
        }>;
        messages?: Array<{
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
          image?: { id?: string; mime_type?: string };
          audio?: { id?: string; mime_type?: string; voice?: boolean };
        }>;
      };
    }>;
  }>;
};
