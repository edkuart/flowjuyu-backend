// src/models/AiContentUsage.model.ts
//
// Records each time an approved/published variant is distributed to a platform.
// Analytics counters (views, clicks, conversions) are updated post-distribution.

import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/db";

interface AiContentUsageAttributes {
  id: string;
  variant_id: string;
  platform: string;
  used_at: Date;
  views: number;
  clicks: number;
  conversions: number;
}

type AiContentUsageCreation = Optional<
  AiContentUsageAttributes,
  "id" | "used_at" | "views" | "clicks" | "conversions"
>;

export class AiContentUsage
  extends Model<AiContentUsageAttributes, AiContentUsageCreation>
  implements AiContentUsageAttributes
{
  public id!: string;
  public variant_id!: string;
  public platform!: string;
  public readonly used_at!: Date;
  public views!: number;
  public clicks!: number;
  public conversions!: number;
}

AiContentUsage.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    variant_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    platform: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    used_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    views: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    clicks: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    conversions: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: "AiContentUsage",
    tableName: "ai_content_usage",
    timestamps: false,
  }
);

export default AiContentUsage;
