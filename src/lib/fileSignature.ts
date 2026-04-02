// src/lib/fileSignature.ts
//
// Validates a file buffer against known magic-byte signatures.
// Multer's fileFilter relies solely on the Content-Type header, which can
// be spoofed by any client. This library inspects the actual byte content
// so a .exe renamed to .jpg is rejected regardless of its declared MIME type.

/**
 * Minimum bytes needed to read any supported signature.
 * WebP requires 12 bytes (RIFF[4] + size[4] + WEBP[4]).
 */
const MIN_BUFFER_LENGTH = 12;

interface SignatureRule {
  // Byte offset into the file where the pattern begins.
  offset: number;
  // Bytes that must match at that offset.
  bytes: number[];
}

/**
 * Supported formats and their magic-byte rules.
 * A format matches if ALL of its rules pass.
 */
const SIGNATURES: Record<string, SignatureRule[]> = {
  "image/jpeg": [
    { offset: 0, bytes: [0xff, 0xd8, 0xff] },
  ],
  // Non-standard alias sent by some mobile clients and older browsers.
  // Byte signature is identical to image/jpeg.
  "image/jpg": [
    { offset: 0, bytes: [0xff, 0xd8, 0xff] },
  ],
  "image/png": [
    { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  ],
  "image/webp": [
    // Bytes 0–3: "RIFF"
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
    // Bytes 8–11: "WEBP"
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  ],
};

/** All MIME types this module can validate. */
export const SUPPORTED_MIME_TYPES = Object.keys(SIGNATURES);

/**
 * Returns true when the buffer starts with the magic bytes for the
 * given MIME type, false otherwise.
 *
 * @param mimeType  The declared MIME type to validate against (e.g. "image/jpeg")
 * @param buffer    The file buffer — must contain at least the first 12 bytes.
 */
export function validateFileSignature(mimeType: string, buffer: Buffer): boolean {
  const rules = SIGNATURES[mimeType];

  // Unknown MIME type — no rule to validate against; reject.
  if (!rules) return false;

  if (buffer.length < MIN_BUFFER_LENGTH) return false;

  return rules.every(({ offset, bytes }) =>
    bytes.every((byte, i) => buffer[offset + i] === byte)
  );
}
