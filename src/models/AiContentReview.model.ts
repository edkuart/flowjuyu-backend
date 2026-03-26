// src/models/AiContentReview.model.ts
//
// Immutable log of every human review action on a variant.
// Multiple rows per variant are possible (e.g., rejected then re-submitted).
// The was_edited flag + content_before/after power the admin_edit_rate signal.

import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/db";
import type { ReviewAction, RejectionReason } from "../types/content.types";

interface AiContentReviewAttributes {
  id: string;
  variant_id: string;
  reviewer_id: number;
  reviewed_at: Date;
  action: ReviewAction;
  was_edited: boolean;
  content_before: string | null;
  content_after: string | null;
  edit_char_delta: number | null;
  rejection_reason: RejectionReason | null;
  rejection_note: string | null;
}

type AiContentReviewCreation = Optional<
  AiContentReviewAttributes,
  | "id"
  | "reviewed_at"
  | "was_edited"
  | "content_before"
  | "content_after"
  | "edit_char_delta"
  | "rejection_reason"
  | "rejection_note"
>;

export class AiContentReview
  extends Model<AiContentReviewAttributes, AiContentReviewCreation>
  implements AiContentReviewAttributes
{
  public id!: string;
  public variant_id!: string;
  public reviewer_id!: number;
  public readonly reviewed_at!: Date;
  public action!: ReviewAction;
  public was_edited!: boolean;
  public content_before!: string | null;
  public content_after!: string | null;
  public edit_char_delta!: number | null;
  public rejection_reason!: RejectionReason | null;
  public rejection_note!: string | null;
}

AiContentReview.init(
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
    reviewer_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    action: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    was_edited: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    content_before:  { type: DataTypes.TEXT, allowNull: true },
    content_after:   { type: DataTypes.TEXT, allowNull: true },
    edit_char_delta: { type: DataTypes.INTEGER, allowNull: true },
    rejection_reason: { type: DataTypes.STRING(50), allowNull: true },
    rejection_note:   { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    modelName: "AiContentReview",
    tableName: "ai_content_reviews",
    timestamps: false,
  }
);

export default AiContentReview;
