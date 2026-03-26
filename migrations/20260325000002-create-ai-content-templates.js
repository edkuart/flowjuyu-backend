"use strict";

/**
 * Migration: Phase 5 — AI Content Template System
 *
 * Creates:
 *   - ai_content_templates  (versioned, immutable prompt records)
 *
 * Seeds:
 *   - The 3 base templates from Phase 2 ContentGenerationService (v1).
 *   These slugs match the template_id values already stored in ai_content_variants.
 *
 * Design:
 *   - Templates are IMMUTABLE once created. Evolution produces new rows (new version),
 *     never modifies existing ones.
 *   - slug = template_key + '_v' + template_version  → matches variants.template_id
 *   - health_status: 'active' | 'degraded' | 'paused' | 'candidate' | 'retired'
 *   - Candidate templates require admin approval before is_active becomes true.
 *
 * Idempotent: guarded by showAllTables() + INSERT ON CONFLICT DO NOTHING.
 */

// ─── Exact prompts from ContentGenerationService (Phase 2) ───────────────────

const BRAND_SYSTEM_PROMPT = `Eres la voz de Flowjuyu, un mercado cultural dedicado a los textiles tradicionales guatemaltecos y a los artesanos que los crean.

Tu tono es: cálido, preciso, respetuoso de la herencia artesanal, y accesible para compradores internacionales.

Reglas de escritura obligatorias:
- Nunca comiences con "Descubre", "Presentamos", "Conoce", "Introducing" o "Meet"
- Nunca uses las palabras "único", "auténtico" o "artesanal" como adjetivos vacíos — muéstralo, no lo declares
- Nunca uses lenguaje de urgencia ("últimas unidades", "oferta limitada", "precio especial")
- Nunca inventes técnicas, orígenes o historias biográficas que no estén en los datos proporcionados
- Si un campo está vacío, omite esa información completamente — no especules ni rellenes
- El artesano es el sujeto; el producto es secundario a quien lo creó
- El precio representa un intercambio justo, no una ganga ni un lujo
- Incluye al menos un detalle específico y concreto que el lector no esperaría
- Varía la longitud de las oraciones de forma natural — evita el ritmo uniforme
- Máximo un guión largo (—) por pieza`;

const CAPTION_V1 = `Genera un caption para este producto artesanal guatemalteco. Máximo 280 caracteres. Solo prosa, sin bullets, sin hashtags. Tiempo presente para describir procesos de creación.

Datos del producto:
Nombre: {{nombre}}
Precio: Q{{precio}}
Categoría: {{categoria}}
Región: {{region}}
Descripción existente: {{descripcion}}

Devuelve únicamente el texto del caption. Sin comillas ni explicaciones adicionales.`;

const DESCRIPTION_V1 = `Genera una descripción de producto para este textil artesanal guatemalteco. Entre 120 y 180 palabras. Estructura en tres párrafos cortos: (1) material o proceso de creación, (2) origen o artesano, (3) uso práctico o valor de la pieza. Sin headers ni bullets.

Datos del producto:
Nombre: {{nombre}}
Precio: Q{{precio}}
Categoría: {{categoria}}
Región: {{region}}
Descripción existente: {{descripcion}}

Devuelve únicamente la descripción. Sin comillas ni prefijos.`;

const IMAGE_BRIEF_V1 = `Genera un brief de prompt de imagen para este producto artesanal. Usa exactamente este formato estructurado — cada campo en su propia línea:

STYLE: [taller_vivo | detalle | territorio]
SUBJECT: [descripción específica del sujeto visual]
LIGHT: [calidad, dirección, hora del día]
BACKGROUND: [superficie o ambiente específico]
COLOR_ANCHOR: [color dominante del textil o producto]
HANDS: [present | absent | partial]
AVOID: [lista de elementos a evitar, separados por comas]
REFERENCE_NOTE: [nota opcional para dirección de arte]

Datos del producto:
Nombre: {{nombre}}
Precio: Q{{precio}}
Categoría: {{categoria}}
Región: {{region}}
Descripción existente: {{descripcion}}

Devuelve únicamente el brief con ese formato exacto. Sin prefijos ni explicaciones.`;

