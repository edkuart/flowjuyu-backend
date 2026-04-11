// src/models/SellerEmailLog.model.ts
//
// Tracks which lifecycle emails have been sent to each seller.
// One row per (vendedor_perfil_id, email_type) pair — prevents duplicate sends
// across cron restarts or overlapping runs.
//
// No FK constraint on vendedor_perfil_id so this table can be created
// independently of migration order.

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/db';

export type SellerEmailType = 'welcome' | 'activation' | 'week1';

interface SellerEmailLogAttrs {
  id: number;
  vendedor_perfil_id: number;
  email_type: SellerEmailType;
  sent_at: Date;
}

type Creation = Optional<SellerEmailLogAttrs, 'id' | 'sent_at'>;

export class SellerEmailLog
  extends Model<SellerEmailLogAttrs, Creation>
  implements SellerEmailLogAttrs
{
  public id!: number;
  public vendedor_perfil_id!: number;
  public email_type!: SellerEmailType;
  public sent_at!: Date;
}

SellerEmailLog.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    vendedor_perfil_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    email_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    sent_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'seller_email_log',
    freezeTableName: true,
    timestamps: false,
    indexes: [
      // Unique guard — one email type per seller, ever
      { unique: true, fields: ['vendedor_perfil_id', 'email_type'] },
    ],
  },
);
