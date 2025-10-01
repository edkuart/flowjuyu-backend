// src/models/vendedor.model.ts
import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "../config/db";

interface VendedorAttributes {
  id: number;
  nombreComercio: string;
  direccion: string;
  nit: string;
  logoUrl: string;
}

interface VendedorCreationAttributes
  extends Optional<VendedorAttributes, "id"> {}

export class Vendedor
  extends Model<VendedorAttributes, VendedorCreationAttributes>
  implements VendedorAttributes
{
  public id!: number;
  public nombreComercio!: string;
  public direccion!: string;
  public nit!: string;
  public logoUrl!: string;
}

Vendedor.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    nombreComercio: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    direccion: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    nit: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    logoUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "Vendedor",
    tableName: "vendedores",
    timestamps: false,
  },
);
