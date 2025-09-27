// src/models/VendedorPerfil.ts
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/db";
import { User } from "./user.model";

interface VendedorPerfilAttrs {
  id: number;
  userId: number; // FK -> users.id
  nombre: string;
  correo: string; // si tu tabla tiene "email", cámbialo aquí y en el payload del controlador
  telefono?: string | null;
  direccion?: string | null;
  imagen_url?: string | null;
  nombre_comercio: string;
  telefono_comercio?: string | null;
  departamento?: string | null;
  municipio?: string | null;
  descripcion?: string | null;
  dpi: string;
  foto_dpi_frente?: string | null;
  foto_dpi_reverso?: string | null;
  selfie_con_dpi?: string | null;
  estado: "pendiente" | "aprobado" | "rechazado";
}

type Creation = Optional<
  VendedorPerfilAttrs,
  | "id"
  | "telefono"
  | "direccion"
  | "imagen_url"
  | "telefono_comercio"
  | "departamento"
  | "municipio"
  | "descripcion"
  | "foto_dpi_frente"
  | "foto_dpi_reverso"
  | "selfie_con_dpi"
  | "estado"
>;

export class VendedorPerfil extends Model<VendedorPerfilAttrs, Creation> {}

VendedorPerfil.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true, // ✅ deja que la BD asigne el id
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "user_id", // mapea a la columna real
      references: { model: "users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    nombre: { type: DataTypes.STRING(100), allowNull: false },
    correo: { type: DataTypes.STRING(100), allowNull: false },
    telefono: { type: DataTypes.STRING(15), allowNull: true },
    direccion: { type: DataTypes.TEXT, allowNull: true },
    imagen_url: { type: DataTypes.TEXT, allowNull: true },
    nombre_comercio: { type: DataTypes.STRING(100), allowNull: false },
    telefono_comercio: { type: DataTypes.STRING(15), allowNull: true },
    departamento: { type: DataTypes.STRING(50), allowNull: true },
    municipio: { type: DataTypes.STRING(100), allowNull: true },
    descripcion: { type: DataTypes.TEXT, allowNull: true },
    dpi: { type: DataTypes.STRING(13), allowNull: false },
    foto_dpi_frente: { type: DataTypes.TEXT, allowNull: true },
    foto_dpi_reverso: { type: DataTypes.TEXT, allowNull: true },
    selfie_con_dpi: { type: DataTypes.TEXT, allowNull: true },
    estado: {
      type: DataTypes.ENUM("pendiente", "aprobado", "rechazado"),
      allowNull: false,
      defaultValue: "pendiente",
    },
  },
  {
    sequelize,
    tableName: "vendedor_perfil",
    freezeTableName: true,
    timestamps: true, // usa createdAt y updatedAt
    underscored: true, // columnas tipo created_at, updated_at, user_id
  }
);

// Asociaciones
User.hasOne(VendedorPerfil, { foreignKey: "user_id", as: "perfil" });
VendedorPerfil.belongsTo(User, { foreignKey: "user_id", as: "user" });
