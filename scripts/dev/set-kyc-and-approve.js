// scripts/set-kyc-and-approve.js
require("dotenv").config();

const { sequelize } = require("../dist/config/db"); // si tienes build a dist
// Si NO tienes build a dist, usamos sequelize directo con Sequelize (fallback abajo)

async function main() {
  const userId = Number(process.argv[2]);
  const score = Number(process.argv[3] ?? 90);

  if (!Number.isFinite(userId)) {
    console.error("Uso: node scripts/set-kyc-and-approve.js <userId> [score]");
    process.exit(1);
  }

  console.log("🔧 Updating seller KYC...", { userId, score });

  // Actualiza score + (opcional) set a aprobado/activo
  const [result] = await sequelize.query(
    `
    UPDATE vendedor_perfil
    SET
      kyc_score = :score,
      estado_validacion = 'aprobado',
      estado_admin = 'activo',
      kyc_riesgo = 'bajo',
      kyc_revisado_en = NOW()
    WHERE user_id = :userId
    RETURNING id, user_id, kyc_score, estado_validacion, estado_admin;
    `,
    { replacements: { userId, score } }
  );

  console.log("✅ Updated:", result);

  await sequelize.close();
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});