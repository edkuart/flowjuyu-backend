"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const db_1 = require("../config/db");
class Product extends sequelize_1.Model {
}
Product.init({
    id: {
        type: sequelize_1.DataTypes.UUID,
        defaultValue: sequelize_1.DataTypes.UUIDV4,
        primaryKey: true,
    },
    vendedor_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
    },
    nombre: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
    },
    descripcion: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    precio: {
        type: sequelize_1.DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    stock: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 0,
    },
    categoria_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: true,
    },
    clase_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
    },
    tela_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: true,
    },
    region_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: true,
    },
    accesorio_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: true,
    },
    imagen_url: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true,
    },
    activo: {
        type: sequelize_1.DataTypes.BOOLEAN,
        defaultValue: true,
    },
    categoria_custom: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true,
    },
    region_custom: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true,
    },
    tela_custom: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true,
    },
    accesorio_custom: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true,
    },
    created_at: sequelize_1.DataTypes.DATE,
    updated_at: sequelize_1.DataTypes.DATE,
}, {
    sequelize: db_1.sequelize,
    modelName: "Producto",
    tableName: "productos",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
});
exports.default = Product;
