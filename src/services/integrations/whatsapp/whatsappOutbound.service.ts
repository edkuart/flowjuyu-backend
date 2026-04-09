const GRAPH_API_VERSION = "v23.0";

type SendTextResult = {
  success: boolean;
  waMessageId: string | null;
  raw: unknown;
};

type MetaGraphErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

function maskToken(token: string): string {
  if (!token) return "missing";
  if (token.length <= 8) return "***";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function getWhatsappConfig() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim() ?? "";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? "";

  console.log("[whatsapp] token present:", Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim()));

  if (!accessToken || !phoneNumberId) {
    throw new Error(
      `WhatsApp outbound config missing: ${[
        !accessToken ? "WHATSAPP_ACCESS_TOKEN" : null,
        !phoneNumberId ? "WHATSAPP_PHONE_NUMBER_ID" : null,
      ]
        .filter(Boolean)
        .join(", ")}`
    );
  }

  return { accessToken, phoneNumberId };
}

export async function sendTextMessage(
  to: string,
  text: string
): Promise<SendTextResult> {
  const { accessToken, phoneNumberId } = getWhatsappConfig();
  const normalizedTo = to.replace(/\D/g, "");

  console.log("[whatsapp][outbound] attempt", {
    phoneNumberId,
    to: normalizedTo,
    textLength: text.length,
    tokenPreview: maskToken(accessToken),
  });

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizedTo,
        type: "text",
        text: {
          body: text,
        },
      }),
    }
  );

  const raw = await response.json().catch(() => null);
  const metaError = (raw as MetaGraphErrorPayload | null)?.error;

  console.log("[whatsapp][outbound] meta response", {
    status: response.status,
    ok: response.ok,
    errorMessage: metaError?.message ?? null,
    errorType: metaError?.type ?? null,
    errorCode: metaError?.code ?? null,
    errorSubcode: metaError?.error_subcode ?? null,
    raw,
  });

  if (!response.ok) {
    if (response.status === 401 || metaError?.code === 190) {
      console.error("[whatsapp][outbound] TOKEN EXPIRED OR INVALID", {
        status: response.status,
        errorMessage: metaError?.message ?? null,
        errorCode: metaError?.code ?? null,
        errorType: metaError?.type ?? null,
        phoneNumberId,
      });
    }

    throw new Error(
      `WhatsApp outbound failed: status=${response.status} code=${metaError?.code ?? "n/a"} type=${metaError?.type ?? "n/a"} message=${metaError?.message ?? JSON.stringify(raw)}`
    );
  }

  const waMessageId =
    Array.isArray((raw as any)?.messages) && (raw as any).messages[0]?.id
      ? String((raw as any).messages[0].id)
      : null;

  return {
    success: true,
    waMessageId,
    raw,
  };
}
