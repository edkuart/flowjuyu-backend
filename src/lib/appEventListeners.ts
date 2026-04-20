/**
 * src/lib/appEventListeners.ts
 *
 * Registers all notification handlers on the app-wide event bus.
 * Import this file ONCE in src/index.ts — side-effects only.
 *
 * This is the NotificationEngine: it translates domain events into DB rows
 * via createNotification(). Adding a new notification type = adding a listener
 * block here, no controller changes required.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/db';
import { appBus } from './appEvents';
import type {
  FavoriteAddedPayload,
  ReviewCreatedPayload,
  ProductCreatedPayload,
  SellerFollowedPayload,
  SellerWentLivePayload,
} from './appEvents';
import { createNotification } from '../utils/notifications';
import { pushToUser, type SsePushPayload } from './sseRegistry';

const DISCOVERY_COOLDOWN_HOURS = 24;

// ── favorite.added ─────────────────────────────────────────────────────────────

appBus.on('favorite.added', async (payload: FavoriteAddedPayload) => {
  try {
    await createNotification(
      payload.userId,
      'favorite',
      'Guardaste una pieza',
      'La encontrarás en tus favoritos.',
      '/buyer/favorites',
      {
        actorId:     payload.userId,
        actorType:   'buyer',
        subjectType: 'product',
        subjectId:   payload.productId,
        isFeedItem:  false,
        metadata: {
          productId: payload.productId,
          sellerId:  payload.sellerId,
        },
      },
    );
  } catch (err) {
    console.error('[appEventListeners] favorite.added error', err);
  }
});

// ── review.created ─────────────────────────────────────────────────────────────
// One event → two notifications (buyer confirmation + seller alert).
// Each in its own try/catch: one failure never blocks the other.
//
// is_feed_item logic:
//   buyer row  → true  (appears in buyer's own activity feed)
//   seller row → false (private alert, not shown in public feed)

appBus.on('review.created', async (payload: ReviewCreatedPayload) => {
  const stars = payload.rating === 1 ? 'estrella' : 'estrellas';

  // Buyer: confirms their own action
  try {
    await createNotification(
      payload.buyerId,
      'review',
      'Dejaste una reseña',
      'Tu opinión ayuda a otros compradores.',
      `/product/${payload.productId}`,
      {
        actorId:     payload.buyerId,
        actorType:   'buyer',
        subjectType: 'product',
        subjectId:   payload.productId,
        isFeedItem:  true,
        metadata: {
          rating:    payload.rating,
          productId: payload.productId,
          sellerId:  payload.sellerId,
        },
      },
    );
  } catch (err) {
    console.error('[appEventListeners] review.created buyer notification error', err);
  }

  // Seller: receives alert about the review
  try {
    await createNotification(
      payload.sellerId,
      'review',
      'Nueva reseña en tu producto',
      `Un comprador calificó tu pieza con ${payload.rating} ${stars}.`,
      '/seller/products',
      {
        actorId:     payload.buyerId,
        actorType:   'buyer',
        subjectType: 'product',
        subjectId:   payload.productId,
        isFeedItem:  false,
        metadata: {
          rating:    payload.rating,
          productId: payload.productId,
        },
      },
    );
  } catch (err) {
    console.error('[appEventListeners] review.created seller notification error', err);
  }
});

// ── product.created ────────────────────────────────────────────────────────────
// No notification today — event is captured for Phase 2 when the follow system
// exists and we need to notify followers of the seller.

appBus.on('product.created', async (payload: ProductCreatedPayload) => {
  try {
    // ── 1. Cooldown: max one discovery notification per seller per 24 h ───────
    // Prevents notification spam when a seller activates several products in a row.
    const [cooldown] = await sequelize.query<{ id: string }>(
      `
      SELECT id FROM notifications
      WHERE  actor_id   = :sellerId
        AND  type       = 'discovery'
        AND  created_at > NOW() - INTERVAL '${DISCOVERY_COOLDOWN_HOURS} hours'
      LIMIT 1
      `,
      { replacements: { sellerId: payload.sellerId }, type: QueryTypes.SELECT }
    );

    if (cooldown) return;

    // ── 2. Batch INSERT SELECT — one query, N notifications ───────────────────
    // Selects all followers with notifications enabled and inserts one row each.
    // RETURNING gives us the full rows to push via SSE without a second query.
    const title    = 'Nueva pieza disponible';
    const message  = `"${payload.productName}" ya está en Flowjuyu.`;
    const link     = `/product/${payload.productId}`;
    const metadata = JSON.stringify({
      productId:   payload.productId,
      productName: payload.productName,
      sellerId:    payload.sellerId,
    });

    const insertedRows = await sequelize.query<SsePushPayload & { user_id: number }>(
      `
      INSERT INTO notifications (
        user_id, type, title, message, link,
        actor_id, actor_type, subject_type, subject_id,
        is_feed_item, channel, metadata
      )
      SELECT
        sf.follower_user_id,
        'discovery',
        :title,
        :message,
        :link,
        :sellerId,
        'seller',
        'product',
        :productId,
        true,
        'ui',
        :metadata::jsonb
      FROM seller_follows sf
      WHERE sf.seller_user_id        = :sellerId
        AND sf.notifications_enabled = true
      RETURNING
        user_id, id, type, title, message, link, is_read, created_at,
        metadata, actor_id, actor_type, subject_type, subject_id,
        is_feed_item, channel
      `,
      {
        replacements: {
          title, message, link, metadata,
          sellerId:  payload.sellerId,
          productId: payload.productId,
        },
        type: QueryTypes.SELECT,
      }
    );

    if (insertedRows.length === 0) return;

    // ── 3. SSE push — in-memory loop, no DB ──────────────────────────────────
    // pushToUser is a no-op for users without an open connection.
    for (const row of insertedRows) {
      pushToUser(row.user_id, row);
    }

    console.log(
      `[product.created] fan-out: ${insertedRows.length} notifications → seller ${payload.sellerId}`
    );
  } catch (err) {
    console.error('[appEventListeners] product.created fan-out error', err);
  }
});

// ── seller.followed ────────────────────────────────────────────────────────────
// Notify the seller that they have a new follower.

appBus.on('seller.followed', async (payload: SellerFollowedPayload) => {
  try {
    await createNotification(
      payload.sellerUserId,
      'social',
      'Tienes un nuevo seguidor',
      'Un comprador empezó a seguirte.',
      '/seller/dashboard',
      {
        actorId:     payload.followerUserId,
        actorType:   'buyer',
        subjectType: 'seller',
        subjectId:   String(payload.sellerUserId),
        isFeedItem:  false,
      },
    );
  } catch (err) {
    console.error('[appEventListeners] seller.followed error', err);
  }
});

// ── seller.went_live ───────────────────────────────────────────────────────────
// Fan-out: notify every follower who has notifications_enabled = true.
// The JOIN with vendedor_perfil serves two purposes:
//   1. fetches nombre_comercio for the notification title in one query
//   2. returns 0 rows if the seller profile doesn't exist → silent exit

appBus.on('seller.went_live', async (payload: SellerWentLivePayload) => {
  try {
    const followers = await sequelize.query<{
      follower_user_id: number;
      nombre_comercio:  string;
    }>(
      `
      SELECT sf.follower_user_id, vp.nombre_comercio
      FROM   seller_follows  sf
      JOIN   vendedor_perfil vp ON vp.user_id = sf.seller_user_id
      WHERE  sf.seller_user_id        = :sellerId
        AND  sf.notifications_enabled = true
      `,
      { replacements: { sellerId: payload.sellerId }, type: QueryTypes.SELECT }
    );

    if (followers.length === 0) return;

    const nombreComercio = followers[0].nombre_comercio;
    const link           = `/store/${payload.sellerId}`;

    for (const row of followers) {
      try {
        await createNotification(
          row.follower_user_id,
          'live',
          `${nombreComercio} está en vivo`,
          'Está mostrando productos en este momento.',
          link,
          {
            actorId:     payload.sellerId,
            actorType:   'seller',
            subjectType: 'seller',
            subjectId:   String(payload.sellerId),
            isFeedItem:  true,
            channel:     'ui',
          },
        );
      } catch (err) {
        console.error('[appEventListeners] seller.went_live notification error for follower', row.follower_user_id, err);
      }
    }

    console.log(`[seller.went_live] fan-out: ${followers.length} notifications → seller ${payload.sellerId}`);
  } catch (err) {
    console.error('[appEventListeners] seller.went_live error', err);
  }
});
