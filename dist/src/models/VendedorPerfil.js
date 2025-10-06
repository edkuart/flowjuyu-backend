"use strict";
// src/models/VendedorPerfil.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.VendedorPerfil = void 0;
const sequelize_1 = require("sequelize");
const db_1 = require("../config/db");
const user_model_1 = require("./user.model");
class VendedorPerfil extends sequelize_1.Model {
}
exports.VendedorPerfil = VendedorPerfil;
VendedorPerfil.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
    },
    user_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
    },
    nombre: { type: sequelize_1.DataTypes.STRING(100), allowNull: false },
    correo: {
        type: sequelize_1.DataTypes.STRING(100),
        allowNull: false,
        set(value) {
            this.setDataValue("correo", value?.toLowerCase().trim());
        },
    },
    telefono: { type: sequelize_1.DataTypes.STRING(15), allowNull: true },
    direccion: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
    logo: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
    nombre_comercio: { type: sequelize_1.DataTypes.STRING(100), allowNull: false },
    telefono_comercio: { type: sequelize_1.DataTypes.STRING(15), allowNull: true },
    departamento: { type: sequelize_1.DataTypes.STRING(50), allowNull: true },
    municipio: { type: sequelize_1.DataTypes.STRING(100), allowNull: true },
    descripcion: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
    dpi: { type: sequelize_1.DataTypes.STRING(13), allowNull: false },
    foto_dpi_frente: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
    foto_dpi_reverso: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
    selfie_con_dpi: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
    estado_validacion: { type: sequelize_1.DataTypes.STRING(30), allowNull: true },
    observaciones: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
    estado: { type: sequelize_1.DataTypes.STRING(30), allowNull: true },
    actualizado_en: { type: sequelize_1.DataTypes.DATE, allowNull: true },
    createdAt: { type: sequelize_1.DataTypes.DATE, allowNull: true },
    updatedAt: { type: sequelize_1.DataTypes.DATE, allowNull: true },
}, {
    sequelize: db_1.sequelize,
    tableName: "vendedor_perfil",
    freezeTableName: true,
    timestamps: true,
});
user_model_1.User.hasOne(VendedorPerfil, {
    foreignKey: "user_id",
    as: "perfil",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
});
VendedorPerfil.belongsTo(user_model_1.User, {
    foreignKey: "user_id",
    as: "user",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
});
