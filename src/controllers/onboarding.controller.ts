/**
 * src/controllers/onboarding.controller.ts
 *
 * Endpoints:
 *   GET  /api/seller/onboarding/status        → getOnboardingStatus
 *   POST /api/seller/onboarding/product-draft → createOnboardingDraft
 *
 * Both require verifyToken(['seller']) — placed via seller.routes.ts
 * after the global seller middleware, so no extra auth needed here.
 *
 * createOnboardingDraft does NOT use requireActiveSeller because sellers
 * in estado_admin='inactivo' (pending KYC) must still be able to submit
 * their first product during onboarding.
 */

import type { Request, Response, RequestHandler } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { VendedorPerfil } from '../models/VendedorPerfil';
import ListingDraft from '../models/ListingDraft.model';
import WhatsappLinkedIdentity from '../models/WhatsappLinkedIdentity.model';
import supabase from '../lib/supabase';
import { emitEvent } from '../lib/onboardingEvents';
import { sequelize } from '../config/db';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getUserId(req: Request): number {
  return (req as any).user?.id as number;
}

async function getPerfil(userId: number) {
  return VendedorPerfil.findOne({ where: { user_id: userId } });
}

const COMPLETE_STATES = new Set(['FIRST_PRODUCT_PUBLISHED', 'ACTIVATED']);

/**
 * Returns the id (UUID string) of the seller's first real published product,
 * or null if none exists.
 * productos.vendedor_id = users.id (not vendedor_perfil.id).
 */
async function getFirstRealProductId(userId: number): Promise<string | null> {
  const [rows]: any = await sequelize.query(
    `SELECT id FROM productos WHERE vendedor_id = :uid ORDER BY "createdAt" ASC LIMIT 1`,
    { replacements: { uid: userId } },
  );
  return rows?.[0]?.id ?? null;
}

/**
 * Self-heals the onboarding state for sellers who published products via the
 * normal product flow (outside the onboarding wizard) or who were not
 * correctly backfilled by the initial migration.
 *
 * Advances to FIRST_PRODUCT_PUBLISHED when a real product exists but the
 * state is still in an incomplete stage. Sets first_product_id if missing so
 * that the existing checkActivation() path can fire on the next product view.
 */
async function healStateIfNeeded(
  perfil: NonNullable<Awaited<ReturnType<typeof getPerfil>>>,
  userId: number,
): Promise<void> {
  if (COMPLETE_STATES.has(perfil.onboarding_state ?? '')) return;

  const firstProductId = await getFirstRealProductId(userId);
  if (!firstProductId) return;

  console.log(
    `[onboarding] healing state for user ${userId}: ` +
    `${perfil.onboarding_state} → FIRST_PRODUCT_PUBLISHED (product ${firstProductId})`,
  );

  await perfil.update({
    onboarding_state: 'FIRST_PRODUCT_PUBLISHED',
    first_product_id: perfil.first_product_id ?? firstProductId,
  });
}

// ── GET /api/seller/onboarding/status ─────────────────────────────────────────

