import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/db";

interface TicketMessageAttributes {
  id: number;
  ticket_id: number;
  sender_id: number;
  mensaje: string;
  es_admin: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

type CreationAttributes = Optional<TicketMessageAttributes, "id">;

export class TicketMessage
  extends Model<TicketMessageAttributes, CreationAttributes>
  implements TicketMessageAttributes
{
  public id!: number;
  public ticket_id!: number;
  public sender_id!: number;
  public mensaje!: string;
  public es_admin!: boolean;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

TicketMessage.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    ticket_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    sender_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    mensaje: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    es_admin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: "ticket_messages",
    timestamps: true,
  }
);
