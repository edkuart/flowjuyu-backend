// src/models/AiContentItem.model.ts
//
// Canonical content need per subject + content_type combination.
// One row = "content of this type is needed for this subject."
// Generation attempts are tracked in AiContentVariant.

import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/db";
import type { ContentType, SubjectType, ItemStatus } from "../types/content.types";

interface AiContentItemAttributes {
  id: string;
  subject_type: SubjectType;
  subject_id: string;
  content_type: ContentType;
  status: ItemStatus;
  priority: number;
  last_generated_at: Date | null;
  generation_count: number;
  cooldown_until: Date | null;
  published_variant_id: string | null;
  created_at: Date;
  updated_at: Date;
}

type AiContentItemCreation = Optional<
  AiContentItemAttributes,
  | "id"
  | "status"
  | "priority"
  | "last_generated_at"
  | "generation_count"
  | "cooldown_until"
  | "published_variant_id"
  | "created_at"
  | "updated_at"
>;

export class AiContentItem
  extends Model<AiContentItemAttributes, AiContentItemCreation>
  implements AiContentItemAttributes
{
  public id!: string;
  public subject_type!: SubjectType;
  public subject_id!: string;
  public content_type!: ContentType;
  public status!: ItemStatus;
  public priority!: number;
  public last_generated_at!: Date | null;
  public generation_count!: number;
  public cooldown_until!: Date | null;
  public published_variant_id!: string | null;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

AiContentItem.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    subject_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    subject_id: {
      type: DataTypes.STRING(36),
      allowNull: false,
    },
    content_type: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "pending",
    },
    priority: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 5,
    },
    last_generated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    generation_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    cooldown_until: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    published_variant_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    created_at: DataTypes.DATE,
    updated_at: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "AiContentItem",
    tableName: "ai_content_items",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default AiContentItem;
