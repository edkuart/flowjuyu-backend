import supabase from "../../lib/supabase";

const BUCKET = "videos";
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const DOWNLOAD_TIMEOUT_MS = 60_000;

// Only download from known provider domains
const ALLOWED_ORIGINS = new Set([
  "fal.run",
  "fal.media",
  "v2.fal.media",
  "runwayml.com",
  "api.runwayml.com",
  "cdn.runwayml.com",
]);

function isAllowedOrigin(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    // Allow exact match or subdomain match
    return ALLOWED_ORIGINS.has(hostname) ||
      [...ALLOWED_ORIGINS].some((h) => hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export interface StorageResult {
  publicUrl: string;
  storagePath: string;
  sizeBytes: number;
}

export async function uploadVideoFromUrl(params: {
  sourceUrl: string;
  projectId: string;
  generationId: string;
  userId: number;
}): Promise<StorageResult> {
  const { sourceUrl, projectId, generationId, userId } = params;

  if (!isAllowedOrigin(sourceUrl)) {
    throw new Error(`URL de origen no permitida: ${new URL(sourceUrl).hostname}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  let arrayBuffer: ArrayBuffer;
  let contentType: string;

  try {
    const response = await fetch(sourceUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Provider devolvió ${response.status} al descargar video`);
    }

    contentType = response.headers.get("content-type") ?? "video/mp4";
    if (!contentType.startsWith("video/")) {
      throw new Error(`Tipo de contenido no es video: ${contentType}`);
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > MAX_BYTES) {
      throw new Error(`Video excede el límite de 50 MB (${contentLength} bytes)`);
    }

    arrayBuffer = await response.arrayBuffer();

    if (arrayBuffer.byteLength > MAX_BYTES) {
      throw new Error(`Video excede el límite de 50 MB (${arrayBuffer.byteLength} bytes)`);
    }
  } finally {
    clearTimeout(timer);
  }

  // Derive extension from content-type (video/mp4 → .mp4, video/webm → .webm)
  const ext = contentType.split("/")[1]?.split(";")[0] ?? "mp4";
  const storagePath = `${userId}/${projectId}/${generationId}.${ext}`;

  // Ensure bucket exists before first upload (lazy, non-blocking at startup)
  await _ensureBucketExists();

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Error subiendo video a Supabase: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  console.log(`[videoStorage] uploaded ${storagePath} (${arrayBuffer.byteLength} bytes)`);

  return {
    publicUrl: urlData.publicUrl,
    storagePath,
    sizeBytes: arrayBuffer.byteLength,
  };
}

async function _ensureBucketExists(): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === BUCKET);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (error && !error.message.includes("already exists")) {
      console.error("[videoStorage] Failed to create videos bucket:", error.message);
    } else {
      console.log('[videoStorage] Created "videos" bucket');
    }
  }
}
