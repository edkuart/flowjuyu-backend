import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/db";

/* ======================================================
   🎫 Tipos de dominio
====================================================== */
export type TicketEstado =
  | "abierto"
  | "en_proceso"
  | "esperando_usuario"
  | "cerrado";

export type TicketTipo =
  | "soporte"
  | "verificacion"
  | "incidencia"
  | "otro";

export type TicketPrioridad =
  | "baja"
  | "media"
  | "alta";

/* ======================================================
   🧱 Atributos del modelo
====================================================== */
interface TicketAttributes {
  id: number;

  // Usuario que creó el ticket (seller por ahora)
  user_id: number;

  asunto: string;
  mensaje: string;

  estado: TicketEstado;
  tipo: TicketTipo;
  prioridad: TicketPrioridad;

  // Admin asignado
  asignado_a?: number | null;

  // Fecha de cierre
  closedAt?: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

/* ======================================================
   🧱 Atributos al crear
====================================================== */
type TicketCreationAttributes = Optional<
  TicketAttributes,
  | "id"
  | "estado"
  | "tipo"
  | "prioridad"
  | "asignado_a"
  | "closedAt"
  | "createdAt"
  | "updatedAt"
>;

/* ======================================================
   📦 Modelo Sequelize
====================================================== */
export class Ticket
  extends Model<TicketAttributes, TicketCreationAttributes>
  implements TicketAttributes
{
  public id!: number;
  public user_id!: number;

  public asunto!: string;
  public mensaje!: string;

  public estado!: TicketEstado;
  public tipo!: TicketTipo;
  public prioridad!: TicketPrioridad;

  public asignado_a?: number | null;
  public closedAt?: Date | null;

  public readonly createdAt?: Date;
  public readonly updatedAt?: Date;
}

Ticket.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    asunto: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },

    mensaje: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    estado: {
      type: DataTypes.ENUM(
        "abierto",
        "en_proceso",
        "esperando_usuario",
        "cerrado"
      ),
      allowNull: false,
      defaultValue: "abierto",
    },

    tipo: {
      type: DataTypes.ENUM(
        "soporte",
        "verificacion",
        "incidencia",
        "otro"
      ),
      allowNull: false,
      defaultValue: "soporte",
    },

    prioridad: {
      type: DataTypes.ENUM("baja", "media", "alta"),
      allowNull: false,
      defaultValue: "media",
    },

    asignado_a: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    closedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "tickets",
    modelName: "Ticket",
    timestamps: true,
  }
);
