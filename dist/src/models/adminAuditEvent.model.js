"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const db_1 = require("../config/db");
class AdminAuditEvent extends sequelize_1.Model {
}
AdminAuditEvent.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    entity_type: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
    },
    entity_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
    },
    action: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
    },
    performed_by: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
    },
    comment: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    metadata: {
        type: sequelize_1.DataTypes.JSONB,
        allowNull: true,
    },
}, {
    sequelize: db_1.sequelize,
    tableName: "admin_audit_events",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
});
exports.default = AdminAuditEvent;