// ─── Migration ────────────────────────────────────────────────────────────────

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes("ai_content_templates")) {
      await queryInterface.createTable("ai_content_templates", {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal("gen_random_uuid()"),
          primaryKey: true,
        },

        // ── Identity ────────────────────────────────────────────────────────
        slug: {
          // Matches ai_content_variants.template_id exactly.
          // Format: {template_key}_v{template_version}
          type: Sequelize.STRING(100),
          allowNull: false,
          unique: true,
        },
        template_key: {
          // Stable identifier across versions. e.g., "product_caption"
          type: Sequelize.STRING(60),
          allowNull: false,
        },
        template_version: {
          type: Sequelize.SMALLINT,
          allowNull: false,
        },
        content_type: {
          type: Sequelize.STRING(40),
          allowNull: false,
        },

        // ── Prompt content (immutable after creation) ────────────────────────
        system_prompt: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        user_prompt_template: {
          // Supports {{nombre}}, {{precio}}, {{categoria}}, {{region}}, {{descripcion}}
          // Lines containing an unresolved {{variable}} are dropped at render time.
          type: Sequelize.TEXT,
          allowNull: false,
        },

        // ── Lifecycle ────────────────────────────────────────────────────────
        health_status: {
          // active | degraded | paused | candidate | retired
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: "active",
        },
        is_active: {
          // false for candidates (pending human approval) and retired templates.
          // Degraded templates remain is_active=true but get lower selection weight.
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },

        // ── Performance metrics (updated by TemplatePerformanceService) ──────
        sample_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        generation_score_avg: {
          type: Sequelize.DECIMAL(4, 3),
          allowNull: true,
        },
        performance_score_avg: {
          type: Sequelize.DECIMAL(4, 3),
          allowNull: true,
        },
        rejection_rate: {
          // Fraction of variants using this template that were rejected/discarded
          type: Sequelize.DECIMAL(4, 3),
          allowNull: true,
        },
        edit_rate: {
          // Fraction of approved variants that humans edited before approving
          type: Sequelize.DECIMAL(4, 3),
          allowNull: true,
        },

        // ── Evolution lineage ─────────────────────────────────────────────────
        evolved_from_id: {
          // UUID of the template this evolved from (null for base templates)
          type: Sequelize.UUID,
          allowNull: true,
        },
        evolution_reason: {
          // Why this version was proposed (data-backed explanation)
          type: Sequelize.TEXT,
          allowNull: true,
        },
        evolution_changes: {
          // JSON array of change descriptors: [{type, description, data_signal}]
          type: Sequelize.JSONB,
          allowNull: true,
        },
        expected_improvement: {
          // Estimated generation_score lift from evolution signals
          type: Sequelize.DECIMAL(4, 3),
          allowNull: true,
        },

        // ── Health audit trail ────────────────────────────────────────────────
        paused_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        pause_reason: {
          type: Sequelize.STRING(200),
          allowNull: true,
        },
        approved_by: {
          // admin user id who approved (null for seed templates)
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        approved_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },

        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("NOW()"),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("NOW()"),
        },
      });

      // Unique version constraint: one version per key
      await queryInterface.addIndex("ai_content_templates", ["template_key", "template_version"], {
        unique: true,
        name:   "uq_template_key_version",
      });

      // Fast lookup: find active templates for a content_type
      await queryInterface.addIndex("ai_content_templates", ["content_type", "health_status", "is_active"], {
        name: "idx_templates_content_type_health",
      });

      console.log("✅ Created table: ai_content_templates");
    } else {
      console.log("⏭️  Table ai_content_templates already exists — skipping create.");
    }

    // ── Seed base templates (idempotent via ON CONFLICT DO NOTHING) ───────────
    await queryInterface.sequelize.query(`
      INSERT INTO ai_content_templates (
        id, slug, template_key, template_version, content_type,
        system_prompt, user_prompt_template,
        health_status, is_active,
        created_at, updated_at
      ) VALUES
        (
          gen_random_uuid(),
          'product_caption_v1', 'product_caption', 1, 'caption',
          $system_prompt$${BRAND_SYSTEM_PROMPT}$system_prompt$,
          $tmpl$${CAPTION_V1}$tmpl$,
          'active', true, NOW(), NOW()
        ),
        (
          gen_random_uuid(),
          'product_description_v1', 'product_description', 1, 'product_description',
          $system_prompt$${BRAND_SYSTEM_PROMPT}$system_prompt$,
          $tmpl$${DESCRIPTION_V1}$tmpl$,
          'active', true, NOW(), NOW()
        ),
        (
          gen_random_uuid(),
          'product_image_brief_v1', 'product_image_brief', 1, 'image_prompt_brief',
          $system_prompt$${BRAND_SYSTEM_PROMPT}$system_prompt$,
          $tmpl$${IMAGE_BRIEF_V1}$tmpl$,
          'active', true, NOW(), NOW()
        )
      ON CONFLICT (slug) DO NOTHING
    `);

    console.log("✅ Seeded base templates (product_caption_v1, product_description_v1, product_image_brief_v1)");
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ai_content_templates");
  },
};
