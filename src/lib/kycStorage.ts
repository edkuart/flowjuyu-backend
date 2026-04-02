// src/lib/kycStorage.ts
//
// Centralised helper for KYC document storage.
//
// KYC files (DPI front/back, selfie) contain government-issued PII and must
// NEVER be exposed via public URLs. The Supabase bucket "vendedores_dpi" must
// be configured as PRIVATE (no public access policy).
//
// Database columns store only the storage path (key), not a URL.
// Signed URLs are generated on-demand, are time-limited, and are only issued
// to authenticated admin/support users via the backend.

import supabase from "./supabase";

const KYC_BUCKET = "vendedores_dpi";

/**
 * Default signed-URL expiry in seconds (1 hour).
 * Admins reviewing KYC docs get a window to open the image.
 */
const DEFAULT_EXPIRY_SECONDS = 60 * 60;

/**
 * Generates a time-limited signed URL for a KYC file.
 *
 * @param storagePath  The storage key returned by uploadKycFile(), e.g.
 *                     "dpi_frente/550e8400-e29b-41d4-a716-446655440000.jpg"
 * @param expiresIn    Validity period in seconds (default 3600)
 * @returns            Signed URL string
 * @throws             If Supabase returns an error (caller should handle)
 */
export async function getKycSignedUrl(
  storagePath: string,
  expiresIn = DEFAULT_EXPIRY_SECONDS,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(KYC_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(
      `kycStorage: failed to generate signed URL for "${storagePath}": ${error?.message ?? "no data"}`
    );
  }

  return data.signedUrl;
}

/**
 * Uploads a file buffer to the KYC bucket and returns the storage path (key).
 *
 * The path — not a URL — is what gets persisted to the database.
 * Call getKycSignedUrl() whenever the file needs to be displayed.
 *
 * @param folder    Top-level folder in the bucket (e.g. "dpi_frente", "selfie")
 * @param fileName  Full file name including extension (e.g. "uuid.jpg")
 * @param buffer    File contents (from multer memory storage)
 * @param mimeType  Validated MIME type (e.g. "image/jpeg")
 * @returns         Storage path string
 */
export async function uploadKycFile(
  folder: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const storagePath = `${folder}/${fileName}`;

  const { error } = await supabase.storage
    .from(KYC_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(`kycStorage: upload failed for "${storagePath}": ${error.message}`);
  }

  return storagePath;
}

/**
 * Uploads a non-PII file (e.g. seller logo) to the KYC bucket and returns
 * a permanent public URL.
 *
 * Use ONLY for public commercial assets like logos — never for DPI or selfie
 * documents. Those must go through uploadKycFile() + getKycSignedUrl().
 *
 * @param folder    Top-level folder in the bucket (e.g. "logos")
 * @param fileName  Full file name including extension (e.g. "uuid.jpg")
 * @param buffer    File contents (from multer memory storage)
 * @param mimeType  Validated MIME type (e.g. "image/jpeg")
 * @returns         Public URL string
 */
export async function uploadPublicFile(
  folder: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const storagePath = `${folder}/${fileName}`;

  const { error } = await supabase.storage
    .from(KYC_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(`kycStorage: logo upload failed for "${storagePath}": ${error.message}`);
  }

  const { data } = supabase.storage
    .from(KYC_BUCKET)
    .getPublicUrl(storagePath);

  return data.publicUrl;
}
