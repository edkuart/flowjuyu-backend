import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/db";

interface UserAttributes {
  id: number;
  nombre: string;
  correo: string;
  contraseña: string;
  telefono?: string;
  direccion?: string;
  rol: "comprador" | "vendedor" | "admin";
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserCreationAttributes extends Optional<UserAttributes, "id"> {}

export class User extends Model<UserAttributes, UserCreationAttributes>
  implements UserAttributes {
  public id!: number;
  public nombre!: string;
  public correo!: string;
  public contraseña!: string;
  public rol!: "comprador" | "vendedor" | "admin";
  public telefono?: string;
  public direccion?: string;
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
    nombre: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    correo: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    // Mapeo explícito para la columna con tilde en la BD
    contraseña: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "contraseña",
    },
    rol: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "comprador",
    },
    telefono: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    direccion: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // Opcional: si quieres que Sequelize defina tipos también aquí
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
    // La tabla ya tiene createdAt/updatedAt NOT NULL
    timestamps: true,
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  }
);
