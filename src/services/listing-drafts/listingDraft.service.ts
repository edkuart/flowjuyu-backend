import ListingDraft from "../../models/ListingDraft.model";
import ConversationSession from "../../models/ConversationSession.model";
import { sequelize } from "../../config/db";
import { Transaction } from "sequelize";
import type { DraftPatch } from "./listingDraft.types";

export type ListingDraftImage = {
  source: "whatsapp";
  mediaId: string;
  mimeType: string | null;
  uploadedPublicUrl?: string | null;
  uploadedStoragePath?: string | null;
};

export type MissingDraftField =
  | "image"
  | "description"
  | "category"
  | "class"
  | "measures"
  | "price"
  | "stock";

export type VisionSuggestion = {
  probableProductType?: string;
  suggestedCategoryName?: string;
  suggestedClassName?: string;
  visibleAttributes?: string[];
  confidence?: number;
  notes?: string[];
  mappedCategoryId?: number | null;
  mappedCategoryName?: string | null;
  mappedClassId?: number | null;
  mappedClassName?: string | null;
};

export async function getOrCreateDraft(
  session: ConversationSession
): Promise<ListingDraft> {
  const [draft] = await ListingDraft.findOrCreate({
    where: { session_id: session.id },
    defaults: {
      session_id: session.id,
      seller_user_id: session.linked_seller_user_id ?? null,
      status: "collecting",
    },
  });

  if (
    session.linked_seller_user_id &&
    draft.seller_user_id !== session.linked_seller_user_id
  ) {
    await draft.update({ seller_user_id: session.linked_seller_user_id });
  }

  return draft;
}

export async function deleteListingDraftBySession(
  sessionId: string
): Promise<number> {
  const deleted = await ListingDraft.destroy({
    where: { session_id: sessionId },
  });

  console.log(
    `[conversation][draft.delete] session=${sessionId} deleted=${deleted}`
  );

  return deleted;
}

export async function updateDraft(
  draft: ListingDraft,
  partialData: DraftPatch,
  context?: { waMessageId?: string }
): Promise<ListingDraft> {
  return updateDraftById(draft.id, partialData, context);
}

// Mirrors the format rule on productos.seller_sku and the validation in
// product.controller.ts — keep these three in sync if the rule changes.
const SELLER_SKU_RE = /^[A-Za-z0-9\-_]{1,100}$/;

function validateDraftPatch(partialData: DraftPatch): void {
  if (partialData.price != null && Number(partialData.price) <= 0) {
    throw new Error("Draft price must be greater than zero");
  }

  if (partialData.stock != null && Number(partialData.stock) <= 0) {
    throw new Error("Draft stock must be greater than zero");
  }

  if (partialData.seller_sku != null && !SELLER_SKU_RE.test(partialData.seller_sku)) {
    throw new Error(
      "Draft seller_sku: only letters, digits, hyphens (-) and underscores (_) allowed, max 100 chars"
    );
  }
}

export async function getDraftForUpdate(
  draftId: string,
  transaction: Transaction
): Promise<ListingDraft> {
  const draft = await ListingDraft.findByPk(draftId, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!draft) {
    throw new Error(`Draft not found: ${draftId}`);
  }

  return draft;
}

export async function updateDraftById(
  draftId: string,
  partialData: DraftPatch,
  context?: { waMessageId?: string }
): Promise<ListingDraft> {
  validateDraftPatch(partialData);

  return sequelize.transaction(async (transaction) => {
    const lockedDraft = await getDraftForUpdate(draftId, transaction);
    await lockedDraft.update(partialData, { transaction });

    console.log(
      `[conversation][draft.update] draft=${lockedDraft.id} session=${lockedDraft.session_id} wa_message_id=${context?.waMessageId ?? "n/a"} fields=${Object.keys(partialData).join(",")}`
    );

    return lockedDraft;
  });
}

export function isDraftAbandoned(draft: ListingDraft): boolean {
  return draft.status === "abandoned";
}

export async function appendImageToDraft(
  draftId: string,
  image: ListingDraftImage,
  context?: { waMessageId?: string }
): Promise<ListingDraft> {
  return sequelize.transaction(async (transaction) => {
    const lockedDraft = await getDraftForUpdate(draftId, transaction);
    const images = getDraftImages(lockedDraft);

    if (images.some((existing) => existing.mediaId === image.mediaId)) {
      return lockedDraft;
    }

    const nextImages = [...images, image];
    await lockedDraft.update({ images_json: nextImages }, { transaction });

    console.log(
      `[conversation][draft.image] draft=${lockedDraft.id} session=${lockedDraft.session_id} wa_message_id=${context?.waMessageId ?? "n/a"} total_images=${nextImages.length}`
    );

    return lockedDraft;
  });
}

