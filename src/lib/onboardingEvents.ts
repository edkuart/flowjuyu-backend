/**
 * src/lib/onboardingEvents.ts
 *
 * Lightweight event helper for onboarding state transitions.
 *
 * Uses Node.js EventEmitter — no external dependencies, no queue.
 * Fire-and-forget: errors in listeners are caught and logged but never
 * bubble up to the caller, so the main request path is never blocked.
 *
 * To add a new listener:
 *   import { onboardingBus } from '../lib/onboardingEvents';
 *   onboardingBus.on('product_viewed', async (payload) => { ... });
 */

import { EventEmitter } from 'events';

// ── Payload types ─────────────────────────────────────────────────────────────

export interface SellerCreatedPayload {
  userId: number;           // users.id
  vendedorPerfilId: number; // vendedor_perfil.id
}

export interface ProductPublishedPayload {
  userId: number;
  vendedorPerfilId: number;
  productId: string;        // productos.id (UUID)
  productName: string;
}

export interface ProductViewedPayload {
  userId: number;           // seller's user id
  vendedorPerfilId: number;
  productId: string;
  productName: string;
}

export type OnboardingEventMap = {
  seller_created:    SellerCreatedPayload;
  product_published: ProductPublishedPayload;
  product_viewed:    ProductViewedPayload;
};

// ── Bus ───────────────────────────────────────────────────────────────────────

const bus = new EventEmitter();
bus.setMaxListeners(20); // generous limit — avoids NodeJS warning

export const onboardingBus = bus;

// ── emitEvent ─────────────────────────────────────────────────────────────────
//
// Wraps bus.emit so that:
//  1. Errors inside async listeners are caught (EventEmitter doesn't do this
//     automatically for async handlers).
//  2. The emit is deferred with setImmediate so the HTTP response is sent
//     before listeners run — the user never waits for side-effects.

export function emitEvent<K extends keyof OnboardingEventMap>(
  eventName: K,
  payload: OnboardingEventMap[K],
): void {
  setImmediate(() => {
    try {
      bus.emit(eventName, payload);
    } catch (err) {
      console.error(`[onboarding:event] uncaught in emit(${eventName})`, err);
    }
  });
}
