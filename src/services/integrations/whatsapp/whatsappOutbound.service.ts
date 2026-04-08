const GRAPH_API_VERSION = "v23.0";

type SendTextResult = {
  success: boolean;
  waMessageId: string | null;
  raw: unknown;
};

function getWhatsappConfig() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim() ?? "";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? "";

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

  console.log("[whatsapp][outbound] meta response", {
    status: response.status,
    ok: response.ok,
    raw,
  });

  if (!response.ok) {
    throw new Error(
      `WhatsApp outbound failed: ${response.status} ${JSON.stringify(raw)}`
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
