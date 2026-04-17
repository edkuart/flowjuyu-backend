import http from "node:http";
import https from "node:https";
import { Resolver } from "node:dns";
import { Router, Request, Response, NextFunction, type Router as ExpressRouter } from "express";
import supabase from "../lib/supabase";
import { renderCategoryArtBySlug } from "../utils/categoryArt";
import { inferContentType } from "../utils/mediaProxy";

const router: ExpressRouter = Router();
const dnsResolver = new Resolver();

dnsResolver.setServers(["1.1.1.1", "8.8.8.8"]);

type BinaryFetchResponse = {
  buffer: Buffer;
  headers: Record<string, string | string[] | undefined>;
  status: number;
};

function isDnsResolutionError(error: unknown): boolean {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : null;

  return code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "EAI_FAIL";
}

function fetchWithResolver(
  url: URL,
  method: "GET" | "HEAD",
): Promise<BinaryFetchResponse> {
  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method,
        servername: url.hostname,
        headers: { Host: url.host, Accept: "*/*" },
        lookup(hostname, _options, callback) {
          dnsResolver.resolve4(hostname, (error, addresses) => {
            if (error) {
              callback(
                error instanceof Error
                  ? error
                  : new Error(`DNS fallback failed for ${hostname}`),
                "",
                4,
              );
              return;
            }

            if (!addresses?.[0]) {
              callback(
                new Error(`DNS fallback returned no A record for ${hostname}`),
                "",
                4,
              );
              return;
            }

            callback(null, addresses[0], 4);
          });
        },
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          resolve({
            buffer: Buffer.concat(chunks),
            headers: response.headers,
            status: response.statusCode ?? 502,
          });
        });
      },
    );

    request.on("error", reject);
    request.end();
  });
}

async function fetchBinaryUrl(
  rawUrl: string,
  method: "GET" | "HEAD",
): Promise<BinaryFetchResponse> {
  const url = new URL(rawUrl);

  try {
    const response = await fetch(url, {
      method,
      headers: method === "HEAD" ? { Accept: "*/*" } : undefined,
    });

    return {
      buffer: method === "HEAD" ? Buffer.alloc(0) : Buffer.from(await response.arrayBuffer()),
      headers: Object.fromEntries(response.headers.entries()),
      status: response.status,
    };
  } catch (error) {
    if (!isDnsResolutionError((error as { cause?: unknown })?.cause ?? error)) {
      throw error;
    }

    return fetchWithResolver(url, method);
  }
}

async function sendBlobResponse(
  req: Request,
  res: Response,
  blob: Blob,
  storagePath: string,
): Promise<void> {
  const buffer = Buffer.from(await blob.arrayBuffer());

  res.setHeader("Content-Type", blob.type || inferContentType(storagePath));
  res.setHeader(
    "Cache-Control",
    "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  );
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  if (req.method === "HEAD") {
    res.status(200).end();
    return;
  }

  res.status(200).send(buffer);
}

router.use(async (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    next();
    return;
  }

  const trimmed = req.path.replace(/^\/+/, "");
  if (!trimmed) {
    res.status(404).json({ message: "Media not found" });
    return;
  }

  const categoryMatch = trimmed.match(/^category-art\/([^/]+)\.svg$/i);
  if (categoryMatch) {
    const svg = renderCategoryArtBySlug(decodeURIComponent(categoryMatch[1]));
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader(
      "Cache-Control",
      "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    );
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    if (req.method === "HEAD") {
      res.status(200).end();
      return;
    }

    res.status(200).send(svg);
    return;
  }

  const [bucket, ...parts] = trimmed.split("/");
  const storagePath = decodeURIComponent(parts.join("/"));

  if (!bucket || !storagePath) {
    res.status(404).json({ message: "Media not found" });
    return;
  }

  try {
    const decodedBucket = decodeURIComponent(bucket);
    const { data: publicUrlData } = supabase.storage
      .from(decodedBucket)
      .getPublicUrl(storagePath);

    const publicResponse = await fetchBinaryUrl(
      publicUrlData.publicUrl,
      req.method,
    );

    if (publicResponse.status >= 200 && publicResponse.status < 300) {
      const contentType =
        (Array.isArray(publicResponse.headers["content-type"])
          ? publicResponse.headers["content-type"][0]
          : publicResponse.headers["content-type"]) ||
        inferContentType(storagePath);

      res.setHeader("Content-Type", contentType);
      res.setHeader(
        "Cache-Control",
        (Array.isArray(publicResponse.headers["cache-control"])
          ? publicResponse.headers["cache-control"][0]
          : publicResponse.headers["cache-control"]) ||
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      );
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

      if (req.method === "HEAD") {
        res.status(200).end();
        return;
      }

      res.status(200).send(publicResponse.buffer);
      return;
    }

    const { data, error } = await supabase.storage
      .from(decodedBucket)
      .download(storagePath);

    if (error || !data) {
      console.warn("[media] storage miss", {
        bucket: decodedBucket,
        storagePath,
        publicStatus: publicResponse.status,
        publicUrl: publicUrlData.publicUrl,
        error: error?.message ?? null,
      });
      res.status(404).json({ message: "Media not found" });
      return;
    }

    await sendBlobResponse(req, res, data, storagePath);
  } catch (error) {
    console.error("[media] proxy error:", error);
    res.status(502).json({ message: "Media fetch failed" });
  }
});

export default router;
