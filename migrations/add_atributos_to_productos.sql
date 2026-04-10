-- Migration: add optional product attributes column
-- Table: productos
-- Run once against production DB.

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS atributos jsonb NOT NULL DEFAULT '{}';

-- Optional GIN index for future attribute-based filtering/search
-- (add when you start querying by attribute values)
-- CREATE INDEX CONCURRENTLY idx_productos_atributos ON productos USING gin(atributos);
