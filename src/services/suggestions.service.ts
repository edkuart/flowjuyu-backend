// src/services/suggestions.service.ts
//
// Rule-based smart suggestions — no ML, no external services.
//
// Two triggers:
//   1. notifySimilarProducts   — fires when a user adds a favorite
//   2. notifyNewProductInCategory — fires when a seller publishes a product
//
// Both functions are fully fire-and-forget: they swallow all errors and never
// throw, so a bug here can never crash the calling request.

import { sequelize } from "../config/db";
import { QueryTypes } from "sequelize";
import { createNotification } from "../utils/notifications";

// Only one suggestion notification per user per this many hours
const SUGGESTION_COOLDOWN_HOURS = 24;

// ─── Helper: cooldown check ────────────────────────────────────────────────
//
// Returns true if the user already received a "suggestion" notification
// within the cooldown window — prevents spam.

async function isOnCooldown(userId: number): Promise<boolean> {
  const [row] = await sequelize.query<{ id: string }>(
    `
    SELECT id FROM notifications
    WHERE user_id  = :userId
      AND type     = 'suggestion'
      AND created_at > NOW() - INTERVAL '${SUGGESTION_COOLDOWN_HOURS} hours'
    LIMIT 1
    `,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  return !!row;
}

// ─── Trigger 1: similar products after a favorite ─────────────────────────
//
// Called by favorites.controller → addFavorite after a successful INSERT.
//
// Logic:
//   - Get the category of the favorited product
//   - Skip if the user is on cooldown
//   - Skip if no unfavorited products exist in the same category
//   - Otherwise send one "suggestion" notification linking to a category search

export async function notifySimilarProducts(
  userId: number,
  productId: string
): Promise<void> {
  try {
    // 1. Resolve the product's category
    const [product] = await sequelize.query<{
      categoria_id: number | null;
    }>(
      `
      SELECT categoria_id
      FROM productos
      WHERE id = :productId
        AND categoria_id IS NOT NULL
      LIMIT 1
      `,
      { replacements: { productId }, type: QueryTypes.SELECT }
    );

    if (!product?.categoria_id) return;
    const { categoria_id } = product;

    // 2. Cooldown guard
    if (await isOnCooldown(userId)) return;

    // 3. Confirm unfavorited alternatives exist in this category
    const [check] = await sequelize.query<{ total: string }>(
      `
      SELECT COUNT(*) AS total
      FROM productos p
      WHERE p.categoria_id = :categoria_id
        AND p.id           != :productId
        AND p.activo       = true
        AND p.stock        > 0
        AND p.id NOT IN (
          SELECT product_id
          FROM   favorites
          WHERE  user_id    = :userId
            AND  product_id IS NOT NULL
        )
      `,
      {
        replacements: { categoria_id, productId, userId },
        type: QueryTypes.SELECT,
      }
    );

    if (!check || Number(check.total) === 0) return;

    // 4. Send one suggestion notification
    await createNotification(
      userId,
      "suggestion",
      "Te puede interesar",
      "Descubrimos piezas similares a las que guardaste.",
      `/search?category=${categoria_id}`
    );
  } catch {
    // Non-critical — never surface to the caller
  }
}

// ─── Trigger 2: new product in a user's favourite category ────────────────
//
// Called by product.controller → createProduct after t.commit().
//
// Logic:
//   - Find users who have favorited at least one product in this category
//   - Exclude the seller who just published (they own it)
//   - Exclude users already on cooldown (checked per-user to avoid bulk spam)
//   - Notify up to MAX_NOTIF_USERS users, one notification each

const MAX_NOTIF_USERS = 100;

export async function notifyNewProductInCategory(
  productId: string,
  categoryId: number | null,
  sellerUserId: number
): Promise<void> {
  if (!categoryId) return;

  try {
    // 1. Find interested users (favorited something in same category)
    //    Exclude the seller and users already on cooldown
    const users = await sequelize.query<{ user_id: number }>(
      `
      SELECT DISTINCT f.user_id
      FROM   favorites f
      JOIN   productos p ON p.id = f.product_id
      WHERE  p.categoria_id   = :categoryId
        AND  f.user_id        != :sellerUserId
        AND  f.product_id     IS NOT NULL
        AND  f.user_id NOT IN (
               SELECT user_id
               FROM   notifications
               WHERE  type       = 'suggestion'
                 AND  created_at > NOW() - INTERVAL '${SUGGESTION_COOLDOWN_HOURS} hours'
             )
      LIMIT  :limit
      `,
      {
        replacements: { categoryId, sellerUserId, limit: MAX_NOTIF_USERS },
        type: QueryTypes.SELECT,
      }
    );

    if (users.length === 0) return;

    const link = `/search?category=${categoryId}`;

    // 2. Fire notifications concurrently — each call is already safe/swallowing
    await Promise.allSettled(
      users.map(({ user_id }) =>
        createNotification(
          user_id,
          "suggestion",
          "Nuevas piezas disponibles",
          "Hay nuevos productos en tus categorías favoritas.",
          link
        )
      )
    );
  } catch {
    // Non-critical — never surface to the caller
  }
}
