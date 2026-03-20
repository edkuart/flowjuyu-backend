/**
 * src/services/productCode.service.ts
 *
 * Generates unique, human-readable product reference codes.
 *
 * Format: FJ-{REG}-{CAT}-{YYMMDD}-{RAND6}
 *
 *   FJ     — platform namespace, hardcoded
 *   REG    — 3-char uppercase prefix derived from regiones.nombre
 *              matched against the product's `departamento` string.
 *              Falls back through: departamento raw chars → "INT"
 *   CAT    — 3-char uppercase prefix derived from categorias.nombre
 *              looked up by categoria_id.
 *              Falls back to categoria_custom chars → "GEN"
 *   YYMMDD — creation date (UTC)
 *   RAND6  — 6 cryptographically-random chars from SAFE_ALPHABET (32 chars)
 *
 * Collision avoidance:
 *   - A SELECT pre-flight rejects known codes before attempting INSERT.
 *   - The DB UNIQUE constraint on internal_code is the authoritative guard.
 *   - The caller (controller) must catch UniqueConstraintError on
 *     internal_code and retry by calling generateProductCode() again.
 *   - MAX_PREFLIGHT_RETRIES limits how many pre-flight misses we tolerate
 *     before surfacing an error (real-world: never reached).
 */

import crypto from "crypto";
import { QueryTypes } from "sequelize";
import { sequelize } from "../config/db";

// ─── Alphabet ─────────────────────────────────────────────────────────────────
// 32 chars. Excludes visually ambiguous characters: O/0, I/1.
const SAFE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ALPHABET_LEN = SAFE_ALPHABET.length; // 32 = 2^5  → no modulo bias possible

// ─── Constants ────────────────────────────────────────────────────────────────
const CODE_PREFIX = "FJ";
const RAND_LENGTH = 6;
const MAX_PREFLIGHT_RETRIES = 10;

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Converts a display name (which may contain accents, spaces, mixed case)
 * into a 3-character uppercase alphanumeric code.
 *
 * Strategy:
 *   1. Unicode NFC → NFD decompose to separate base chars from combining marks.
 *   2. Strip combining diacritical marks (U+0300–U+036F).
 *   3. Remove every non-alphanumeric character.
 *   4. Uppercase, take first 3 chars, right-pad with "X" if shorter.
 *
 * Examples:
 *   "Textiles"          → "TEX"
 *   "Ropa"              → "ROP"
 *   "Joyería"           → "JOY"
 *   "Accesorios"        → "ACC"
 *   "Guatemala"         → "GUA"
 *   "Ciudad de Guatemala" → "CIU"  (first 3 alphanumeric of "Ciudad...")
 *   "AZ"                → "AZX"   (padded)
 */
function toCode3(name: string | null | undefined, fallback: string): string {
  if (!name || name.trim() === "") return fallback;

  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // strip combining diacritics
    .replace(/[^A-Za-z0-9]/g, "")     // remove non-alphanumeric
    .toUpperCase();

  if (cleaned.length === 0) return fallback;

  return cleaned.slice(0, 3).padEnd(3, "X");
}

/**
 * Returns a YYMMDD string for a given UTC date.
 */
