// src/models/AiContentVariant.model.ts
//
// One generation attempt tied to one content item.
// Multiple variants can exist per item; only one can have status='published'.
// timestamps=false: managed manually via generated_at, published_at, archived_at.

import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/db";
import type {
  VariantStatus,
  RejectionReason,
  QueueFlag,
} from "../types/content.types";

interface AiContentVariantAttributes {
  id: string;
  content_item_id: string;
  variant_number: number;
  // Generated content
  content_body: string;
  content_hash: string;
  language: string;
  word_count: number;
  // LLM call metadata
  template_id: string;
  model_used: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  generated_at: Date;
  // Generation score components
  score_specificity: number | null;
  score_brand_alignment: number | null;
  score_readability: number | null;
  score_seo_coverage: number | null;
  generation_score: number | null;
  // Guardrail result
  guardrail_passed: boolean | null;
  guardrail_checked_at: Date | null;
  guardrail_failures: string[] | null;
  // Status
  status: VariantStatus;
  rejection_reason: RejectionReason | null;
  rejection_note: string | null;
  queue_flag: QueueFlag | null;
  // Lifecycle timestamps
  published_at: Date | null;
  archived_at: Date | null;
}

type AiContentVariantCreation = Optional<
  AiContentVariantAttributes,
  | "id"
  | "generated_at"
  | "score_specificity"
  | "score_brand_alignment"
  | "score_readability"
  | "score_seo_coverage"
  | "generation_score"
  | "guardrail_passed"
  | "guardrail_checked_at"
  | "guardrail_failures"
  | "rejection_reason"
  | "rejection_note"
  | "queue_flag"
  | "published_at"
  | "archived_at"
>;

export class AiContentVariant
  extends Model<AiContentVariantAttributes, AiContentVariantCreation>
  implements AiContentVariantAttributes
{
  public id!: string;
  public content_item_id!: string;
  public variant_number!: number;
  public content_body!: string;
  public content_hash!: string;
  public language!: string;
  public word_count!: number;
  public template_id!: string;
  public model_used!: string;
  public prompt_tokens!: number;
  public completion_tokens!: number;
  public cost_usd!: number;
  public readonly generated_at!: Date;
  public score_specificity!: number | null;
  public score_brand_alignment!: number | null;
  public score_readability!: number | null;
  public score_seo_coverage!: number | null;
  public generation_score!: number | null;
  public guardrail_passed!: boolean | null;
  public guardrail_checked_at!: Date | null;
  public guardrail_failures!: string[] | null;
  public status!: VariantStatus;
  public rejection_reason!: RejectionReason | null;
  public rejection_note!: string | null;
  public queue_flag!: QueueFlag | null;
  public published_at!: Date | null;
  public archived_at!: Date | null;
}

AiContentVariant.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    content_item_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    variant_number: {
      type: DataTypes.SMALLINT,
      allowNull: false,
    },
    content_body: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    content_hash: {
      type: DataTypes.CHAR(64),
      allowNull: false,
    },
    language: {
      type: DataTypes.CHAR(2),
      allowNull: false,
      defaultValue: "es",
    },
    word_count: {
      type: DataTypes.SMALLINT,
      allowNull: false,
    },
    template_id: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    model_used: {
      type: DataTypes.STRING(60),
      allowNull: false,
    },
    prompt_tokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    completion_tokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    cost_usd: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: false,
    },
    generated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    score_specificity:     { type: DataTypes.DECIMAL(4, 3), allowNull: true },
    score_brand_alignment: { type: DataTypes.DECIMAL(4, 3), allowNull: true },
    score_readability:     { type: DataTypes.DECIMAL(4, 3), allowNull: true },
    score_seo_coverage:    { type: DataTypes.DECIMAL(4, 3), allowNull: true },
    generation_score:      { type: DataTypes.DECIMAL(4, 3), allowNull: true },
    guardrail_passed:      { type: DataTypes.BOOLEAN, allowNull: true },
    guardrail_checked_at:  { type: DataTypes.DATE, allowNull: true },
    guardrail_failures: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: "generated",
    },
    rejection_reason: { type: DataTypes.STRING(50), allowNull: true },
    rejection_note:   { type: DataTypes.TEXT, allowNull: true },
    queue_flag:       { type: DataTypes.STRING(20), allowNull: true },
    published_at:     { type: DataTypes.DATE, allowNull: true },
    archived_at:      { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: "AiContentVariant",
    tableName: "ai_content_variants",
    timestamps: false,
  }
);

export default AiContentVariant;
