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

export async function updateDraft(
  draft: ListingDraft,
  partialData: DraftPatch,
  context?: { waMessageId?: string }
): Promise<ListingDraft> {
  return updateDraftById(draft.id, partialData, context);
}

function validateDraftPatch(partialData: DraftPatch): void {
  if (partialData.price != null && Number(partialData.price) <= 0) {
    throw new Error("Draft price must be greater than zero");
  }

  if (partialData.stock != null && Number(partialData.stock) <= 0) {
    throw new Error("Draft stock must be greater than zero");
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
