import { DataTypes } from "sequelize";
import { sequelize } from "../config/db";

export const VendedorPerfil = sequelize.define(
  "vendedor_perfil",
  {
    id: {
      type: DataTypes.INTEGER,      // <-- Debe ser INTEGER, igual que en la BD
      primaryKey: true,
      allowNull: false,
    },
    nombre: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    telefono: {
      type: DataTypes.STRING(15),
    },
    direccion: {
      type: DataTypes.TEXT,
    },
    imagen_url: {
      type: DataTypes.TEXT,
    },
    nombre_comercio: {
      type: DataTypes.STRING(100),
    },
    telefono_comercio: {
      type: DataTypes.STRING(15),
    },
    departamento: {
      type: DataTypes.STRING(50),
    },
    municipio: {
      type: DataTypes.STRING(100),
    },
    descripcion: {
      type: DataTypes.TEXT,
    },
    dpi: {
      type: DataTypes.STRING(13),
    },
    foto_dpi_frente: {
      type: DataTypes.TEXT,
    },
    foto_dpi_reverso: {
      type: DataTypes.TEXT,
    },
    selfie_con_dpi: {
      type: DataTypes.TEXT,
    },
    actualizado_en: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    freezeTableName: true, // Esto asegura que el nombre no se pluralice
  }
);
