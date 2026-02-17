import { sequelize } from "../config/db";

export const logEvent = async ({
  type,
  user_id = null,
  product_id = null,
  seller_id = null,
  metadata = null,
}: {
  type: string;
  user_id?: number | null;
  product_id?: string | null;
  seller_id?: number | null;
  metadata?: any;
}) => {
  try {
    await sequelize.query(
      `
      INSERT INTO events (type, user_id, product_id, seller_id, metadata)
      VALUES (:type, :user_id, :product_id, :seller_id, :metadata)
      `,
      {
        replacements: {
          type,
          user_id,
          product_id,
          seller_id,
          metadata: metadata ? JSON.stringify(metadata) : null,
        },
      }
    );
  } catch (e) {
    console.error("Event log failed:", e);
  }
};