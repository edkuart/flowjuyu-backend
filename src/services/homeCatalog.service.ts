import { QueryTypes } from "sequelize";
import { sequelize } from "../config/db";

export interface HomeCatalogProductRow {
  id: string;
  nombre: string;
  precio: number;
  imagen_url: string | null;
  rating_avg: number;
  rating_count: number;
  categoria_id: number | null;
  categoria_nombre: string | null;
  departamento: string | null;
  municipio: string | null;
  created_at?: string | Date | null;
}

export interface HomeCatalogSection<T> {
  key: "featured" | "new_arrivals" | "trending";
  title: string;
  items: T[];
}

export interface HomeCatalogResult<T> {
  seed: string;
  seed_window: string;
  overlap_used: number;
  max_overlap: number;
  sections: {
    featured: HomeCatalogSection<T>;
    new_arrivals: HomeCatalogSection<T>;
    trending: HomeCatalogSection<T>;
  };
}

interface HomeCatalogOptions {
  seed?: string | null;
  featuredCategoryId?: number | null;
  sectionSize?: number;
}

const DEFAULT_SECTION_SIZE = 8;
const CANDIDATE_MULTIPLIER = 4;
const MAX_SECTION_SIZE = 12;
const MAX_OVERLAP = 1;
const HOME_TIMEZONE = "America/Guatemala";

function clampSectionSize(value?: number | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SECTION_SIZE;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_SECTION_SIZE);
}

