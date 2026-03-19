// src/utils/notifications.ts
// Helper to create a notification for any user from anywhere in the backend.
//
// Usage:
//   import { createNotification } from "../utils/notifications";
//   await createNotification(userId, "order", "Pedido confirmado", "Tu pedido #123 fue recibido.", "/buyer/orders/123");

import { sequelize } from "../config/db";

export async function createNotification(
  userId: number,
  type: string,
  title: string,
  message: string,
  link?: string
): Promise<void> {
  try {
    await sequelize.query(
      `
      INSERT INTO notifications (user_id, type, title, message, link)
      VALUES (:userId, :type, :title, :message, :link)
      `,
      {
        replacements: {
          userId,
          type,
          title,
          message,
          link: link ?? null,
        },
      }
    );
  } catch (err) {
    // Never let a notification failure crash the calling request
    console.error("createNotification error:", err);
  }
}
