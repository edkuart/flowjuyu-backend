type LiveExternalPreview = {
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  canonical_url: string | null;
};

type CacheEntry = {
  expiresAt: number;
  value: LiveExternalPreview | null;
};

const PREVIEW_TTL_MS = 1000 * 60 * 10;
const REQUEST_TIMEOUT_MS = 3000;
const previewCache = new Map<string, CacheEntry>();

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function readMetaTag(html: string, attrName: "property" | "name", attrValue: string) {
  const escapedValue = attrValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+${attrName}=["']${escapedValue}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+${attrName}=["']${escapedValue}["'][^>]*>`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1].trim());
  }

  return null;
}

function readTitleTag(html: string) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1].trim()) : null;
}

function normalizeExternalUrl(value: string | null) {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function getLiveExternalPreview(
  sourceUrl: string | null,
): Promise<LiveExternalPreview | null> {
  const normalizedUrl = normalizeExternalUrl(sourceUrl);
  if (!normalizedUrl) return null;

  const now = Date.now();
  const cached = previewCache.get(normalizedUrl);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(normalizedUrl, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; FlowjuyuBot/1.0; +https://flowjuyu.com)",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      previewCache.set(normalizedUrl, {
        expiresAt: now + PREVIEW_TTL_MS,
        value: null,
      });
      return null;
    }

    const html = await response.text();
    const preview: LiveExternalPreview = {
      title:
        readMetaTag(html, "property", "og:title") ??
        readMetaTag(html, "name", "twitter:title") ??
        readTitleTag(html),
      description:
        readMetaTag(html, "property", "og:description") ??
        readMetaTag(html, "name", "description") ??
        readMetaTag(html, "name", "twitter:description"),
      image_url:
        normalizeExternalUrl(
          readMetaTag(html, "property", "og:image") ??
            readMetaTag(html, "name", "twitter:image"),
        ) ?? null,
      site_name: readMetaTag(html, "property", "og:site_name"),
      canonical_url:
        normalizeExternalUrl(readMetaTag(html, "property", "og:url")) ??
        normalizedUrl,
    };

    const hasUsefulData = Boolean(
      preview.title ||
        preview.description ||
        preview.image_url ||
        preview.site_name,
    );
    const result = hasUsefulData ? preview : null;

    previewCache.set(normalizedUrl, {
      expiresAt: now + PREVIEW_TTL_MS,
      value: result,
    });

    return result;
  } catch {
    previewCache.set(normalizedUrl, {
      expiresAt: now + PREVIEW_TTL_MS,
      value: null,
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
