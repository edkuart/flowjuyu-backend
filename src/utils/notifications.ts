// src/utils/notifications.ts
// Inserts a notification row and immediately pushes it to any open SSE
// connections for that user.
//
// Backward-compatible: all existing call sites work unchanged (link and opts
// are optional). The return type stays void — callers never need the row.
//
// Usage (existing — unchanged):
//   await createNotification(userId, "billing", "Factura generada", "...");
//
// Usage (with engagement metadata):
//   await createNotification(userId, "review", "Nueva reseña", "...", "/seller/products", {
//     actorId: buyerId, actorType: "buyer",
//     subjectType: "product", subjectId: productId,
//     isFeedItem: true,
//     metadata: { rating: 5, productId },
//   });

import { QueryTypes } from "sequelize";
import { sequelize } from "../config/db";
import { pushToUser, type SsePushPayload } from "../lib/sseRegistry";

export interface NotificationOpts {
  metadata?:    Record<string, unknown>;
  actorId?:     number;
  actorType?:   "buyer" | "seller" | "system";
  subjectType?: string;
  subjectId?:   string;
  isFeedItem?:  boolean;
  channel?:     "ui" | "email" | "whatsapp";
}

export async function createNotification(
  userId: number,
  type: string,
  title: string,
  message: string,
  link?: string,
  opts?: NotificationOpts,
): Promise<void> {
  try {
    const rows = await sequelize.query<SsePushPayload>(
      `
      INSERT INTO notifications (
        user_id, type, title, message, link,
        metadata, actor_id, actor_type, subject_type, subject_id,
        is_feed_item, channel
      ) VALUES (
        :userId, :type, :title, :message, :link,
        :metadata, :actorId, :actorType, :subjectType, :subjectId,
        :isFeedItem, :channel
      )
      RETURNING
        id, type, title, message, link, is_read, created_at,
        metadata, actor_id, actor_type, subject_type, subject_id,
        is_feed_item, channel
      `,
      {
        replacements: {
          userId,
          type,
          title,
          message,
          link:        link ?? null,
          metadata:    opts?.metadata    != null ? JSON.stringify(opts.metadata) : null,
          actorId:     opts?.actorId     ?? null,
          actorType:   opts?.actorType   ?? null,
          subjectType: opts?.subjectType ?? null,
          subjectId:   opts?.subjectId   ?? null,
          isFeedItem:  opts?.isFeedItem  ?? false,
          channel:     opts?.channel     ?? "ui",
        },
        type: QueryTypes.SELECT,
      }
    );

    const inserted = rows[0];
    if (inserted) {
      // Push to any open SSE connections for this user — no-op if none.
      pushToUser(userId, inserted);
    }
  } catch (err) {
    // Never let a notification failure crash the calling request
    console.error("createNotification error:", err);
  }
}
