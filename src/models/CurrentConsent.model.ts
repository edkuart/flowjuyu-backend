import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from "sequelize";
import { sequelize } from "../config/db";

class CurrentConsent extends Model<
  InferAttributes<CurrentConsent>,
  InferCreationAttributes<CurrentConsent, { omit: "updated_at" }>
> {
  declare user_id:                           number;
  declare accepted_terms_version_id:         string | null;
  declare accepted_privacy_version_id:       string | null;
  declare needs_reacceptance_terms:          boolean;
  declare needs_reacceptance_privacy:        boolean;
  declare updated_at:                        CreationOptional<Date>;
}

CurrentConsent.init(
  {
    user_id: {
      type:       DataTypes.INTEGER,
      allowNull:  false,
      primaryKey: true,
      references: { model: "users", key: "id" },
      onDelete:   "CASCADE",
      onUpdate:   "CASCADE",
    },
    accepted_terms_version_id: {
      type:       DataTypes.UUID,
      allowNull:  true,
      references: { model: "policy_versions", key: "id" },
      onDelete:   "SET NULL",
      onUpdate:   "CASCADE",
    },
    accepted_privacy_version_id: {
      type:       DataTypes.UUID,
      allowNull:  true,
      references: { model: "policy_versions", key: "id" },
      onDelete:   "SET NULL",
      onUpdate:   "CASCADE",
    },
    needs_reacceptance_terms: {
      type:         DataTypes.BOOLEAN,
      allowNull:    false,
      defaultValue: false,
    },
    needs_reacceptance_privacy: {
      type:         DataTypes.BOOLEAN,
      allowNull:    false,
      defaultValue: false,
    },
    updated_at: {
      type:         DataTypes.DATE,
      allowNull:    false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName:  "current_consents",
    timestamps: false,
  },
);

export default CurrentConsent;
