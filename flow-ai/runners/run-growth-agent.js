const fs = require("fs");
const path = require("path");

const reportsDir = path.join(__dirname, "../reports/daily");
const memoryDir = path.join(__dirname, "../memory");
const outputDir = path.join(__dirname, "../reports/daily");

/* =====================================
   Ensure directories exist
===================================== */

function ensureDirs() {
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
}

/* =====================================
   Safe JSON reader
===================================== */

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.warn("Invalid JSON file:", filePath);
    return fallback;
  }
}

/* =====================================
   Get latest analytics file
===================================== */

function getLatestFile(prefix) {

  if (!fs.existsSync(reportsDir)) return null;

  const files = fs
    .readdirSync(reportsDir)
    .filter(file => file.startsWith(prefix))
    .sort()
    .reverse();

  if (!files.length) return null;

  const file = path.join(reportsDir, files[0]);

  console.log("Latest analytics file:", files[0]);

  return file;
}

/* =====================================
   Extract report section
===================================== */

function extractSection(content, heading) {

  if (!content) return "";

  const idx = content.indexOf(heading);

  if (idx === -1) return "";

  return content.slice(idx, idx + 1200);
}

/* =====================================
   Build growth recommendations
===================================== */

function buildRecommendations({
  analyticsContent,
  marketplaceMemory,
  improvementsMemory
}) {

  const recs = [];

  if (analyticsContent.includes("Products without views")) {

    recs.push({
      priority: "high",
      area: "catalog",
      action: "Crear campaña de visibilidad para productos sin vistas",
      detail:
        "Destacar productos muertos en homepage, redes o secciones de recomendados."
    });

  }

  if (analyticsContent.includes("Inactive sellers")) {

    recs.push({
      priority: "high",
      area: "seller-growth",
      action: "Lanzar reactivación de sellers inactivos",
      detail:
        "Contactar sellers sin actividad y ofrecer ayuda para subir productos o mejorar perfiles."
    });

  }

  if (analyticsContent.includes("Products without images")) {

    recs.push({
      priority: "high",
      area: "conversion",
      action: "Campaña de mejora visual del catálogo",
      detail:
        "Pedir a sellers actualizar imágenes porque afecta confianza y conversión."
    });

  }

  if (
    marketplaceMemory.some(entry =>
      Array.isArray(entry.insights) &&
      entry.insights.includes("Catalog visibility problem detected")
    )
  ) {

    recs.push({
      priority: "medium",
      area: "content",
      action: "Crear contenido para dirigir tráfico a productos específicos",
      detail:
        "Usar reels, posts o historias mostrando productos concretos para generar primeras visitas."
    });

  }

  if (improvementsMemory.length > 0) {

    recs.push({
      priority: "medium",
      area: "operations",
      action: "Alinear mejoras técnicas con crecimiento",
      detail:
        "Coordinar mejoras backend con campañas para que el catálogo responda mejor a tráfico nuevo."
    });

  }

  return recs;
}

/* =====================================
   Save growth report
===================================== */

function saveReport(content) {

  const date = new Date().toISOString().split("T")[0];

  const file = path.join(outputDir, `growth-${date}.md`);

  fs.writeFileSync(file, content, "utf8");

  console.log("Growth report saved:", file);

}

/* =====================================
   MAIN AGENT
===================================== */

function main() {

  console.log("\n=== FLOWJUYU GROWTH AGENT ===\n");

  ensureDirs();

  /* =========================
     Load analytics report
  ========================= */

  const analyticsFile = getLatestFile("analytics-");

  const analyticsContent = analyticsFile
    ? fs.readFileSync(analyticsFile, "utf8")
    : "";

  if (!analyticsContent) {
    console.log("No analytics report available.");
  }

  /* =========================
     Load memory
  ========================= */

  const marketplaceMemory = readJson(
    path.join(memoryDir, "marketplace.json"),
    []
  );

  const improvementsMemory = readJson(
    path.join(memoryDir, "improvements.json"),
    []
  );

  /* =========================
     Generate recommendations
  ========================= */

  const recommendations = buildRecommendations({
    analyticsContent,
    marketplaceMemory,
    improvementsMemory
  });

  /* =========================
     Build report
  ========================= */

  const report = `# Flowjuyu Growth Report

Generated: ${new Date().toISOString()}

## Analytics Snapshot

\`\`\`
${extractSection(analyticsContent, "## Insights")}
\`\`\`

## Recommendations

${
  recommendations.length
    ? recommendations
        .map(
          (r, i) => `${i + 1}. **${r.action}**
- Priority: ${r.priority}
- Area: ${r.area}
- Detail: ${r.detail}`
        )
        .join("\n\n")
    : "No recommendations generated."
}

## Suggested Next Actions This Week

- Revisar productos sin vistas
- Reactivar sellers inactivos
- Mejorar calidad visual del catálogo
- Coordinar marketing con mejoras técnicas
`;

  saveReport(report);

  console.log("\nGrowth agent finished.\n");

}

main();