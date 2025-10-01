"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const sequelize_1 = require("sequelize");
const db_1 = require("../config/db");
class User extends sequelize_1.Model {
}
exports.User = User;
User.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    nombre: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
    },
    correo: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
        set(value) {
            this.setDataValue("correo", value?.toLowerCase().trim());
        },
    },
    password: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
        field: "contraseña",
    },
    rol: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
        defaultValue: "comprador",
    },
    telefono: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true,
    },
    direccion: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true,
    },
    createdAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        field: "createdAt",
        defaultValue: sequelize_1.DataTypes.NOW,
    },
    updatedAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        field: "updatedAt",
        defaultValue: sequelize_1.DataTypes.NOW,
    },
}, {
    sequelize: db_1.sequelize,
    modelName: "User",
    tableName: "users",
    timestamps: true,
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    underscored: true,
});
