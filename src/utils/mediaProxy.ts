import path from "path";

type SupabaseStorageRef = {
  bucket: string;
  storagePath: string;
};

const OBJECT_PREFIX = "/storage/v1/object/public/";
const RENDER_PREFIX = "/storage/v1/render/image/public/";

function getMediaBaseUrl(): string {
  const base =
    process.env.PUBLIC_API_BASE_URL ||
    process.env.API_PUBLIC_BASE_URL ||
    process.env.APP_BASE_URL ||
    `http://localhost:${process.env.PORT || 8800}`;

  return base.replace(/\/$/, "");
}

function encodeStoragePath(storagePath: string): string {
  return storagePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function extractSupabaseStorageRef(
  value: string | null | undefined,
): SupabaseStorageRef | null {
  if (!value || typeof value !== "string") return null;

  try {
    const url = new URL(value.trim());
    const pathname = url.pathname;

    let prefix = "";
    if (pathname.startsWith(OBJECT_PREFIX)) prefix = OBJECT_PREFIX;
    else if (pathname.startsWith(RENDER_PREFIX)) prefix = RENDER_PREFIX;
    else return null;

    const remainder = pathname.slice(prefix.length);
    const [bucket, ...pathParts] = remainder.split("/").filter(Boolean);
    const storagePath = pathParts.join("/");

    if (!bucket || !storagePath) return null;

    return { bucket, storagePath };
  } catch {
    return null;
  }
}

export function buildMediaProxyUrl(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const ref = extractSupabaseStorageRef(trimmed);
  if (!ref) return trimmed;

  return `${getMediaBaseUrl()}/media/${encodeURIComponent(ref.bucket)}/${encodeStoragePath(ref.storagePath)}`;
}

export function inferContentType(storagePath: string): string {
  const ext = path.extname(storagePath).toLowerCase();

  switch (ext) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    case ".avif":
      return "image/avif";
    case ".jpg":
    case ".jpeg":
    default:
      return "image/jpeg";
  }
}
