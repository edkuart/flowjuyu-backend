/**
 * scripts/seed-platform-faq.ts
 *
 * Seeds the platform_faq_entries table with initial policy FAQ entries
 * for the WhatsApp conversational bot.
 *
 * USAGE
 *   npx ts-node scripts/seed-platform-faq.ts
 *   npx ts-node scripts/seed-platform-faq.ts --dry-run
 *
 * BEHAVIOR
 *   - Uses INSERT ... ON CONFLICT (key) DO UPDATE so it is safe to re-run.
 *   - Does NOT delete existing entries — add new ones or update via key.
 *   - Dry-run mode prints the entries without writing to the DB.
 *
 * ADDING ENTRIES
 *   1. Add a new object to FAQ_ENTRIES below.
 *   2. Choose a unique `key` (snake_case, descriptive).
 *   3. Add `triggers`: short Spanish phrases the user might type.
 *      - Triggers use substring-includes matching after normalization.
 *      - Keep triggers specific to avoid false matches.
 *   4. Write the `answer` in plain, friendly Spanish.
 *   5. Set the `category` to one of:
 *      comisiones | envios | pagos | cuenta | productos | general
 */

import "dotenv/config";
import { Sequelize, QueryTypes } from "sequelize";
import dns from "dns";

dns.setDefaultResultOrder("ipv4first");

