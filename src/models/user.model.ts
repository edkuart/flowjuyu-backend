// src/models/user.model.ts

import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/db";

export type UserRole = "buyer" | "seller" | "admin" | "support";

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

  terms_current?: boolean;
  terms_version?: string | null;
  terms_accepted_at?: Date | null;
  privacy_current?: boolean;
  privacy_version?: string | null;
  privacy_accepted_at?: Date | null;
  marketing_email?: boolean;
  marketing_email_at?: Date | null;
  marketing_whatsapp?: boolean;
  marketing_whatsapp_at?: Date | null;
  data_processing_acknowledged?: boolean;
  data_processing_acknowledged_at?: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

interface UserCreationAttributes
  extends Optional<
    UserAttributes,
    | "id"
    | "token_version"
    | "terms_current"
    | "terms_version"
    | "terms_accepted_at"
    | "privacy_current"
    | "privacy_version"
    | "privacy_accepted_at"
    | "marketing_email"
    | "marketing_email_at"
    | "marketing_whatsapp"
    | "marketing_whatsapp_at"
    | "data_processing_acknowledged"
    | "data_processing_acknowledged_at"
  > {}

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

  public terms_current?: boolean;
  public terms_version?: string | null;
  public terms_accepted_at?: Date | null;
  public privacy_current?: boolean;
  public privacy_version?: string | null;
  public privacy_accepted_at?: Date | null;
  public marketing_email?: boolean;
  public marketing_email_at?: Date | null;
  public marketing_whatsapp?: boolean;
  public marketing_whatsapp_at?: Date | null;
  public data_processing_acknowledged?: boolean;
  public data_processing_acknowledged_at?: Date | null;

  public readonly createdAt?: Date;
  public readonly updatedAt?: Date;
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

    terms_current: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    terms_version: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    terms_accepted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    privacy_current: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    privacy_version: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    privacy_accepted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    marketing_email: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    marketing_email_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    marketing_whatsapp: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    marketing_whatsapp_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    data_processing_acknowledged: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    data_processing_acknowledged_at: {
      type: DataTypes.DATE,
      allowNull: true,
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
