// src/models/AiContentPerformanceDaily.model.ts
//
// One row per (content_item_id, content_variant_id, recorded_date, channel).
// Written by the ContentPerformanceService rollup; never modified manually.
// All rate fields are pre-computed at write time for query performance.

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db";

export class AiContentPerformanceDaily extends Model<
  InferAttributes<AiContentPerformanceDaily>,
  InferCreationAttributes<AiContentPerformanceDaily>
> {
  declare id: CreationOptional<string>;

  // Attribution
  declare content_item_id: string;
  declare content_variant_id: string;

  // Date + channel
  declare recorded_date: string; // DATEONLY → 'YYYY-MM-DD'
  declare channel: CreationOptional<string>; // default: 'organic'

  // Raw event counts
  declare impressions: CreationOptional<number>;
  declare views: CreationOptional<number>;
  declare clicks: CreationOptional<number>;
  declare whatsapp_clicks: CreationOptional<number>;
  declare intentions: CreationOptional<number>;
  declare saves: CreationOptional<number>;

  // Computed rates
  declare engagement_rate: number | null;
  declare click_rate: number | null;
  declare whatsapp_rate: number | null;
  declare intent_rate: number | null;
  declare time_on_page_avg: number | null;

  // Composite performance score
  declare performance_score: number | null;

  // Meta
  declare attribution_confidence: CreationOptional<string>;
  declare source_event_type: string | null;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

AiContentPerformanceDaily.init(
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
    content_variant_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    recorded_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    channel: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: "organic",
    },

    impressions: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
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
    whatsapp_clicks: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    intentions: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    saves: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    engagement_rate: {
      type: DataTypes.DECIMAL(6, 4),
      allowNull: true,
    },
    click_rate: {
      type: DataTypes.DECIMAL(6, 4),
      allowNull: true,
    },
    whatsapp_rate: {
      type: DataTypes.DECIMAL(6, 4),
      allowNull: true,
    },
    intent_rate: {
      type: DataTypes.DECIMAL(6, 4),
      allowNull: true,
    },
    time_on_page_avg: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: true,
    },

    performance_score: {
      type: DataTypes.DECIMAL(4, 3),
      allowNull: true,
    },

    attribution_confidence: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "approximate",
    },
    source_event_type: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },

    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: "ai_content_performance_daily",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default AiContentPerformanceDaily;
