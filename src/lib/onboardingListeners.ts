/**
 * src/lib/onboardingListeners.ts
 *
 * Registers all listeners on the onboarding event bus.
 * Import this file ONCE in src/index.ts — side-effects only.
 *
 * Each listener is async but errors are caught internally so they
 * never crash the process.
 */

import { onboardingBus } from './onboardingEvents';
import type {
  SellerCreatedPayload,
  ProductPublishedPayload,
  ProductViewedPayload,
} from './onboardingEvents';
import { VendedorPerfil } from '../models/VendedorPerfil';
import { checkActivation } from '../controllers/onboarding.controller';
import {
  sendWelcome,
  sendProductSubmitted,
  sendProductViewed,
} from '../services/whatsappOnboarding.service';

// ── seller_created ────────────────────────────────────────────────────────────
// Advance state NEW_USER → SELLER_REGISTERED and send WhatsApp welcome.

onboardingBus.on('seller_created', async (payload: SellerCreatedPayload) => {
  try {
    await VendedorPerfil.update(
      { onboarding_state: 'SELLER_REGISTERED' },
      {
        where: {
          id:               payload.vendedorPerfilId,
          onboarding_state: 'NEW_USER',
        },
      }
    );

    const perfil = await VendedorPerfil.findByPk(payload.vendedorPerfilId, {
      attributes: ['nombre'],
    });
    if (perfil) {
      await sendWelcome(payload.vendedorPerfilId, perfil.nombre);
    }
  } catch (err) {
    console.error('[onboardingListeners] seller_created handler error', err);
  }
});

// ── product_published ─────────────────────────────────────────────────────────
// Send WhatsApp confirmation that the draft was submitted.

onboardingBus.on('product_published', async (payload: ProductPublishedPayload) => {
  try {
    const perfil = await VendedorPerfil.findByPk(payload.vendedorPerfilId, {
      attributes: ['nombre'],
    });
    if (perfil) {
      await sendProductSubmitted(
        payload.vendedorPerfilId,
        perfil.nombre,
        payload.productName,
      );
    }
  } catch (err) {
    console.error('[onboardingListeners] product_published handler error', err);
  }
});

// ── product_viewed ────────────────────────────────────────────────────────────
// Notify seller + attempt activation.

onboardingBus.on('product_viewed', async (payload: ProductViewedPayload) => {
  try {
    const perfil = await VendedorPerfil.findByPk(payload.vendedorPerfilId, {
      attributes: ['nombre', 'onboarding_state', 'first_product_id'],
    });
    if (perfil) {
      await sendProductViewed(
        payload.vendedorPerfilId,
        perfil.nombre,
        payload.productName,
      );
    }
    // Try to mark seller as ACTIVATED
    await checkActivation(payload.userId, payload.vendedorPerfilId);
  } catch (err) {
    console.error('[onboardingListeners] product_viewed handler error', err);
  }
});
