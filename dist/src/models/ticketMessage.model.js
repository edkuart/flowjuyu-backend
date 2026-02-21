"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TicketMessage = void 0;
const sequelize_1 = require("sequelize");
const db_1 = require("../config/db");
class TicketMessage extends sequelize_1.Model {
}
exports.TicketMessage = TicketMessage;
TicketMessage.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    ticket_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
    },
    sender_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
    },
    mensaje: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
    },
    es_admin: {
        type: sequelize_1.DataTypes.BOOLEAN,
        defaultValue: false,
    },
    createdAt: sequelize_1.DataTypes.DATE,
    updatedAt: sequelize_1.DataTypes.DATE,
}, {
    sequelize: db_1.sequelize,
    tableName: "ticket_messages",
    timestamps: true,
});