function toDatePart(date: Date): string {
  const yy = String(date.getUTCFullYear()).slice(-2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/**
 * Cryptographically secure random string of `length` characters.
 *
 * ALPHABET_LEN = 32 = 2^5.
 * Because 256 % 32 === 0, every byte maps to exactly 8 distinct alphabet
 * positions with zero modulo bias. Rejection sampling is still included for
 * future-proofing if ALPHABET_LEN ever changes.
 */
function secureRandom(length: number): string {
  const limit = 256 - (256 % ALPHABET_LEN); // 256 when ALPHABET_LEN=32
  const result: string[] = [];

  while (result.length < length) {
    // Over-allocate: length*2 bytes gives ~2x what we need (minimal looping)
    const bytes = crypto.randomBytes(length * 2);
    for (let i = 0; i < bytes.length; i++) {
      if (result.length >= length) break;
      if (bytes[i] < limit) {
        result.push(SAFE_ALPHABET[bytes[i] % ALPHABET_LEN]);
      }
    }
  }

  return result.join("");
}

// ─── Database lookups ─────────────────────────────────────────────────────────

/**
 * Resolves the 3-char REG prefix for a product's location.
 *
 * Lookup order:
 *   1. Exact case-insensitive match of `departamento` against regiones.nombre.
 *   2. Partial prefix match (first 4 chars) — handles abbreviations.
 *   3. Use the raw `departamento` string directly (first 3 alphanum chars).
 *   4. Fallback: "INT"
 *
 * All queries use parameterised replacements — no SQL injection possible.
 */
async function resolveRegionCode(
  departamento: string | null | undefined
): Promise<string> {
  if (!departamento || departamento.trim() === "") return "INT";

  const dept = departamento.trim();

  // ── Exact match ──────────────────────────────────────────────────────────
  const exact = await sequelize.query<{ nombre: string }>(
    `SELECT nombre
       FROM regiones
      WHERE LOWER(TRIM(nombre)) = LOWER(:dept)
      LIMIT 1`,
    { replacements: { dept }, type: QueryTypes.SELECT }
  );
  if (exact.length > 0) return toCode3(exact[0].nombre, "INT");

  // ── Partial prefix match ──────────────────────────────────────────────────
  const pattern = `${dept.slice(0, 4)}%`;
  const partial = await sequelize.query<{ nombre: string }>(
    `SELECT nombre
       FROM regiones
      WHERE LOWER(nombre) LIKE LOWER(:pattern)
      LIMIT 1`,
    { replacements: { pattern }, type: QueryTypes.SELECT }
  );
  if (partial.length > 0) return toCode3(partial[0].nombre, "INT");

  // ── Use the raw departamento string ──────────────────────────────────────
  return toCode3(dept, "INT");
}

/**
 * Resolves the 3-char CAT prefix for a product's category.
 *
 * Lookup order:
 *   1. categorias.nombre by ID (fast primary-key index scan).
 *   2. Raw categoria_custom string.
 *   3. Fallback: "GEN"
 */
async function resolveCategoryCode(
  categoriaId: number | null | undefined,
  categoriaCustom?: string | null
): Promise<string> {
  if (categoriaId) {
    const rows = await sequelize.query<{ nombre: string }>(
      `SELECT nombre FROM categorias WHERE id = :id LIMIT 1`,
      { replacements: { id: categoriaId }, type: QueryTypes.SELECT }
    );
    if (rows.length > 0) return toCode3(rows[0].nombre, "GEN");
  }

  if (categoriaCustom && categoriaCustom.trim() !== "") {
    return toCode3(categoriaCustom, "GEN");
  }

  return "GEN";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ProductCodeOptions {
  /** Product's location string (maps to productos.departamento). */
  departamento?: string | null;
  /** FK to categorias.id */
  categoriaId?: number | null;
  /** Free-text category; used when categoriaId is null. */
  categoriaCustom?: string | null;
  /** Product creation date; defaults to current UTC time. */
  createdAt?: Date;
}

/**
 * Generates a unique internal_code for a product.
 *
 * The function resolves REG and CAT from the database in parallel, builds the
 * deterministic prefix (FJ-REG-CAT-YYMMDD-), then appends a cryptographically
 * random RAND6 suffix.
 *
 * A SELECT pre-flight check guards against wasting an INSERT attempt on a
 * known-duplicate. In the (astronomically rare) event of a pre-flight miss,
 * the loop retries up to MAX_PREFLIGHT_RETRIES times.
 *
 * IMPORTANT — race-condition note:
 *   The pre-flight SELECT is NOT an atomic reservation. Two concurrent
 *   requests could both pass the pre-flight and race to INSERT the same code.
 *   The DB UNIQUE constraint on `internal_code` is the authoritative guard.
 *   The calling controller MUST catch a UniqueConstraintError on internal_code
 *   and retry by calling generateProductCode() again (at most 1 additional
 *   retry is ever needed in practice).
 *
 * @throws Error if MAX_PREFLIGHT_RETRIES is exhausted (indicates a bug or
 *         abnormally high collision rate — should never happen in production).
 */
export async function generateProductCode(
  options: ProductCodeOptions
): Promise<string> {
  const [regCode, catCode] = await Promise.all([
    resolveRegionCode(options.departamento),
    resolveCategoryCode(options.categoriaId, options.categoriaCustom),
  ]);

  const datePart = toDatePart(options.createdAt ?? new Date());
  const prefix = `${CODE_PREFIX}-${regCode}-${catCode}-${datePart}-`;

  for (let attempt = 0; attempt < MAX_PREFLIGHT_RETRIES; attempt++) {
    const candidate = prefix + secureRandom(RAND_LENGTH);

    // Pre-flight: reject any code that already exists (index scan, ~0.1 ms)
    const rows = await sequelize.query<{ id: string }>(
      `SELECT id FROM productos WHERE internal_code = :code LIMIT 1`,
      { replacements: { code: candidate }, type: QueryTypes.SELECT }
    );

    if (rows.length === 0) {
      return candidate;
    }

    // Collision on pre-flight — generate fresh suffix and try again.
    // Probability: (total_products / 32^6) ≈ 0.000046% at 10,000 products.
  }

  throw new Error(
    `[productCode] Failed to generate unique code after ${MAX_PREFLIGHT_RETRIES} ` +
    `attempts for prefix "${prefix}". Investigate collision rate.`
  );
}
