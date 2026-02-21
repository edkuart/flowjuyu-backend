"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const db_1 = require("../config/db");
class Address extends sequelize_1.Model {
}
Address.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    user_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
    },
    nombre_receptor: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
    },
    apellido_receptor: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
    },
    telefono: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
    },
    departamento: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
    },
    municipio: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
    },
    direccion_exacta: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
    },
    referencia: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
}, {
    sequelize: db_1.sequelize,
    modelName: "Address",
    freezeTableName: true,
    tableName: "addresses",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
});
exports.default = Address;
