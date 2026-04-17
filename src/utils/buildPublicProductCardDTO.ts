// src/utils/buildPublicProductCardDTO.ts

import { buildMediaProxyUrl } from "./mediaProxy";

export interface PublicProductCardDTO {
  id: string
  nombre: string
  precio: number
  imagen_url: string | null
  rating_avg: number
  rating_count: number
  categoria: {
    id: number | null
    nombre: string | null
  }
  departamento: string | null
  municipio: string | null
}

const toSafeNumber = (value: any): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const toSafeUrlOrNull = (value: any): string | null => {
  if (!value) return null
  const str = String(value).trim()
  return str.length > 0 ? buildMediaProxyUrl(str) : null
}

export function buildPublicProductCardDTO(row: any): PublicProductCardDTO {
  const categoriaId = row.categoria_id ?? null

  const categoriaNombre =
    row.categoria_nombre ??
    row.categoria ??
    row.categoria_custom ??
    null

  return {
    id: String(row.id),
    nombre: String(row.nombre ?? ""),
    precio: toSafeNumber(row.precio),

    // 🔥 Normalización definitiva
    // Siempre devolvemos imagen_url como propiedad estándar
    imagen_url: toSafeUrlOrNull(
      row.imagen_url ?? row.imagen_principal ?? null
    ),

    rating_avg: toSafeNumber(row.rating_avg),
    rating_count: toSafeNumber(row.rating_count),

    categoria: {
      id: categoriaId,
      nombre: categoriaNombre,
    },

    departamento: row.departamento ?? null,
    municipio: row.municipio ?? null,
  }
}
