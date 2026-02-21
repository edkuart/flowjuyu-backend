"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ticket = void 0;
const sequelize_1 = require("sequelize");
const db_1 = require("../config/db");
class Ticket extends sequelize_1.Model {
}
exports.Ticket = Ticket;
Ticket.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    user_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
    },
    asunto: {
        type: sequelize_1.DataTypes.STRING(150),
        allowNull: false,
    },
    mensaje: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
    },
    estado: {
        type: sequelize_1.DataTypes.ENUM("abierto", "en_proceso", "esperando_usuario", "cerrado"),
        allowNull: false,
        defaultValue: "abierto",
    },
    tipo: {
        type: sequelize_1.DataTypes.ENUM("soporte", "verificacion", "incidencia", "otro"),
        allowNull: false,
        defaultValue: "soporte",
    },
    prioridad: {
        type: sequelize_1.DataTypes.ENUM("baja", "media", "alta"),
        allowNull: false,
        defaultValue: "media",
    },
    asignado_a: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: true,
    },
    closedAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
    },
    createdAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
    updatedAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
}, {
    sequelize: db_1.sequelize,
    tableName: "tickets",
    modelName: "Ticket",
    timestamps: true,
});
