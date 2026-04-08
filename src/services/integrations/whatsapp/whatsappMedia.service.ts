const GRAPH_API_VERSION = "v23.0";
const DEFAULT_MEDIA_TIMEOUT_MS = 15000;
const DEFAULT_MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/ogg",
  "audio/ogg; codecs=opus",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/amr",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
]);

function getAccessToken(): string {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim() ?? "";
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN is required");
  return token;
}

function getTimeoutMs(): number {
  const value = Number(process.env.WHATSAPP_MEDIA_TIMEOUT_MS || DEFAULT_MEDIA_TIMEOUT_MS);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_MEDIA_TIMEOUT_MS;
  return value;
}

function normalizeMimeType(mimeType: string | null | undefined): string {
  return String(mimeType ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

export async function getMediaDownloadUrl(mediaId: string): Promise<string> {
  const token = getAccessToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(mediaId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    }
  ).finally(() => clearTimeout(timeout));

  const data = await response.json().catch(() => null) as { url?: string } | null;
  if (!response.ok || !data?.url) {
    throw new Error(
      `WhatsApp media URL fetch failed: ${response.status} ${JSON.stringify(data)}`
    );
  }

  return String(data.url);
}

export async function downloadMediaBuffer(mediaId: string): Promise<{
  buffer: Buffer;
  mimeType: string;
}> {
  const token = getAccessToken();
  const url = await getMediaDownloadUrl(mediaId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`WhatsApp media download failed: ${response.status} ${text}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const mimeType =
    response.headers.get("content-type")?.split(";")[0]?.trim() ||
    "image/jpeg";

  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType,
  };
}

export async function downloadAudioMediaBuffer(mediaId: string): Promise<{
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
}> {
  const token = getAccessToken();
  const url = await getMediaDownloadUrl(mediaId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`WhatsApp audio download failed: ${response.status} ${text}`);
  }

  const mimeType = normalizeMimeType(response.headers.get("content-type"));
  if (!ALLOWED_AUDIO_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported audio mime type: ${mimeType || "unknown"}`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > DEFAULT_MAX_AUDIO_BYTES) {
    throw new Error(`Audio file exceeds ${DEFAULT_MAX_AUDIO_BYTES} bytes`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length === 0) {
    throw new Error("Audio file is empty");
  }
  if (buffer.length > DEFAULT_MAX_AUDIO_BYTES) {
    throw new Error(`Audio file exceeds ${DEFAULT_MAX_AUDIO_BYTES} bytes`);
  }

  return {
    buffer,
    mimeType,
    sizeBytes: buffer.length,
  };
}
