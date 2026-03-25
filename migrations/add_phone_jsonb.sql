-- =====================================================================
-- Migration: Convert telefono_comercio and whatsapp_numero
--            from VARCHAR(15) to JSONB PhoneNumber objects
--
-- Run this ONCE against the database before deploying the backend
-- code that expects JSONB for these fields.
--
-- telefono_comercio was stored as a local number only, e.g. "23456789"
--   → migrated to { country_code: "502", number: "23456789" }
--
-- whatsapp_numero was stored as full number with cc, e.g. "50255554446"
--   → migrated to { country_code: "502", number: "55554446" }
--     (first 3 digits = country code, remainder = local number)
-- =====================================================================

BEGIN;

-- ── Step 1: Add temporary JSONB columns ──────────────────────────────
ALTER TABLE vendedor_perfil
  ADD COLUMN IF NOT EXISTS telefono_comercio_new JSONB,
  ADD COLUMN IF NOT EXISTS whatsapp_numero_new   JSONB;

-- ── Step 2: Migrate telefono_comercio ────────────────────────────────
-- Was stored as local digits only → wrap with default Guatemalan cc
UPDATE vendedor_perfil
SET telefono_comercio_new = jsonb_build_object(
  'country_code', '502',
  'number',        telefono_comercio
)
WHERE telefono_comercio IS NOT NULL
  AND telefono_comercio <> ''
  AND telefono_comercio ~ '^\d{4,15}$';

-- ── Step 3: Migrate whatsapp_numero ──────────────────────────────────
-- Was stored as full international number (cc + local), e.g. "50255554446"
-- Assumes 3-digit country code (covers Guatemala 502, Mexico 52 treated
-- as 3-pad, El Salvador 503, Honduras 504, Costa Rica 506).
-- For US (+1) numbers starting with "1", first digit is the cc — handled
-- by checking known prefixes below.
UPDATE vendedor_perfil
SET whatsapp_numero_new = CASE
  -- Guatemala (502)
  WHEN whatsapp_numero LIKE '502%' AND LENGTH(whatsapp_numero) > 3 THEN
    jsonb_build_object('country_code', '502', 'number', SUBSTRING(whatsapp_numero FROM 4))
  -- El Salvador (503)
  WHEN whatsapp_numero LIKE '503%' AND LENGTH(whatsapp_numero) > 3 THEN
    jsonb_build_object('country_code', '503', 'number', SUBSTRING(whatsapp_numero FROM 4))
  -- Honduras (504)
  WHEN whatsapp_numero LIKE '504%' AND LENGTH(whatsapp_numero) > 3 THEN
    jsonb_build_object('country_code', '504', 'number', SUBSTRING(whatsapp_numero FROM 4))
  -- Costa Rica (506)
  WHEN whatsapp_numero LIKE '506%' AND LENGTH(whatsapp_numero) > 3 THEN
    jsonb_build_object('country_code', '506', 'number', SUBSTRING(whatsapp_numero FROM 4))
  -- Mexico (52) — 2-digit cc
  WHEN whatsapp_numero LIKE '52%' AND LENGTH(whatsapp_numero) > 2 THEN
    jsonb_build_object('country_code', '52',  'number', SUBSTRING(whatsapp_numero FROM 3))
  -- USA (1) — 1-digit cc
  WHEN whatsapp_numero LIKE '1%' AND LENGTH(whatsapp_numero) > 1 THEN
    jsonb_build_object('country_code', '1',   'number', SUBSTRING(whatsapp_numero FROM 2))
  -- Fallback: treat entire value as Guatemalan local number
  WHEN whatsapp_numero IS NOT NULL AND whatsapp_numero ~ '^\d{4,15}$' THEN
    jsonb_build_object('country_code', '502', 'number', whatsapp_numero)
  ELSE NULL
END
WHERE whatsapp_numero IS NOT NULL AND whatsapp_numero <> '';

-- ── Step 4: Swap columns ─────────────────────────────────────────────
ALTER TABLE vendedor_perfil DROP COLUMN telefono_comercio;
ALTER TABLE vendedor_perfil DROP COLUMN whatsapp_numero;
ALTER TABLE vendedor_perfil RENAME COLUMN telefono_comercio_new TO telefono_comercio;
ALTER TABLE vendedor_perfil RENAME COLUMN whatsapp_numero_new   TO whatsapp_numero;

COMMIT;