export function hasDraftContent(draft: ListingDraft): boolean {
  if (isDraftAbandoned(draft)) {
    return false;
  }

  return Boolean(
    getDraftImages(draft).length > 0 ||
      draft.suggested_title?.trim() ||
      draft.suggested_description?.trim() ||
      draft.categoria_custom?.trim() ||
      draft.categoria_id ||
      draft.clase_id ||
      draft.measures_text?.trim() ||
      draft.price != null ||
      draft.stock != null
  );
}

export async function abandonDraft(
  draft: ListingDraft,
  context?: { waMessageId?: string }
): Promise<ListingDraft> {
  return updateDraft(draft, { status: "abandoned" }, context);
}

export async function resetDraftForNewListing(
  draft: ListingDraft,
  context?: { waMessageId?: string }
): Promise<ListingDraft> {
  return updateDraft(
    draft,
    {
      images_json: [],
      suggested_title: null,
      suggested_description: null,
      price: null,
      stock: null,
      measures_text: null,
      categoria_id: null,
      categoria_custom: null,
      clase_id: null,
      vision_suggestions_json: null,
      status: "collecting",
      published_product_id: null,
    },
    context
  );
}

export function getDraftImages(draft: ListingDraft): ListingDraftImage[] {
  return Array.isArray(draft.images_json)
    ? (draft.images_json as ListingDraftImage[])
    : [];
}

export function getVisionSuggestion(draft: ListingDraft): VisionSuggestion | null {
  const value = draft.vision_suggestions_json;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as VisionSuggestion;
}

/**
 * Returns the fields still missing before a NEW product can be published.
 *
 * ⚠️  CREATE FLOW ONLY.
 * All seven fields are mandatory here, including "measures" and "image".
 * Do NOT call this in the edit flow — use getMissingFieldsForEdit() instead.
 * Mixing the two causes optional/non-existent fields (e.g. measures_text,
 * which has no column in productos) to block the edit save permanently.
 */
export function getMissingFields(draft: ListingDraft): MissingDraftField[] {
  const missing: MissingDraftField[] = [];
  const images = getDraftImages(draft);

  if (images.length === 0) missing.push("image");
  if (!draft.suggested_description?.trim()) missing.push("description");
  if (!draft.categoria_id && !draft.categoria_custom?.trim()) missing.push("category");
  if (!draft.clase_id) missing.push("class");
  if (!draft.measures_text?.trim()) missing.push("measures");
  if (draft.price == null || Number(draft.price) <= 0) missing.push("price");
  if (draft.stock == null || Number(draft.stock) <= 0) missing.push("stock");

  return missing;
}

/**
 * Validates fields required to save an EDIT to an existing product.
 *
 * Differs from getMissingFields (create flow) in two ways:
 * 1. "measures" is excluded — the productos table has no measures column,
 *    so measures_text is never populated when loading a product into a draft.
 *    Requiring it would permanently block every edit save.
 * 2. "image" is excluded — products can exist without an image; the edit
 *    flow must not force an image upload just because the draft re-loaded
 *    the product with an empty image slot.
 *
 * All other fields (description, category, class, price, stock) map directly
 * to columns in productos and must be present to produce a valid UPDATE.
 */
export function getMissingFieldsForEdit(draft: ListingDraft): MissingDraftField[] {
  const missing: MissingDraftField[] = [];

  if (!draft.suggested_description?.trim()) missing.push("description");
  if (!draft.categoria_id && !draft.categoria_custom?.trim()) missing.push("category");
  if (!draft.clase_id) missing.push("class");
  if (draft.price == null || Number(draft.price) <= 0) missing.push("price");
  if (draft.stock == null || Number(draft.stock) <= 0) missing.push("stock");

  return missing;
}

export function buildDraftPreview(draft: ListingDraft): string {
  const safePrice =
    draft.price != null && Number.isFinite(Number(draft.price))
      ? `Q${Number(draft.price).toFixed(2)}`
      : "Pendiente";

  return [
    `Nombre: ${draft.suggested_title?.trim() || "Producto artesanal"}`,
    `Descripción: ${draft.suggested_description?.trim() || "Producto agregado por el vendedor"}`,
    `Precio: ${safePrice}`,
    `Medidas: ${draft.measures_text?.trim() || "Pendiente"}`,
  ].join("\n");
}
