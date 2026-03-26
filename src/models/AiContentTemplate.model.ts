// src/models/AiContentTemplate.model.ts
//
// Versioned, immutable prompt templates for AI content generation.
// One row = one specific version of a prompt template.
//
// IMMUTABILITY RULE: fields system_prompt, user_prompt_template, template_key,
// template_version, slug must NEVER be updated after creation. Evolution
// means creating a new row with a higher template_version.
//
// slug format: {template_key}_v{template_version}
//   e.g. "product_caption_v1", "product_caption_v2"
// This slug is stored in ai_content_variants.template_id for full audit trail.
//
// health_status lifecycle:
//   candidate → active    (admin approves)
//   candidate → retired   (admin rejects)
//   active    → degraded  (TemplateHealthService: high edit rate)
//   active    → paused    (TemplateHealthService: high rejection rate)
//   degraded  → active    (auto-recover when metrics improve)
//   degraded  → paused
//   paused    → retired   (manual admin decision)
//   any       → retired   (superseded by a higher-performing version)

import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/db";

export type TemplateHealthStatus =
  | "active"
  | "degraded"
  | "paused"
  | "candidate"
  | "retired";

interface AiContentTemplateAttributes {
  id:                   string;
  slug:                 string;
  template_key:         string;
  template_version:     number;
  content_type:         string;
  system_prompt:        string;
  user_prompt_template: string;
  health_status:        TemplateHealthStatus;
  is_active:            boolean;
  // Performance metrics
  sample_count:         number;
  generation_score_avg: number | null;
  performance_score_avg: number | null;
  rejection_rate:       number | null;
  edit_rate:            number | null;
  // Evolution lineage
  evolved_from_id:      string | null;
  evolution_reason:     string | null;
  evolution_changes:    Array<{ type: string; description: string; data_signal?: string }> | null;
  expected_improvement: number | null;
  // Health audit
  paused_at:            Date | null;
  pause_reason:         string | null;
  approved_by:          number | null;
  approved_at:          Date | null;
  created_at:           Date;
  updated_at:           Date;
}

type AiContentTemplateCreation = Optional<
  AiContentTemplateAttributes,
  | "id"
  | "health_status"
  | "is_active"
  | "sample_count"
  | "generation_score_avg"
  | "performance_score_avg"
  | "rejection_rate"
  | "edit_rate"
  | "evolved_from_id"
  | "evolution_reason"
  | "evolution_changes"
  | "expected_improvement"
  | "paused_at"
  | "pause_reason"
  | "approved_by"
  | "approved_at"
  | "created_at"
  | "updated_at"
>;

export class AiContentTemplate
  extends Model<AiContentTemplateAttributes, AiContentTemplateCreation>
  implements AiContentTemplateAttributes
{
  declare id:                   string;
  declare slug:                 string;
  declare template_key:         string;
  declare template_version:     number;
  declare content_type:         string;
  declare system_prompt:        string;
  declare user_prompt_template: string;
  declare health_status:        TemplateHealthStatus;
  declare is_active:            boolean;
  declare sample_count:         number;
  declare generation_score_avg: number | null;
  declare performance_score_avg: number | null;
  declare rejection_rate:       number | null;
  declare edit_rate:            number | null;
  declare evolved_from_id:      string | null;
  declare evolution_reason:     string | null;
  declare evolution_changes:    Array<{ type: string; description: string; data_signal?: string }> | null;
  declare expected_improvement: number | null;
  declare paused_at:            Date | null;
  declare pause_reason:         string | null;
  declare approved_by:          number | null;
  declare approved_at:          Date | null;
  declare readonly created_at:  Date;
  declare readonly updated_at:  Date;
}

AiContentTemplate.init(
  {
    id: {
      type:         DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey:   true,
    },
    slug: {
      type:      DataTypes.STRING(100),
      allowNull: false,
      unique:    true,
    },
    template_key: {
      type:      DataTypes.STRING(60),
      allowNull: false,
    },
    template_version: {
      type:      DataTypes.SMALLINT,
      allowNull: false,
    },
    content_type: {
      type:      DataTypes.STRING(40),
      allowNull: false,
    },
    system_prompt: {
      type:      DataTypes.TEXT,
      allowNull: false,
    },
    user_prompt_template: {
      type:      DataTypes.TEXT,
      allowNull: false,
    },
    health_status: {
      type:         DataTypes.STRING(20),
      allowNull:    false,
      defaultValue: "active",
    },
    is_active: {
      type:         DataTypes.BOOLEAN,
      allowNull:    false,
      defaultValue: true,
    },
    sample_count: {
      type:         DataTypes.INTEGER,
      allowNull:    false,
      defaultValue: 0,
    },
    generation_score_avg:  { type: DataTypes.DECIMAL(4, 3), allowNull: true },
    performance_score_avg: { type: DataTypes.DECIMAL(4, 3), allowNull: true },
    rejection_rate:        { type: DataTypes.DECIMAL(4, 3), allowNull: true },
    edit_rate:             { type: DataTypes.DECIMAL(4, 3), allowNull: true },
    evolved_from_id:       { type: DataTypes.UUID,          allowNull: true },
    evolution_reason:      { type: DataTypes.TEXT,          allowNull: true },
    evolution_changes:     { type: DataTypes.JSONB,         allowNull: true },
    expected_improvement:  { type: DataTypes.DECIMAL(4, 3), allowNull: true },
    paused_at:             { type: DataTypes.DATE,          allowNull: true },
    pause_reason:          { type: DataTypes.STRING(200),   allowNull: true },
    approved_by:           { type: DataTypes.INTEGER,       allowNull: true },
    approved_at:           { type: DataTypes.DATE,          allowNull: true },
    created_at: DataTypes.DATE,
    updated_at: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "AiContentTemplate",
    tableName: "ai_content_templates",
    timestamps: true,
    createdAt:  "created_at",
    updatedAt:  "updated_at",
  }
);

export default AiContentTemplate;
