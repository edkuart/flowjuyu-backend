import { DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional } from "sequelize";
import { sequelize } from "../config/db";

class AdminAuditEvent extends Model<
  InferAttributes<AdminAuditEvent, { omit: "created_at" }>,
  InferCreationAttributes<AdminAuditEvent, { omit: "created_at" }>
> {
  declare id:           CreationOptional<number>;
  declare entity_type:  string;
  declare entity_id:    number;
  declare action:       string;
  declare performed_by: number;
  declare comment:      CreationOptional<string | null>;
  declare metadata:     CreationOptional<object | null>;
  declare created_at:   CreationOptional<Date>;
}

AdminAuditEvent.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    entity_type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    entity_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    performed_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "admin_audit_events",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
  }
);

export default AdminAuditEvent;
