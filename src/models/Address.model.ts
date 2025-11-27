import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db";

class Address extends Model {}

Address.init(
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
    nombre_receptor: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    apellido_receptor: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    telefono: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    departamento: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    municipio: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    direccion_exacta: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    referencia: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "Address",
    freezeTableName: true,     
    tableName: "addresses",    
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default Address;
