import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../config/db";
import ListingDraft from "../../models/ListingDraft.model";
import { generateProductCode } from "../productCode.service";
import {
  uploadFromWhatsAppMedia,
  deleteStoredImages,
} from "../products/productMedia.service";
import {
  getDraftForUpdate,
  getDraftImages,
  getMissingFields,
  updateDraft,
  type ListingDraftImage,
} from "./listingDraft.service";

/**
 * Thrown when the seller's requested seller_sku collides with an existing one
 * at INSERT time. This is a user-input error (not a race condition) and must
 * NOT be retried. The caller is responsible for surfacing a clear message.
 */
export class SkuCollisionError extends Error {
  constructor(public readonly sku: string) {
    super(`seller_sku "${sku}" is already in use by another product of this seller`);
    this.name = "SkuCollisionError";
  }
}

function buildProductTitle(draft: ListingDraft): string {
  if (draft.suggested_title?.trim()) return draft.suggested_title.trim();
  if (draft.categoria_custom?.trim()) return draft.categoria_custom.trim();
  return "Producto artesanal";
}

/**
 * Builds the descripcion value for insertion into productos.
 *
 * ⚠️  DEUDA TÉCNICA — measures_text has no dedicated column in productos.
 * As a temporary measure it is appended as a tagged paragraph so the data
 * is not lost at publish time. This embeds dimensional data inside a
 * free-text field, making it unrecoverable by query.
 *
 * Migration path (Phase 3+): add a `medidas` column to productos, populate
 * it directly from draft.measures_text, and stop concatenating here. Existing
 * published rows can be back-filled by parsing the "Medidas: …" paragraph.
 */
function buildProductDescription(draft: ListingDraft): string {
  const base = draft.suggested_description?.trim() || "Producto agregado por el vendedor";
  const measures = draft.measures_text?.trim();
  return measures ? `${base}\n\nMedidas: ${measures}` : base;
}

/**
 * Ensures all draft images are uploaded to Supabase storage.
 *
 * Images that were already uploaded in a previous attempt (identified by the
 * presence of both `uploadedPublicUrl` and `uploadedStoragePath`) are reused
 * without re-uploading. Newly uploaded images are persisted back onto the
 * draft's `images_json` so that idempotent retries don't re-upload.
 *
 * Upload delegation: the actual download-from-Meta + upload-to-Supabase work
 * is done by `ProductMediaService.uploadFromWhatsAppMedia()`, which owns the
 * bucket name, path pattern, and URL resolution. This function is only
 * responsible for the draft-level bookkeeping around that operation.
 */
async function ensureDraftImagesUploaded(
  draft: ListingDraft,
  transaction?: Transaction
): Promise<{ publicUrls: string[]; uploadedPaths: string[] }> {
  const draftImages = getDraftImages(draft);
  const publicUrls: string[] = [];
  const uploadedPaths: string[] = [];
  const updatedImages: ListingDraftImage[] = [];

  for (const image of draftImages) {
    if (image.uploadedPublicUrl && image.uploadedStoragePath) {
      // Already uploaded — reuse without touching Supabase storage.
      publicUrls.push(image.uploadedPublicUrl);
      updatedImages.push(image);
      continue;
    }

    const stored = await uploadFromWhatsAppMedia(image.mediaId, image.mimeType);

    updatedImages.push({
      ...image,
      mimeType: stored.mimeType,
      uploadedStoragePath: stored.storagePath,
      uploadedPublicUrl: stored.publicUrl,
    });
    uploadedPaths.push(stored.storagePath);
    publicUrls.push(stored.publicUrl);
  }

  if (JSON.stringify(updatedImages) !== JSON.stringify(draftImages)) {
    if (transaction) {
      await draft.update({ images_json: updatedImages }, { transaction });
    } else {
      await updateDraft(draft, { images_json: updatedImages });
    }
  }

  return { publicUrls, uploadedPaths };
}

