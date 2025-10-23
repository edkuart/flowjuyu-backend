// src/models/VendedorPerfil.ts
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/db";
import { User } from "./user.model";

interface VendedorPerfilAttrs {
  id: number;
  user_id: number;
  nombre: string;
  correo: string;
  telefono?: string | null;
  direccion?: string | null;
  logo?: string | null;
  nombre_comercio: string;
  telefono_comercio?: string | null;
  departamento?: string | null;
  municipio?: string | null;
  descripcion?: string | null;
  dpi: string;
  foto_dpi_frente?: string | null;
  foto_dpi_reverso?: string | null;
  selfie_con_dpi?: string | null;
  estado_validacion?: "pendiente" | "aprobado" | "rechazado" | null;
  observaciones?: string | null;
  estado?: "activo" | "inactivo" | null;
  actualizado_en?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

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
  | "foto_dpi_frente"
  | "foto_dpi_reverso"
  | "selfie_con_dpi"
  | "estado_validacion"
  | "observaciones"
  | "estado"
  | "actualizado_en"
  | "createdAt"
  | "updatedAt"
>;

export class VendedorPerfil extends Model<VendedorPerfilAttrs, Creation>
  implements VendedorPerfilAttrs {
  public id!: number;
  public user_id!: number;
  public nombre!: string;
  public correo!: string;
  public telefono?: string | null;
  public direccion?: string | null;
  public logo?: string | null;
  public nombre_comercio!: string;
  public telefono_comercio?: string | null;
  public departamento?: string | null;
  public municipio?: string | null;
  public descripcion?: string | null;
  public dpi!: string;
  public foto_dpi_frente?: string | null;
  public foto_dpi_reverso?: string | null;
  public selfie_con_dpi?: string | null;
  public estado_validacion?: "pendiente" | "aprobado" | "rechazado" | null;
  public observaciones?: string | null;
  public estado?: "activo" | "inactivo" | null;
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
    correo: {
      type: DataTypes.STRING(100),
      allowNull: false,
      set(value: string) {
        this.setDataValue("correo", value?.toLowerCase().trim());
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
    dpi: { type: DataTypes.STRING(13), allowNull: false },
    foto_dpi_frente: { type: DataTypes.TEXT, allowNull: true },
    foto_dpi_reverso: { type: DataTypes.TEXT, allowNull: true },
    selfie_con_dpi: { type: DataTypes.TEXT, allowNull: true },
    estado_validacion: {
      type: DataTypes.STRING(30),
      allowNull: true,
      defaultValue: "pendiente",
    },
    observaciones: { type: DataTypes.TEXT, allowNull: true },
    estado: {
      type: DataTypes.STRING(30),
      allowNull: true,
      defaultValue: "activo",
    },
    actualizado_en: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: true },
    updatedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: "vendedor_perfil",
    freezeTableName: true,
    timestamps: true,
  },
);

// 🔗 Asociaciones
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
