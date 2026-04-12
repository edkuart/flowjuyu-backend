/**
 * ProductMediaService
 *
 * Centralizes all product image storage logic — upload, URL resolution,
 * and cleanup — for both the web (Multer files) and WhatsApp (media IDs)
 * channels. Both channels write to the same Supabase bucket ("productos")
 * under the same path pattern ("products/..."), producing the same
 * StoredImage shape.
 *
 * Boundaries:
 *   • This service owns: bucket name, path naming, upload, getPublicUrl, remove.
 *   • whatsappMedia.service.ts owns: downloading raw bytes from Meta's CDN.
 *   • Callers own: DB writes (producto_imagenes rows, draft image_json, etc.).
 *
 * Phase 3 note: when publish logic is unified, callers will pass StoredImage[]
 * directly into the shared publish layer instead of managing URLs themselves.
 */

import supabase from "../../lib/supabase";
import { downloadMediaBuffer } from "../integrations/whatsapp/whatsappMedia.service";

// ── Constants ──────────────────────────────────────────────────────────────────

const BUCKET = "productos";
const PATH_PREFIX = "products";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StoredImage = {
  /** Fully-qualified Supabase public URL. */
  publicUrl: string;
  /** Relative path inside the bucket — use this for cleanup / remove() calls. */
  storagePath: string;
  /** Original or inferred file name (without path prefix). */
  fileName: string;
  /** MIME type used at upload time; null if unknown. */
  mimeType: string | null;
  /** Which channel produced this image. */
  source: "web" | "whatsapp";
};

// ── Internal helpers ───────────────────────────────────────────────────────────

function pickExtensionFromMime(mimeType: string | null | undefined): string {
  switch (mimeType) {
    case "image/png":  return "png";
    case "image/webp": return "webp";
    case "image/gif":  return "gif";
    case "image/avif": return "avif";
    default:           return "jpg";
  }
}

/**
 * Sanitizes a raw filename stem for safe use in Supabase storage paths.
 * Strips the extension, replaces unsafe characters, caps length at 60.
 */
function sanitizeFileStem(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")           // strip extension
    .replace(/[^a-zA-Z0-9_\-]/g, "_")  // replace unsafe chars
    .slice(0, 60);
}

/**
 * Generates a collision-resistant storage path inside the bucket.
 * Format: products/{timestamp}-{random}-{safe_name}.{ext}
 */
function buildStoragePath(stem: string, ext: string): string {
  const rand = Math.round(Math.random() * 1e9);
  const fileName = `${Date.now()}-${rand}-${stem}.${ext}`;
  return `${PATH_PREFIX}/${fileName}`;
}

async function uploadBuffer(
  buffer: Buffer,
  storagePath: string,
  mimeType: string | null,
): Promise<string> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimeType ?? "image/jpeg",
      upsert: false,
    });

  if (error) {
    throw new Error(`[productMedia] Supabase upload failed (path=${storagePath}): ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Uploads a file received via Multer (web channel) and returns a StoredImage.
 *
 * The caller is responsible for tracking the returned `storagePath` and calling
 * `deleteStoredImages()` if a subsequent DB write fails.
 */
export async function uploadFromMulterFile(
  file: Express.Multer.File,
): Promise<StoredImage> {
  const ext = file.originalname.split(".").pop()?.toLowerCase() ?? pickExtensionFromMime(file.mimetype);
  const stem = sanitizeFileStem(file.originalname);
  const storagePath = buildStoragePath(stem, ext);
  const mimeType = file.mimetype || null;

  const publicUrl = await uploadBuffer(file.buffer, storagePath, mimeType);

  const fileName = storagePath.split("/").pop()!;
  return { publicUrl, storagePath, fileName, mimeType, source: "web" };
}

/**
 * Downloads a WhatsApp media asset and uploads it to Supabase storage.
 *
 * `hintMimeType` — MIME type already stored on the draft (from the original
 * WhatsApp message). When present it takes precedence over the Content-Type
 * header returned by Meta's CDN, which is sometimes unreliable.
 *
 * The caller is responsible for tracking the returned `storagePath` and calling
 * `deleteStoredImages()` if a subsequent DB write fails.
 */
export async function uploadFromWhatsAppMedia(
  mediaId: string,
  hintMimeType?: string | null,
): Promise<StoredImage> {
  const { buffer, mimeType: downloadedMime } = await downloadMediaBuffer(mediaId);
  const resolvedMime = hintMimeType?.trim() || downloadedMime || null;
  const ext = pickExtensionFromMime(resolvedMime);
  const storagePath = buildStoragePath(mediaId, ext);

  const publicUrl = await uploadBuffer(buffer, storagePath, resolvedMime);

  const fileName = storagePath.split("/").pop()!;
  return { publicUrl, storagePath, fileName, mimeType: resolvedMime, source: "whatsapp" };
}

/**
 * Removes previously uploaded images from Supabase storage.
 *
 * Safe to call with an empty array — no-op. Errors are swallowed individually
 * so a single inaccessible file does not prevent the rest from being cleaned up.
 */
export async function deleteStoredImages(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0) return;

  const { error } = await supabase.storage.from(BUCKET).remove(storagePaths);
  if (error) {
    // Non-fatal: log and move on. Orphaned files in storage are a known
    // operational risk; they can be cleaned up by a scheduled job.
    console.warn(`[productMedia] cleanup partial failure: ${error.message}`);
  }
}
