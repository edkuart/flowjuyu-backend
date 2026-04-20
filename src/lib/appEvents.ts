/**
 * src/lib/appEvents.ts
 *
 * App-wide event bus for domain events (notifications, engagement, analytics).
 *
 * Pattern: identical to onboardingEvents.ts — Node.js EventEmitter, no external
 * dependencies, fire-and-forget via setImmediate so the HTTP response is sent
 * before listeners run.
 *
 * To add a new listener:
 *   import { appBus } from '../lib/appEvents';
 *   appBus.on('review.created', async (payload) => { ... });
 *
 * Register all listeners ONCE by importing appEventListeners in src/index.ts.
 */

import { EventEmitter } from 'events';

// ── Payload types ──────────────────────────────────────────────────────────────

export interface FavoriteAddedPayload {
  userId: number;         // buyer who favorited
  productId: string;      // product UUID
  sellerId: number | null;
}

export interface ReviewCreatedPayload {
  buyerId: number;
  sellerId: number;
  productId: string;
  rating: number;
}

export interface ProductCreatedPayload {
  sellerId: number;
  productId: string;
  productName: string;
}

export interface BillingInvoiceGeneratedPayload {
  sellerId: number;
  invoiceNumber: string;
  amount: number;
  currency: string;
}

export interface BillingSubscriptionExpiredPayload {
  sellerId: number;
  gracePeriodEnd?: string;
}

export interface BillingRenewalOverduePayload {
  sellerId: number;
  expiredAt: string;
  gracePeriodEnd: string;
}

export interface SellerFollowedPayload {
  followerUserId: number;  // buyer who followed
  sellerUserId:   number;  // seller who was followed
}

export interface SellerUnfollowedPayload {
  followerUserId: number;
  sellerUserId:   number;
}

export interface SellerWentLivePayload {
  sellerId:  number;
  startedAt: Date;
}

// ── Event map ──────────────────────────────────────────────────────────────────

export type AppEventMap = {
  'favorite.added':               FavoriteAddedPayload;
  'review.created':               ReviewCreatedPayload;
  'product.created':              ProductCreatedPayload;
  'billing.invoice_generated':    BillingInvoiceGeneratedPayload;
  'billing.subscription_expired': BillingSubscriptionExpiredPayload;
  'billing.renewal_overdue':      BillingRenewalOverduePayload;
  'seller.followed':              SellerFollowedPayload;
  'seller.unfollowed':            SellerUnfollowedPayload;
  'seller.went_live':             SellerWentLivePayload;
};

// ── Bus ────────────────────────────────────────────────────────────────────────

const bus = new EventEmitter();
bus.setMaxListeners(20);

export const appBus = bus;

// ── emitAppEvent ───────────────────────────────────────────────────────────────
//
// Defers execution with setImmediate so the calling request path completes
// before any listener runs. Errors inside the emit() call itself are caught
// here; errors inside individual async listeners are caught in each listener.

export function emitAppEvent<K extends keyof AppEventMap>(
  eventName: K,
  payload: AppEventMap[K],
): void {
  setImmediate(() => {
    try {
      bus.emit(eventName, payload);
    } catch (err) {
      console.error(`[appEvent] uncaught in emit(${eventName})`, err);
    }
  });
}
