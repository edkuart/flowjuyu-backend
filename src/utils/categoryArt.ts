type CategoryArtConfig = {
  slug: string;
  label: string;
  accent: string;
  accentSoft: string;
  base: string;
  motif: "diamond" | "stripes" | "steps" | "woven" | "sandals";
  storageFile?: string;
};

const DEFAULT_BASE_URL =
  process.env.PUBLIC_API_BASE_URL ||
  process.env.API_PUBLIC_BASE_URL ||
  process.env.APP_BASE_URL ||
  `http://localhost:${process.env.PORT || 8800}`;

const CATEGORY_ART: Record<string, CategoryArtConfig> = {
  accesorio: {
    slug: "accesorio",
    label: "Accesorio",
    accent: "#9d5c63",
    accentSoft: "#d9b6ba",
    base: "#f5ede3",
    motif: "diamond",
    storageFile: "Accesoriosimg.png",
  },
  accesorios_tipicos: {
    slug: "accesorios-tipicos",
    label: "Accesorios tipicos",
    accent: "#7a4a2f",
    accentSoft: "#ddbda2",
    base: "#f4eadf",
    motif: "woven",
    storageFile: "accesoriostipicoimg.png",
  },
  calzado: {
    slug: "calzado",
    label: "Calzado",
    accent: "#385f71",
    accentSoft: "#b9d5e1",
    base: "#f3efe8",
    motif: "sandals",
    storageFile: "Calzadoimg.png",
  },
  corte: {
    slug: "corte",
    label: "Corte",
    accent: "#8b1e3f",
    accentSoft: "#e2b2bf",
    base: "#f4eee9",
    motif: "stripes",
    storageFile: "Cortesimg.png",
  },
  guipil: {
    slug: "guipil",
    label: "Guipil",
    accent: "#315f4f",
    accentSoft: "#bfd7cf",
    base: "#f3efe6",
    motif: "steps",
    storageFile: "Huipilimg.png",
  },
};

function normalizeCategoryKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getCategoryConfig(name: string): CategoryArtConfig {
  const key = normalizeCategoryKey(name);
  return (
    CATEGORY_ART[key] ?? {
      slug: key || "categoria",
      label: name || "Categoria",
      accent: "#355c4a",
      accentSoft: "#c8d8cf",
      base: "#f4efe7",
      motif: "diamond",
    }
  );
}

function renderMotif(config: CategoryArtConfig): string {
  switch (config.motif) {
    case "stripes":
      return `
        <rect x="0" y="0" width="720" height="960" fill="${config.base}" />
        <rect x="72" y="0" width="72" height="960" fill="${config.accent}" opacity="0.92" />
        <rect x="172" y="0" width="40" height="960" fill="${config.accentSoft}" />
        <rect x="262" y="0" width="92" height="960" fill="${config.accent}" opacity="0.78" />
        <rect x="386" y="0" width="48" height="960" fill="${config.accentSoft}" />
        <rect x="486" y="0" width="112" height="960" fill="${config.accent}" opacity="0.9" />
        <path d="M0 220H720M0 360H720M0 515H720M0 690H720" stroke="${config.accentSoft}" stroke-width="16" opacity="0.45" />
      `;
    case "woven":
      return `
        <rect x="0" y="0" width="720" height="960" fill="${config.base}" />
        <path d="M0 180H720M0 320H720M0 460H720M0 600H720M0 740H720" stroke="${config.accent}" stroke-width="28" opacity="0.9" />
        <path d="M80 0V960M220 0V960M360 0V960M500 0V960M640 0V960" stroke="${config.accentSoft}" stroke-width="40" opacity="0.8" />
        <path d="M150 0V960M430 0V960" stroke="${config.accent}" stroke-width="18" opacity="0.45" />
      `;
    case "steps":
      return `
        <rect x="0" y="0" width="720" height="960" fill="${config.base}" />
        <path d="M110 650h120v-90h120v-90h120v-90h120" fill="none" stroke="${config.accent}" stroke-width="38" stroke-linecap="square" stroke-linejoin="miter" />
        <path d="M140 720h120v-90h120v-90h120v-90h120" fill="none" stroke="${config.accentSoft}" stroke-width="28" stroke-linecap="square" />
        <circle cx="215" cy="250" r="82" fill="${config.accentSoft}" opacity="0.55" />
        <circle cx="520" cy="190" r="62" fill="${config.accent}" opacity="0.18" />
      `;
    case "sandals":
      return `
        <rect x="0" y="0" width="720" height="960" fill="${config.base}" />
        <ellipse cx="245" cy="610" rx="110" ry="210" fill="${config.accent}" opacity="0.92" />
        <ellipse cx="485" cy="610" rx="110" ry="210" fill="${config.accentSoft}" opacity="0.9" />
        <path d="M170 520c40-95 110-120 150-120s110 25 150 120" fill="none" stroke="#1d1d1b" stroke-width="18" stroke-linecap="round" />
        <path d="M300 420c14 36 20 70 20 104" fill="none" stroke="#1d1d1b" stroke-width="14" stroke-linecap="round" />
        <path d="M420 420c-14 36-20 70-20 104" fill="none" stroke="#1d1d1b" stroke-width="14" stroke-linecap="round" />
      `;
    case "diamond":
    default:
      return `
        <rect x="0" y="0" width="720" height="960" fill="${config.base}" />
        <path d="M360 140l160 160-160 160-160-160 160-160Z" fill="${config.accentSoft}" opacity="0.92" />
        <path d="M360 260l90 90-90 90-90-90 90-90Z" fill="${config.accent}" opacity="0.92" />
        <path d="M120 660l110-110 110 110-110 110-110-110Zm260 0 110-110 110 110-110 110-110-110Z" fill="none" stroke="${config.accent}" stroke-width="18" opacity="0.55" />
      `;
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildCategoryArtUrl(name: string): string {
  const config = getCategoryConfig(name);
  if (config.storageFile) {
    return `${DEFAULT_BASE_URL.replace(/\/$/, "")}/media/Categorias/${encodeURIComponent(config.storageFile)}`;
  }

  return `${DEFAULT_BASE_URL.replace(/\/$/, "")}/media/category-art/${encodeURIComponent(config.slug)}.svg`;
}

export function renderCategoryArtBySlug(slug: string): string {
  const config =
    Object.values(CATEGORY_ART).find((item) => item.slug === slug) ??
    getCategoryConfig(slug);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="720" height="960" viewBox="0 0 720 960" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="720" height="960" rx="24" fill="${config.base}" />
  ${renderMotif(config)}
  <rect x="0" y="744" width="720" height="216" fill="url(#fade)" />
  <text x="58" y="842" fill="#ffffff" font-family="Georgia, 'Times New Roman', serif" font-size="54" font-style="italic">${escapeXml(config.label)}</text>
  <text x="58" y="894" fill="rgba(255,255,255,0.72)" font-family="Arial, sans-serif" font-size="22" letter-spacing="6">EXPLORAR</text>
  <defs>
    <linearGradient id="fade" x1="360" y1="744" x2="360" y2="960" gradientUnits="userSpaceOnUse">
      <stop stop-color="#000000" stop-opacity="0" />
      <stop offset="1" stop-color="#000000" stop-opacity="0.68" />
    </linearGradient>
  </defs>
</svg>`;
}
