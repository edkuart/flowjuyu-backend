import { Model, DataTypes, Optional } from "sequelize";
import { sequelize } from "../config/db";

interface VideoCreditTransactionAttributes {
  id: string;
  user_id: number;
  package_id: string;
  gtq_cents: number;
  amount_usd_cents: number;
  provider: string;
  provider_session_id: string | null;
  provider_transaction_id: string | null;
  status: "pending" | "completed" | "failed" | "refunded";
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface VideoCreditTransactionCreationAttributes extends Optional<
  VideoCreditTransactionAttributes,
  | "id"
  | "provider"
  | "provider_session_id"
  | "provider_transaction_id"
  | "completed_at"
  | "created_at"
  | "updated_at"
> {}

class VideoCreditTransaction
  extends Model<
    VideoCreditTransactionAttributes,
    VideoCreditTransactionCreationAttributes
  >
  implements VideoCreditTransactionAttributes
{
  declare id: string;
  declare user_id: number;
  declare package_id: string;
  declare gtq_cents: number;
  declare amount_usd_cents: number;
  declare provider: string;
  declare provider_session_id: string | null;
  declare provider_transaction_id: string | null;
  declare status: "pending" | "completed" | "failed" | "refunded";
  declare completed_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

VideoCreditTransaction.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    package_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    gtq_cents: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    amount_usd_cents: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    provider: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "paypal",
    },
    provider_session_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
    },
    provider_transaction_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
    },
    status: {
      type: DataTypes.ENUM("pending", "completed", "failed", "refunded"),
      allowNull: false,
      defaultValue: "pending",
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "video_credit_transactions",
    timestamps: true,
    underscored: true,
  },
);

export default VideoCreditTransaction;
