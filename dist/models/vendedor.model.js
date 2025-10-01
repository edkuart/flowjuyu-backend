"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Vendedor = void 0;
// src/models/vendedor.model.ts
const sequelize_1 = require("sequelize");
const db_1 = require("../config/db");
class Vendedor extends sequelize_1.Model {
}
exports.Vendedor = Vendedor;
Vendedor.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    nombreComercio: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
    },
    direccion: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
    },
    nit: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    logoUrl: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
    },
}, {
    sequelize: db_1.sequelize,
    modelName: "Vendedor",
    tableName: "vendedores",
    timestamps: false,
});
