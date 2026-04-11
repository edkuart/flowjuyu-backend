/**
 * src/services/whatsappOnboarding.service.ts
 *
 * Outbound WhatsApp messages for the seller onboarding flow.
 *
 * Builds on the existing whatsappOutbound.service.ts — does NOT duplicate
 * the sending logic. Adds:
 *   - Phone resolution (looks up whatsapp_linked_identities)
 *   - Per-seller per-message-type rate limiting (in-memory, max 1/hour)
 *   - Three named message functions: sendWelcome, sendProductSubmitted,
 *     sendProductViewed
 *
 * All functions are fire-and-forget: they log errors but never throw,
 * so a WhatsApp failure never breaks the caller's request.
 */

import { sendTextMessage } from './integrations/whatsapp/whatsappOutbound.service';
import WhatsappLinkedIdentity from '../models/WhatsappLinkedIdentity.model';

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Key: `${vendedorPerfilId}:${messageType}`  Value: timestamp of last send

const _lastSent = new Map<string, number>();
const ONE_HOUR_MS = 60 * 60 * 1_000;

function _isRateLimited(vendedorPerfilId: number, messageType: string): boolean {
  const key  = `${vendedorPerfilId}:${messageType}`;
  const last = _lastSent.get(key);
  return last !== undefined && Date.now() - last < ONE_HOUR_MS;
}

function _markSent(vendedorPerfilId: number, messageType: string): void {
  _lastSent.set(`${vendedorPerfilId}:${messageType}`, Date.now());
}

// ── Phone resolution ──────────────────────────────────────────────────────────

async function _getPhone(vendedorPerfilId: number): Promise<string | null> {
  const identity = await WhatsappLinkedIdentity.findOne({
    where: { seller_user_id: vendedorPerfilId, status: 'active' },
    attributes: ['phone_e164'],
  });
  return identity?.phone_e164 ?? null;
}

// ── Internal send wrapper ─────────────────────────────────────────────────────

async function _send(
  vendedorPerfilId: number,
  messageType: string,
  text: string,
): Promise<void> {
  if (_isRateLimited(vendedorPerfilId, messageType)) {
    console.log(`[whatsappOnboarding] rate-limited ${messageType} for perfil ${vendedorPerfilId}`);
    return;
  }

  const phone = await _getPhone(vendedorPerfilId);
  if (!phone) {
    console.log(`[whatsappOnboarding] no linked phone for perfil ${vendedorPerfilId} — skipping ${messageType}`);
    return;
  }

  try {
    await sendTextMessage(phone, text);
    _markSent(vendedorPerfilId, messageType);
    console.log(`[whatsappOnboarding] sent ${messageType} to perfil ${vendedorPerfilId}`);
  } catch (err) {
    // Never throw — WA failure must not break the caller
    console.error(`[whatsappOnboarding] failed to send ${messageType}`, err);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sent right after seller_created.
 * If the seller hasn't linked WhatsApp yet, this is a no-op (logged).
 */
export async function sendWelcome(
  vendedorPerfilId: number,
  nombre: string,
): Promise<void> {
  const text = [
    `¡Hola ${nombre}! 👋 Bienvenido/a a *Flowjuyu*.`,
    ``,
    `Aquí podrás publicar tus textiles para que compradores de todo Guatemala los encuentren.`,
    ``,
    `Entra a la app y sube tu primer producto para empezar. ¡Cualquier duda me escribes aquí! ✨`,
  ].join('\n');

  await _send(vendedorPerfilId, 'welcome', text);
}

/**
 * Sent after the seller submits their onboarding product draft.
 */
export async function sendProductSubmitted(
  vendedorPerfilId: number,
  nombre: string,
  productName: string,
): Promise<void> {
  const text = [
    `¡Muy bien, ${nombre}! 🎉`,
    ``,
    `Tu producto *"${productName}"* ya fue registrado en Flowjuyu.`,
    ``,
    `Estamos revisando tu perfil. Cuando esté aprobado, tu producto aparecerá publicado automáticamente y los compradores podrán encontrarlo.`,
    ``,
    `Mientras tanto puedes seguir completando tu tienda. 💪`,
  ].join('\n');

  await _send(vendedorPerfilId, 'product_submitted', text);
}

/**
 * Sent when a buyer views the seller's product for the first time (per hour).
 */
export async function sendProductViewed(
  vendedorPerfilId: number,
  nombre: string,
  productName: string,
): Promise<void> {
  const text = [
    `¡Buenas noticias, ${nombre}! 👀`,
    ``,
    `Alguien acaba de ver tu producto *"${productName}"* en Flowjuyu.`,
    ``,
    `Ten tu WhatsApp listo por si te contactan. ¡Suerte con la venta! 🛍️`,
  ].join('\n');

  await _send(vendedorPerfilId, 'product_viewed', text);
}