const DRY_RUN = process.argv.includes("--dry-run");

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const host = process.env.DB_HOST || "localhost";
  const port = process.env.DB_PORT || "5432";
  const name = process.env.DB_NAME || "flowjuyu";
  const user = process.env.DB_USER || "postgres";
  const pass = process.env.DB_PASSWORD || "postgres";
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${name}`;
}

// ---------------------------------------------------------------------------
// FAQ entries
// ---------------------------------------------------------------------------

type FaqEntry = {
  key: string;
  triggers: string[];
  answer: string;
  category: string;
};

const FAQ_ENTRIES: FaqEntry[] = [
  // ── Comisiones ────────────────────────────────────────────────────────────
  {
    key: "faq_comision_plataforma",
    triggers: [
      "cuanto cobran de comision",
      "que comision cobran",
      "comision de la plataforma",
      "cuanto se llevan",
      "cuanto les dan a ustedes",
      "cuanto les quitan",
      "porcentaje de comision",
      "cuanto es la comision",
    ],
    answer: [
      "📊 Comisión de Flowjuyu",
      "",
      "Actualmente cobramos una comisión del 8% sobre cada venta completada.",
      "",
      "Esto cubre:",
      "• Procesamiento de pago seguro",
      "• Visibilidad en el marketplace",
      "• Soporte al comprador",
      "",
      "No hay cobros mensuales ni costos fijos. Solo pagás cuando vendés.",
    ].join("\n"),
    category: "comisiones",
  },

  // ── Envíos ────────────────────────────────────────────────────────────────
  {
    key: "faq_envios_quien_se_encarga",
    triggers: [
      "quien hace el envio",
      "quien envia el producto",
      "como funcionan los envios",
      "yo tengo que enviar",
      "como envio mi producto",
      "quien paga el envio",
    ],
    answer: [
      "📦 Envíos en Flowjuyu",
      "",
      "El envío es responsabilidad del vendedor.",
      "",
      "Tú coordinas la entrega directamente con el comprador una vez se confirma la venta.",
      "",
      "Puedes usar cualquier servicio de mensajería de tu confianza.",
      "El comprador verá tu información de contacto para coordinar.",
    ].join("\n"),
    category: "envios",
  },
  {
    key: "faq_envios_costo",
    triggers: [
      "cuanto cuesta el envio",
      "cuanto cobrar de envio",
      "precio de envio",
      "flete",
    ],
    answer: [
      "🚚 Costo de envío",
      "",
      "El costo del envío lo defines tú como vendedor.",
      "",
      "Puedes incluirlo en el precio del producto o coordinarlo directamente con el comprador.",
      "",
      "Te recomendamos indicar en la descripción del producto si el precio incluye envío o no.",
    ].join("\n"),
    category: "envios",
  },

  // ── Pagos ─────────────────────────────────────────────────────────────────
  {
    key: "faq_pagos_cuando_recibo",
    triggers: [
      "cuando me pagan",
      "cuando recibo mi dinero",
      "cuanto tarda el pago",
      "como me pagan",
      "cuando depositan",
      "cuando llega mi pago",
    ],
    answer: [
      "💰 Cuándo recibirás tu pago",
      "",
      "Los pagos se procesan 3 días hábiles después de que el comprador confirma la recepción del producto.",
      "",
      "El dinero se deposita directamente en la cuenta bancaria o billetera digital que registraste.",
      "",
      "Si tienes dudas sobre un pago específico, escribe a soporte@flowjuyu.com",
    ].join("\n"),
    category: "pagos",
  },
  {
    key: "faq_pagos_metodos",
    triggers: [
      "como pagan los compradores",
      "que metodos de pago aceptan",
      "aceptan tarjeta",
      "aceptan transferencia",
      "metodos de pago",
      "formas de pago",
    ],
    answer: [
      "💳 Métodos de pago aceptados",
      "",
      "Los compradores pueden pagar con:",
      "• Tarjeta de crédito / débito (Visa, Mastercard)",
      "• Transferencia bancaria",
      "• Pago en efectivo en puntos autorizados",
      "",
      "Flowjuyu maneja el cobro de forma segura — tú no tienes que recibir pagos directamente.",
    ].join("\n"),
    category: "pagos",
  },

  // ── Cuenta ────────────────────────────────────────────────────────────────
  {
    key: "faq_cuenta_como_vincular",
    triggers: [
      "como vinculo mi cuenta",
      "como conecto whatsapp",
      "como me registro",
      "como creo mi cuenta",
      "donde me registro",
      "como empiezo a vender",
    ],
    answer: [
      "🔗 Cómo vincular tu cuenta",
      "",
      "Para usar el bot de WhatsApp necesitas:",
      "",
      "1. Registrarte en flowjuyu.com",
      "2. Ir a tu perfil de vendedor",
      "3. Generar un código de vinculación",
      "4. Enviarlo aquí en este chat",
      "",
      "El código tiene el formato: FJ-XXXXX",
      "",
      "Si ya tienes cuenta y perdiste el código, inicia sesión y genera uno nuevo en la sección 'WhatsApp'.",
    ].join("\n"),
    category: "cuenta",
  },
  {
    key: "faq_cuenta_cambiar_datos",
    triggers: [
      "como cambio mis datos",
      "cambiar nombre de tienda",
      "cambiar mi correo",
      "actualizar mi perfil",
      "cambiar mi informacion",
    ],
    answer: [
      "✏️ Cambiar datos de tu cuenta",
      "",
      "Para actualizar tu información de vendedor:",
      "",
      "1. Ingresa a flowjuyu.com",
      "2. Ve a tu Panel de Vendedor",
      "3. Selecciona 'Mi Perfil' o 'Configuración'",
      "",
      "Los cambios en datos sensibles pueden requerir verificación.",
    ].join("\n"),
    category: "cuenta",
  },

  // ── Productos ─────────────────────────────────────────────────────────────
  {
    key: "faq_productos_cuantos_puedo_publicar",
    triggers: [
      "cuantos productos puedo publicar",
      "hay limite de productos",
      "cuantos puedo subir",
      "limite de publicaciones",
    ],
    answer: [
      "📦 Límite de productos",
      "",
      "Con el plan básico puedes publicar hasta 20 productos activos.",
      "",
      "Si necesitas publicar más, puedes actualizar tu plan desde flowjuyu.com",
      "",
      "Los productos inactivos no cuentan contra el límite.",
    ].join("\n"),
    category: "productos",
  },
  {
    key: "faq_productos_como_se_muestran",
    triggers: [
      "como aparecen mis productos",
      "donde se muestran mis productos",
      "los compradores pueden ver mis productos",
      "como encuentran mis productos",
      "donde buscan mis productos",
    ],
    answer: [
      "🔍 Visibilidad de tus productos",
      "",
      "Tus productos aparecen en el catálogo principal de Flowjuyu, visible para todos los compradores.",
      "",
      "También se indexan por categoría y nombre para que los compradores puedan buscarlos.",
      "",
      "Los productos deben ser aprobados por el equipo antes de aparecer públicamente.",
      "",
      "Escribe 'mis productos' aquí para ver el estado de tus publicaciones.",
    ].join("\n"),
    category: "productos",
  },

  // ── General ───────────────────────────────────────────────────────────────
  {
    key: "faq_soporte_contacto",
    triggers: [
      "contactar soporte",
      "hablar con alguien",
      "hablar con un humano",
      "necesito ayuda de una persona",
      "correo de soporte",
      "como reporto un problema",
      "hay alguien que me pueda ayudar",
    ],
    answer: [
      "🙋 Contacto con soporte",
      "",
      "Para hablar con el equipo de Flowjuyu:",
      "",
      "📧 Email: soporte@flowjuyu.com",
      "",
      "Nuestro equipo responde en horario de lunes a viernes, 8am – 6pm (hora Guatemala).",
      "",
      "Para problemas urgentes incluye en tu mensaje:",
      "• Tu nombre de tienda",
      "• Descripción del problema",
    ].join("\n"),
    category: "general",
  },
  {
    key: "faq_horario_soporte",
    triggers: [
      "horario de atencion",
      "cuando atienden",
      "que horario tienen",
      "a que hora responden",
    ],
    answer: [
      "🕐 Horario de atención",
      "",
      "El equipo de Flowjuyu atiende:",
      "• Lunes a viernes: 8:00am – 6:00pm (hora Guatemala)",
      "",
      "Este bot está disponible las 24 horas para responder preguntas básicas y ayudarte a publicar productos.",
    ].join("\n"),
    category: "general",
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("─".repeat(60));
  console.log("  Flowjuyu — Platform FAQ Seeder");
  if (DRY_RUN) console.log("  MODE: DRY RUN — no writes will be made");
  console.log("─".repeat(60));

  const sequelize = new Sequelize(resolveDatabaseUrl(), {
    dialect: "postgres",
    logging: false,
    dialectOptions: {
      ssl:
        process.env.NODE_ENV === "production"
          ? { require: true, rejectUnauthorized: false }
          : undefined,
      family: 4,
    },
  });

  await sequelize.authenticate();
  console.log("✅ DB connection established\n");

  let inserted = 0;
  let updated = 0;

  for (const entry of FAQ_ENTRIES) {
    if (DRY_RUN) {
      console.log(`🔵 [DRY RUN] Would upsert key=${entry.key} category=${entry.category} triggers=${entry.triggers.length}`);
      continue;
    }

    const [, created] = await sequelize.query(
      `INSERT INTO platform_faq_entries (id, key, triggers, answer, category, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), :key, :triggers, :answer, :category, true, NOW(), NOW())
       ON CONFLICT (key) DO UPDATE SET
         triggers   = EXCLUDED.triggers,
         answer     = EXCLUDED.answer,
         category   = EXCLUDED.category,
         updated_at = NOW()
       RETURNING (xmax = 0) AS was_inserted`,
      {
        replacements: {
          key: entry.key,
          triggers: `{${entry.triggers.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",")}}`,
          answer: entry.answer,
          category: entry.category,
        },
        type: QueryTypes.SELECT,
      }
    );

    const wasInserted = (created as any)?.was_inserted ?? true;
    if (wasInserted) {
      console.log(`✅ Inserted: ${entry.key}`);
      inserted++;
    } else {
      console.log(`🔄 Updated:  ${entry.key}`);
      updated++;
    }
  }

  console.log("\n" + "─".repeat(60));
  if (DRY_RUN) {
    console.log(`  Would process: ${FAQ_ENTRIES.length} entries`);
    console.log("  Re-run without --dry-run to apply.");
  } else {
    console.log(`  Inserted: ${inserted}`);
    console.log(`  Updated:  ${updated}`);
    console.log(`  Total:    ${FAQ_ENTRIES.length}`);
  }
  console.log("─".repeat(60));

  await sequelize.close();
}

main().catch((err) => {
  console.error("\n❌ Seed failed:", err);
  process.exit(1);
});
