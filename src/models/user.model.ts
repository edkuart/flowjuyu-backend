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
    contraseña: {
      type: DataTypes.STRING,
      allowNull: false,
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
  },
  {
    sequelize,
    modelName: "User",
    tableName: "users", // tu tabla en Supabase
    timestamps: false,
  }
);
