import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/db";
import { User } from "./user.model";

/* ======================================================
   🎯 Estados Oficiales
====================================================== */
export type EstadoValidacion =
  | "pendiente"
  | "aprobado"
  | "rechazado";

export type EstadoAdmin =
  | "activo"
  | "inactivo"
  | "suspendido";

/* ======================================================
   🧱 Interface Base
====================================================== */
interface VendedorPerfilAttrs {
  id: number;
  user_id: number;
  nombre: string;
  email: string;
  telefono?: string | null;
  direccion?: string | null;
  logo?: string | null;
  nombre_comercio: string;
  telefono_comercio?: string | null;
  departamento?: string | null;
  municipio?: string | null;
  descripcion?: string | null;
  dpi?: string | null;
  foto_dpi_frente?: string | null;
  foto_dpi_reverso?: string | null;
  selfie_con_dpi?: string | null;

  estado_validacion: EstadoValidacion;
  estado_admin: EstadoAdmin;

  observaciones?: string | null;
  actualizado_en?: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

/* ======================================================
   🧱 Creation Type
====================================================== */
type Creation = Optional<
  VendedorPerfilAttrs,
  | "id"
  | "telefono"
  | "direccion"
  | "logo"
  | "telefono_comercio"
  | "departamento"
  | "municipio"
  | "descripcion"
  | "dpi"
  | "foto_dpi_frente"
  | "foto_dpi_reverso"
  | "selfie_con_dpi"
  | "observaciones"
  | "actualizado_en"
  | "createdAt"
  | "updatedAt"
>;

/* ======================================================
   🧱 Modelo Sequelize
====================================================== */
export class VendedorPerfil
  extends Model<VendedorPerfilAttrs, Creation>
  implements VendedorPerfilAttrs
{
  public id!: number;
  public user_id!: number;
  public nombre!: string;
  public email!: string;
  public telefono?: string | null;
  public direccion?: string | null;
  public logo?: string | null;
  public nombre_comercio!: string;
  public telefono_comercio?: string | null;
  public departamento?: string | null;
  public municipio?: string | null;
  public descripcion?: string | null;
  public dpi?: string | null;
  public foto_dpi_frente?: string | null;
  public foto_dpi_reverso?: string | null;
  public selfie_con_dpi?: string | null;

  public estado_validacion!: EstadoValidacion;
  public estado_admin!: EstadoAdmin;

  public observaciones?: string | null;
  public actualizado_en?: Date | null;

  public readonly createdAt?: Date;
  public readonly updatedAt?: Date;
}

VendedorPerfil.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    nombre: { type: DataTypes.STRING(100), allowNull: false },
    email: {
      type: DataTypes.STRING(100),
      allowNull: false,
      set(value: string) {
        this.setDataValue("email", value?.toLowerCase().trim());
      },
    },
    telefono: { type: DataTypes.STRING(15), allowNull: true },
    direccion: { type: DataTypes.TEXT, allowNull: true },
    logo: { type: DataTypes.TEXT, allowNull: true },
    nombre_comercio: { type: DataTypes.STRING(100), allowNull: false },
    telefono_comercio: { type: DataTypes.STRING(15), allowNull: true },
    departamento: { type: DataTypes.STRING(50), allowNull: true },
    municipio: { type: DataTypes.STRING(100), allowNull: true },
    descripcion: { type: DataTypes.TEXT, allowNull: true },
    dpi: { type: DataTypes.STRING(13), allowNull: true },
    foto_dpi_frente: { type: DataTypes.TEXT, allowNull: true },
    foto_dpi_reverso: { type: DataTypes.TEXT, allowNull: true },
    selfie_con_dpi: { type: DataTypes.TEXT, allowNull: true },

    estado_validacion: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "pendiente",
    },

    estado_admin: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "inactivo",
    },

    observaciones: { type: DataTypes.TEXT, allowNull: true },
    actualizado_en: { type: DataTypes.DATE, allowNull: true },

    createdAt: { type: DataTypes.DATE, allowNull: true },
    updatedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: "vendedor_perfil",
    freezeTableName: true,
    timestamps: true,
  }
);

/* ======================================================
   🔗 Asociaciones
====================================================== */
User.hasOne(VendedorPerfil, {
  foreignKey: "user_id",
  as: "perfil",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

VendedorPerfil.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
