import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/db";

interface PurchaseIntentionAttrs {
  id: string;
  product_id?: string | null;   // 🔥 ahora opcional
  seller_id: number;
  user_id?: number | null;
  source?: string;
  created_at?: Date;
}

type Creation = Optional<
  PurchaseIntentionAttrs,
  "id" | "product_id" | "user_id" | "source" | "created_at"
>;

export class PurchaseIntention
  extends Model<PurchaseIntentionAttrs, Creation>
  implements PurchaseIntentionAttrs
{
  public id!: string;
  public product_id?: string | null;
  public seller_id!: number;
  public user_id?: number | null;
  public source?: string;
  public created_at?: Date;
}

PurchaseIntention.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    // 🔥 AHORA PERMITE NULL
    product_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    seller_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    source: {
      type: DataTypes.STRING(50),
      defaultValue: "product_page",
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "purchase_intentions",
    timestamps: false,
  }
);