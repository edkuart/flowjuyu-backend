// src/lib/sessionCache.ts
//
// In-memory TTL cache for /api/session responses.
// Eliminates the DB round-trip on repeated session checks within a 30s window.
//
// Safety: cache is keyed by userId AND token_version.
// If logoutAll increments token_version, the cached entry's version won't
// match the new JWT, so it's automatically bypassed and then evicted.
// logoutAll also explicitly calls invalidateSession() for immediate effect.

export type CachedSession = {
  id:            number;
  nombre:        string;
  correo:        string;
  rol:           string;
  token_version: number;
  expiresAt:     number;
};

const TTL_MS = 30_000; // 30 seconds
const _cache = new Map<number, CachedSession>();

export function getCachedSession(
  userId:       number,
  tokenVersion: number,
): CachedSession | null {
  const entry = _cache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt)          { _cache.delete(userId); return null; }
  if (entry.token_version !== tokenVersion)  { _cache.delete(userId); return null; }
  return entry;
}

export function setCachedSession(user: {
  id:            number;
  nombre:        string;
  correo:        string;
  rol:           string;
  token_version: number;
}): void {
  _cache.set(user.id, { ...user, expiresAt: Date.now() + TTL_MS });
}

/** Call this from logoutAll so the next /session immediately hits the DB. */
export function invalidateSession(userId: number): void {
  _cache.delete(userId);
}
