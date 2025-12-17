import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/db";

interface TicketAttributes {
  id: number;
  user_id: number;
  asunto: string;
  mensaje: string;
  estado: "abierto" | "en_proceso" | "cerrado";
  createdAt?: Date;
  updatedAt?: Date;
}

interface TicketCreationAttributes extends Optional<TicketAttributes, "id" | "estado"> {}

export class Ticket
  extends Model<TicketAttributes, TicketCreationAttributes>
  implements TicketAttributes
{
  public id!: number;
  public user_id!: number;
  public asunto!: string;
  public mensaje!: string;
  public estado!: "abierto" | "en_proceso" | "cerrado";
}

Ticket.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    asunto: { type: DataTypes.STRING, allowNull: false },
    mensaje: { type: DataTypes.TEXT, allowNull: false },
    estado: {
      type: DataTypes.ENUM("abierto", "en_proceso", "cerrado"),
      defaultValue: "abierto",
    },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "tickets",
    modelName: "Ticket",
    timestamps: true,
  }
);