function getDailySeedWindow(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: HOME_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let value = Math.imul(t ^ (t >>> 15), t | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function deterministicShuffle<T>(items: T[], seed: string): T[] {
  const result = [...items];
  const random = mulberry32(hashString(seed));

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function dedupeById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function selectSectionProducts<T extends { id: string }>(params: {
  sectionKey: string;
  candidates: T[];
  excludedIds: Set<string>;
  size: number;
  seed: string;
  overlapBudget: { remaining: number; used: number };
}) {
  const {
    sectionKey,
    candidates,
    excludedIds,
    size,
    seed,
    overlapBudget,
  } = params;

  const shuffled = deterministicShuffle(
    dedupeById(candidates),
    `${seed}:${sectionKey}`
  );

  const selected: T[] = [];
  const overflow: T[] = [];

  for (const candidate of shuffled) {
    if (selected.length >= size) break;

    if (excludedIds.has(candidate.id)) {
      overflow.push(candidate);
      continue;
    }

    selected.push(candidate);
    excludedIds.add(candidate.id);
  }

  while (
    selected.length < size &&
    overlapBudget.remaining > 0 &&
    overflow.length > 0
  ) {
    const candidate = overflow.shift()!;
    selected.push(candidate);
    overlapBudget.remaining -= 1;
    overlapBudget.used += 1;
  }

  return selected;
}

function logHomeCatalogSelection(message: string, payload: Record<string, unknown>) {
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.HOME_CATALOG_DEBUG !== "true"
  ) {
    return;
  }

  console.debug(`[homeCatalog] ${message}`, payload);
}

async function fetchFeaturedCandidates(limit: number, categoriaId?: number | null) {
  const categoryFilter = categoriaId ? "AND p.categoria_id = :categoriaId" : "";

  return sequelize.query<HomeCatalogProductRow>(
    `
    SELECT
      p.id,
      p.nombre,
      p.precio,
      COALESCE(
        (
          SELECT pi.url
          FROM producto_imagenes pi
          WHERE pi.producto_id = p.id
          ORDER BY pi.created_at ASC
          LIMIT 1
        ),
        p.imagen_url
      ) AS imagen_url,
      p.rating_avg,
      p.rating_count,
      p.departamento,
      p.municipio,
      p.created_at,
      c.id AS categoria_id,
      c.nombre AS categoria_nombre,
      (
        (COUNT(r.id)::float / (COUNT(r.id) + 5)) * COALESCE(AVG(r.rating), 0)
        +
        (5.0 / (COUNT(r.id) + 5)) * 3.5
      ) AS weighted_score
    FROM productos p
    JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
    LEFT JOIN categorias c ON c.id = p.categoria_id
    LEFT JOIN reviews r ON r.producto_id = p.id
    WHERE p.activo = true
      AND v.estado_validacion = 'aprobado'
      AND v.estado_admin = 'activo'
      ${categoryFilter}
    GROUP BY p.id, c.id
    ORDER BY weighted_score DESC NULLS LAST, p.created_at DESC
    LIMIT :limit
    `,
    {
      replacements: { categoriaId, limit },
      type: QueryTypes.SELECT,
    }
  );
}

async function fetchNewCandidates(limit: number) {
  return sequelize.query<HomeCatalogProductRow>(
    `
    SELECT
      p.id,
      p.nombre,
      p.precio,
      p.imagen_url,
      p.rating_avg,
      p.rating_count,
      p.departamento,
      p.municipio,
      p.created_at,
      c.id AS categoria_id,
      c.nombre AS categoria_nombre
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
    WHERE p.activo = true
      AND v.estado_validacion = 'aprobado'
      AND v.estado_admin = 'activo'
      AND p.imagen_url IS NOT NULL
    ORDER BY p.created_at DESC
    LIMIT :limit
    `,
    {
      replacements: { limit },
      type: QueryTypes.SELECT,
    }
  );
}

async function fetchTrendingCandidates(limit: number) {
  return sequelize.query<HomeCatalogProductRow>(
    `
    SELECT *
    FROM (
      SELECT
        p.id,
        p.nombre,
        p.precio,
        p.created_at,
        COALESCE(
          (
            SELECT pi.url
            FROM producto_imagenes pi
            WHERE pi.producto_id = p.id
            ORDER BY pi.created_at ASC
            LIMIT 1
          ),
          p.imagen_url
        ) AS imagen_url,
        p.departamento,
        p.municipio,
        p.rating_avg,
        p.rating_count,
        c.id AS categoria_id,
        c.nombre AS categoria_nombre,
        COUNT(r.id) AS total_reviews,
        (
          (
            (
              (COUNT(r.id)::float / (COUNT(r.id) + 5)) * COALESCE(AVG(r.rating), 0)
              +
              (5.0 / (COUNT(r.id) + 5)) * 3.5
            ) * 0.7
            +
            (
              GREATEST(0, 1 - EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 864000)
            ) * 0.3
          )
          *
          (
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM producto_imagenes pi2
                WHERE pi2.producto_id = p.id
              )
              THEN 1
              ELSE 0.85
            END
          )
        ) AS trending_score
      FROM productos p
      JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      LEFT JOIN categorias c ON c.id = p.categoria_id
      LEFT JOIN reviews r ON r.producto_id = p.id
      WHERE p.activo = true
        AND v.estado_validacion = 'aprobado'
        AND v.estado_admin = 'activo'
      GROUP BY p.id, c.id
    ) sub
    ORDER BY sub.trending_score DESC, sub.total_reviews DESC, sub.created_at DESC
    LIMIT :limit
    `,
    {
      replacements: { limit },
      type: QueryTypes.SELECT,
    }
  );
}

export async function buildHomeCatalog<T>(params: {
  options?: HomeCatalogOptions;
  mapProduct: (row: HomeCatalogProductRow) => T;
}): Promise<HomeCatalogResult<T>> {
  const options = params.options ?? {};
  const sectionSize = clampSectionSize(options.sectionSize);
  const candidateLimit = sectionSize * CANDIDATE_MULTIPLIER;
  const seedWindow = getDailySeedWindow();
  const seed = options.seed?.trim() || seedWindow;
  const overlapBudget = { remaining: MAX_OVERLAP, used: 0 };
  const excludedIds = new Set<string>();

  const [featuredCandidates, newCandidates, trendingCandidates] = await Promise.all([
    fetchFeaturedCandidates(candidateLimit, options.featuredCategoryId),
    fetchNewCandidates(candidateLimit),
    fetchTrendingCandidates(candidateLimit),
  ]);

  const featured = selectSectionProducts({
    sectionKey: "featured",
    candidates: featuredCandidates,
    excludedIds,
    size: sectionSize,
    seed,
    overlapBudget,
  });

  const newArrivals = selectSectionProducts({
    sectionKey: "new_arrivals",
    candidates: newCandidates,
    excludedIds,
    size: sectionSize,
    seed,
    overlapBudget,
  });

  const trending = selectSectionProducts({
    sectionKey: "trending",
    candidates: trendingCandidates,
    excludedIds,
    size: sectionSize,
    seed,
    overlapBudget,
  });

  logHomeCatalogSelection("selection", {
    seed,
    seedWindow,
    featuredCategoryId: options.featuredCategoryId ?? null,
    featuredCandidateIds: featuredCandidates.slice(0, 12).map((row) => row.id),
    newCandidateIds: newCandidates.slice(0, 12).map((row) => row.id),
    trendingCandidateIds: trendingCandidates.slice(0, 12).map((row) => row.id),
    featuredIds: featured.map((row) => row.id),
    newArrivalIds: newArrivals.map((row) => row.id),
    trendingIds: trending.map((row) => row.id),
    overlapUsed: overlapBudget.used,
  });

  return {
    seed,
    seed_window: seedWindow,
    overlap_used: overlapBudget.used,
    max_overlap: MAX_OVERLAP,
    sections: {
      featured: {
        key: "featured",
        title: "Piezas destacadas",
        items: featured.map(params.mapProduct),
      },
      new_arrivals: {
        key: "new_arrivals",
        title: "Recién salido del telar",
        items: newArrivals.map(params.mapProduct),
      },
      trending: {
        key: "trending",
        title: "Piezas que no se olvidan",
        items: trending.map(params.mapProduct),
      },
    },
  };
}