export async function publishListingDraft(draft: ListingDraft): Promise<{
  productId: string;
  internalCode: string;
}> {
  const uploadedInThisAttempt: string[] = [];
  const transaction = await sequelize.transaction();

  try {
    const lockedDraft = await getDraftForUpdate(draft.id, transaction);

    console.log(
      `[conversation][publish.start] draft=${lockedDraft.id} session=${lockedDraft.session_id} status=${lockedDraft.status}`
    );

    if (lockedDraft.status === "published" && lockedDraft.published_product_id) {
      await transaction.commit();
      return {
        productId: lockedDraft.published_product_id,
        internalCode: "",
      };
    }

    if (lockedDraft.status === "publishing") {
      throw new Error("Draft is already being published");
    }

    const missing = getMissingFields(lockedDraft);
    if (missing.length > 0) {
      throw new Error(`Draft incomplete: ${missing.join(", ")}`);
    }

    if (!lockedDraft.seller_user_id) {
      throw new Error("Draft has no linked seller");
    }

    await lockedDraft.update({ status: "publishing" }, { transaction });

    const { publicUrls, uploadedPaths } = await ensureDraftImagesUploaded(
      lockedDraft,
      transaction
    );
    uploadedInThisAttempt.push(...uploadedPaths);

    // ── internal_code retry loop ────────────────────────────────────────────
    // generateProductCode() does a pre-flight SELECT to avoid collisions, but
    // two concurrent publish calls can both pass that check with the same code
    // (astronomically rare, ~0.000046% per pair). The SAVEPOINT pattern allows
    // us to regenerate and retry within the open transaction without aborting
    // it. Up to MAX_CODE_RETRIES attempts are made.
    //
    // A seller_sku violation is NOT retried — it is a user-input error and
    // must be surfaced to the caller as SkuCollisionError immediately.
    const MAX_CODE_RETRIES = 3;

    let internalCode = await generateProductCode({
      departamento: null,
      categoriaId: lockedDraft.categoria_id ?? null,
      categoriaCustom: lockedDraft.categoria_custom ?? null,
      createdAt: new Date(),
    });

    const insertReplacements = {
      vendedor_id: lockedDraft.seller_user_id,
      nombre: buildProductTitle(lockedDraft),
      descripcion: buildProductDescription(lockedDraft),
      precio: Number(lockedDraft.price),
      stock: Number(lockedDraft.stock),
      categoria_id: lockedDraft.categoria_id ?? null,
      categoria_custom: lockedDraft.categoria_custom ?? null,
      clase_id: lockedDraft.clase_id,
      imagen_url: publicUrls[0] ?? null,
      activo: false,
      seller_sku: lockedDraft.seller_sku ?? null,
    };

    let inserted: { id: string; internal_code: string } | null = null;

    for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
      await sequelize.query(`SAVEPOINT sp_wapp_product_insert`, { transaction });

      try {
        const rows = await sequelize.query<{ id: string; internal_code: string }>(
          `
          INSERT INTO productos (
            vendedor_id, nombre, descripcion, precio, stock,
            categoria_id, categoria_custom,
            clase_id,
            imagen_url, activo,
            internal_code, seller_sku,
            created_at, updated_at
          ) VALUES (
            :vendedor_id, :nombre, :descripcion, :precio, :stock,
            :categoria_id, :categoria_custom,
            :clase_id,
            :imagen_url, :activo,
            :internal_code, :seller_sku,
            now(), now()
          )
          RETURNING id, internal_code
          `,
          {
            replacements: { ...insertReplacements, internal_code: internalCode },
            type: QueryTypes.SELECT,
            transaction,
          }
        );

        await sequelize.query(`RELEASE SAVEPOINT sp_wapp_product_insert`, { transaction });
        inserted = rows[0] ?? null;
        break;

      } catch (insertErr: any) {
        await sequelize.query(`ROLLBACK TO SAVEPOINT sp_wapp_product_insert`, { transaction });

        const is23505 =
          insertErr?.parent?.code === "23505" ||
          insertErr?.name === "SequelizeUniqueConstraintError";
        const constraint: string = insertErr?.parent?.constraint ?? "";
        const isCodeCollision = is23505 && !constraint.includes("seller_sku");

        if (isCodeCollision && attempt < MAX_CODE_RETRIES - 1) {
          console.warn(
            `[conversation][publish.code_collision] draft=${lockedDraft.id} attempt=${attempt + 1} — regenerating internal_code`
          );
          internalCode = await generateProductCode({
            departamento: null,
            categoriaId: lockedDraft.categoria_id ?? null,
            categoriaCustom: lockedDraft.categoria_custom ?? null,
            createdAt: new Date(),
          });
          continue;
        }

        if (is23505 && constraint.includes("seller_sku")) {
          throw new SkuCollisionError(lockedDraft.seller_sku ?? "");
        }

        throw insertErr;
      }
    }

    if (!inserted?.id) {
      throw new Error("Product insert failed after retries");
    }

    for (const url of publicUrls) {
      await sequelize.query(
        `
        INSERT INTO producto_imagenes (producto_id, url, created_at)
        VALUES (:producto_id, :url, now())
        `,
        {
          replacements: {
            producto_id: inserted.id,
            url,
          },
          transaction,
        }
      );
    }

    await lockedDraft.update(
      {
        status: "published",
        published_product_id: inserted.id,
        suggested_title: buildProductTitle(lockedDraft),
      },
      { transaction }
    );

    await transaction.commit();

    console.log(
      `[conversation][publish.done] draft=${lockedDraft.id} session=${lockedDraft.session_id} product=${inserted.id}`
    );

    return {
      productId: inserted.id,
      internalCode: inserted.internal_code,
    };
  } catch (error) {
    await transaction.rollback();

    await ListingDraft.update(
      { status: "ready_to_publish" },
      {
        where: {
          id: draft.id,
          status: "publishing",
        } as any,
      }
    ).catch(() => undefined);

    if (uploadedInThisAttempt.length > 0) {
      await deleteStoredImages(uploadedInThisAttempt).catch(() => undefined);
    }

    throw error;
  }
}