export const getOnboardingStatus: RequestHandler = async (req, res) => {
  try {
    const userId = getUserId(req);
    const perfil = await getPerfil(userId);

    if (!perfil) {
      res.status(404).json({ ok: false, message: 'Perfil de vendedor no encontrado' });
      return;
    }

    // Self-heal: sellers who published products outside the onboarding wizard
    // (or were not backfilled by the initial migration) are stuck in incomplete
    // states even though they already have real products. Detect and fix here.
    await healStateIfNeeded(perfil, userId);

    const waLinked = await WhatsappLinkedIdentity.findOne({
      where: { seller_user_id: userId, status: 'active' },
      attributes: ['id'],
    });

    // Re-read after potential mutation so response reflects current truth.
    const effectiveState  = perfil.onboarding_state ?? 'NEW_USER';
    const hasFirstProduct = !!(perfil.first_product_id);

    const checklist = {
      profile_completed:       !!(perfil.nombre_comercio && perfil.departamento),
      first_product_submitted: hasFirstProduct,
      profile_photo_uploaded:  !!(perfil.logo),
      whatsapp_linked:         !!(waLinked),
    };

    const completedCount = Object.values(checklist).filter(Boolean).length;
    const totalCount     = Object.keys(checklist).length;

    res.json({
      ok: true,
      onboarding_state:        effectiveState,
      activation_at:           perfil.activation_at ?? null,
      onboarding_completed_at: perfil.onboarding_completed_at ?? null,
      checklist,
      completion_percentage:   Math.round((completedCount / totalCount) * 100),
    });
  } catch (err) {
    console.error('[onboarding] getOnboardingStatus error', err);
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

// ── POST /api/seller/onboarding/product-draft ─────────────────────────────────

export const createOnboardingDraft: RequestHandler = async (req, res) => {
  try {
    const userId = getUserId(req);
    const perfil = await getPerfil(userId);

    if (!perfil) {
      res.status(404).json({ ok: false, message: 'Perfil de vendedor no encontrado' });
      return;
    }

    // Idempotency: one onboarding draft per seller
    if (perfil.first_product_id) {
      res.status(409).json({
        ok: false,
        message: 'Ya tienes un producto de onboarding registrado',
      });
      return;
    }

    // ── Validate body ─────────────────────────────────────────────────────────
    const nombre = typeof req.body.nombre === 'string' ? req.body.nombre.trim() : '';
    const price  = parseFloat(req.body.precio ?? '0');

    if (!nombre || nombre.length < 2) {
      res.status(400).json({ ok: false, message: 'El nombre del producto es obligatorio (mínimo 2 caracteres)' });
      return;
    }
    if (isNaN(price) || price <= 0) {
      res.status(400).json({ ok: false, message: 'El precio debe ser mayor a 0' });
      return;
    }

    // ── Upload image if provided ──────────────────────────────────────────────
    let imageUrl: string | null = null;
    const file = (req as any).file as Express.Multer.File | undefined;

    if (file) {
      const ext      = file.originalname.split('.').pop() ?? 'jpg';
      const path     = `onboarding/${userId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('productos')
        .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });

      if (error) {
        console.error('[onboarding] image upload failed', error);
        // Non-fatal: continue without image
      } else {
        const { data } = supabase.storage.from('productos').getPublicUrl(path);
        imageUrl = data.publicUrl;
      }
    }

    // ── Create ListingDraft ───────────────────────────────────────────────────
    const draft = await ListingDraft.create({
      session_id:         uuidv4(),
      seller_user_id:     userId,
      suggested_title:    nombre,
      suggested_description: null,
      price,
      stock:              null,
      // NOTE:
      // images_json was removed from ListingDraft.
      // Images are now handled via separate storage (producto_imagenes).
      // Do not reintroduce this field here.
      measures_text:      null,
      clase_id:           null,
      categoria_id:       null,
      categoria_custom:   null,
      status:             'ready_to_publish',
      published_product_id: null,
      // is_onboarding_draft is set via raw SQL column — Sequelize doesn't know
      // about it yet until after the migration runs, so we use a direct query.
    });

    // Mark as onboarding draft via raw query — sequelize instance is imported directly
    await sequelize.query(
      'UPDATE listing_drafts SET is_onboarding_draft = true WHERE id = :id',
      { replacements: { id: draft.id } }
    );

    // Store the draft id as first_product_id (a product UUID will replace it
    // when admin approves KYC and the draft is converted to a real product)
    await perfil.update({
      first_product_id:    draft.id,
      onboarding_state:    'FIRST_PRODUCT_PUBLISHED',
    });

    // ── Fire event (deferred, non-blocking) ───────────────────────────────────
    emitEvent('product_published', {
      userId,
      vendedorPerfilId: perfil.id,
      productId:        draft.id,
      productName:      nombre,
    });

    res.status(201).json({
      ok:      true,
      draftId: draft.id,
    });
  } catch (err) {
    console.error('[onboarding] createOnboardingDraft error', err);
    res.status(500).json({ ok: false, message: 'Error interno al guardar el producto' });
  }
};

// ── checkActivation ───────────────────────────────────────────────────────────
//
// Called from the product_viewed event listener.
// A seller is ACTIVATED when they have a first_product_id AND at least one
// product_viewed event was emitted (this function is called on that event).

export async function checkActivation(
  userId: number,
  vendedorPerfilId: number,
): Promise<void> {
  const perfil = await VendedorPerfil.findByPk(vendedorPerfilId);
  if (!perfil) return;
  if (perfil.onboarding_state === 'ACTIVATED') return;

  // first_product_id may be null for sellers who published via the normal
  // product flow before onboarding was introduced. Fall back to querying
  // the products table so we don't block activation for those sellers.
  const resolvedProductId =
    perfil.first_product_id ?? (await getFirstRealProductId(userId));

  if (!resolvedProductId) return;

  await perfil.update({
    onboarding_state:        'ACTIVATED',
    first_product_id:        resolvedProductId,
    activation_at:           new Date(),
    onboarding_completed_at: new Date(),
  });

  console.log(`[onboarding] seller ${userId} (perfil ${vendedorPerfilId}) ACTIVATED`);
}
