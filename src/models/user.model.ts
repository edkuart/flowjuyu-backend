// src/models/user.model.ts

import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/db";

interface UserAttributes {
  id: number;
  nombre: string;
  correo: string;
  password: string;
  telefono?: string;
  direccion?: string;
  rol: "comprador" | "vendedor" | "admin" | "soporte";
  token_version: number;
  
  reset_password_token?: string | null;
  reset_password_expires?: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

interface UserCreationAttributes
  extends Optional<UserAttributes, "id" | "token_version"> {}

export class User
  extends Model<UserAttributes, UserCreationAttributes>
  implements UserAttributes
{
  public id!: number;
  public nombre!: string;
  public correo!: string;
  public password!: string;
  public rol!: "comprador" | "vendedor" | "admin" | "soporte";
  public telefono?: string;
  public direccion?: string;
  public token_version!: number;
  public readonly createdAt?: Date;
  public readonly updatedAt?: Date;
  public reset_password_token?: string | null;
  public reset_password_expires?: Date | null;
}

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
      field: "contraseña",
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
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "comprador",
      validate: {
        isIn: [["comprador", "vendedor", "admin", "soporte"]],
      },
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
  },
);
 