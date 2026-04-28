// PayPal Orders API v2 client — server-side only.
// Docs: https://developer.paypal.com/docs/api/orders/v2/
//
// Required env vars:
//   PAYPAL_CLIENT_ID   — from developer.paypal.com
//   PAYPAL_SECRET      — from developer.paypal.com
//   PAYPAL_ENV         — "sandbox" | "live"  (default: "sandbox")

const PAYPAL_BASE =
  process.env.PAYPAL_ENV === "live"
    ? "https://api.paypal.com"
    : "https://api.sandbox.paypal.com";

if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_SECRET) {
  console.warn("[paypal] PAYPAL_CLIENT_ID / PAYPAL_SECRET no configurados — pagos deshabilitados.");
}

// ─── OAuth token (cached for 8 h) ─────────────────────────────────────────────

let _token: { value: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (_token && Date.now() < _token.expiresAt - 60_000) {
    return _token.value;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID ?? "MISSING";
  const secret   = process.env.PAYPAL_SECRET ?? "MISSING";
  const auth     = Buffer.from(`${clientId}:${secret}`).toString("base64");

  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PayPal auth error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  _token = {
    value:     data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return _token.value;
}

// ─── Create order ──────────────────────────────────────────────────────────────

export interface CreateOrderInput {
  amountUsdCents: number;
  description:    string;
  referenceId:    string;  // your internal transaction ID (idempotency)
  returnUrl:      string;
  cancelUrl:      string;
}

export interface PayPalOrderResult {
  orderId:    string;
  approveUrl: string;
}

export async function createOrder(input: CreateOrderInput): Promise<PayPalOrderResult> {
  const token = await getAccessToken();

  const amountDecimal = (input.amountUsdCents / 100).toFixed(2);

  const body = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: input.referenceId,
        amount: {
          currency_code: "USD",
          value: amountDecimal,
        },
        description: input.description,
      },
    ],
    application_context: {
      brand_name:   "Flowjuyu",
      landing_page: "BILLING",    // show card fields by default
      user_action:  "PAY_NOW",    // "Pay Now" button instead of "Continue"
      return_url:   input.returnUrl,
      cancel_url:   input.cancelUrl,
    },
  };

  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization:      `Bearer ${token}`,
      "Content-Type":     "application/json",
      "PayPal-Request-Id": input.referenceId, // idempotency key
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PayPal create order ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    id:    string;
    links: { rel: string; href: string }[];
  };

  const approveUrl = data.links.find((l) => l.rel === "approve")?.href;
  if (!approveUrl) throw new Error("PayPal no devolvió una URL de aprobación");

  return { orderId: data.id, approveUrl };
}

// ─── Capture order ─────────────────────────────────────────────────────────────

export interface CaptureResult {
  captureId: string;
  status:    "COMPLETED" | "PENDING" | "FAILED" | string;
}

export async function captureOrder(orderId: string): Promise<CaptureResult> {
  const token = await getAccessToken();

  const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PayPal capture ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    status: string;
    purchase_units: {
      payments: {
        captures: { id: string; status: string }[];
      };
    }[];
  };

  const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture) throw new Error("PayPal no devolvió información de captura");

  return { captureId: capture.id, status: data.status };
}

// ─── Get order (for verification) ─────────────────────────────────────────────

export async function getOrder(orderId: string): Promise<{ id: string; status: string; referenceId: string }> {
  const token = await getAccessToken();
  const res   = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PayPal get order ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    id: string;
    status: string;
    purchase_units: { reference_id: string }[];
  };

  return {
    id:          data.id,
    status:      data.status,
    referenceId: data.purchase_units?.[0]?.reference_id ?? "",
  };
}
