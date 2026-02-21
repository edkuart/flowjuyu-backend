// src/models/user.model.ts

import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/db";

/* ===============================
   ROLE TYPE
=============================== */

export type UserRole = "buyer" | "seller" | "admin" | "support";

/* ===============================
   ATTRIBUTES
=============================== */

interface UserAttributes {
  id: number;
  nombre: string;
  correo: string;
  password: string;
  telefono?: string;
  direccion?: string;
  rol: UserRole;
  token_version: number;

  reset_password_token?: string | null;
  reset_password_expires?: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

interface UserCreationAttributes
  extends Optional<UserAttributes, "id" | "token_version"> {}

/* ===============================
   MODEL
=============================== */

export class User
  extends Model<UserAttributes, UserCreationAttributes>
  implements UserAttributes
{
  public id!: number;
  public nombre!: string;
  public correo!: string;
  public password!: string;
  public rol!: UserRole;
  public telefono?: string;
  public direccion?: string;
  public token_version!: number;

  public reset_password_token?: string | null;
  public reset_password_expires?: Date | null;

  public readonly createdAt?: Date;
  public readonly updatedAt?: Date;
}

/* ===============================
   INIT
=============================== */

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    token_version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    nombre: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    correo: {
      type: DataTypes.STRING,
      allowNull: false,
      set(value: string) {
        this.setDataValue("correo", value?.toLowerCase().trim());
      },
    },

    password: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "contraseña", // mantiene compatibilidad con DB actual
    },

    reset_password_token: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    reset_password_expires: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    rol: {
      type: DataTypes.ENUM("buyer", "seller", "admin", "support"),
      allowNull: false,
      defaultValue: "buyer",
    },

    telefono: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    direccion: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "createdAt",
      defaultValue: DataTypes.NOW,
    },

    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "updatedAt",
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: "User",
    tableName: "users",
    timestamps: true,
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    underscored: true,
  }
);