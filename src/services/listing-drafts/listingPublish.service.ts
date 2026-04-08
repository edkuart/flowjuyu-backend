import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../../config/db";
import supabase from "../../lib/supabase";
import ListingDraft from "../../models/ListingDraft.model";
import { generateProductCode } from "../productCode.service";
import { downloadMediaBuffer } from "../integrations/whatsapp/whatsappMedia.service";
import {
  getDraftForUpdate,
  getDraftImages,
  getMissingFields,
  updateDraft,
  type ListingDraftImage,
} from "./listingDraft.service";

function buildProductTitle(draft: ListingDraft): string {
  if (draft.suggested_title?.trim()) return draft.suggested_title.trim();
  if (draft.categoria_custom?.trim()) return draft.categoria_custom.trim();
  return "Producto artesanal";
}

function buildProductDescription(draft: ListingDraft): string {
  const base = draft.suggested_description?.trim() || "Producto agregado por el vendedor";
  const measures = draft.measures_text?.trim();
  return measures ? `${base}\n\nMedidas: ${measures}` : base;
}

function pickExtension(mimeType: string | null | undefined): string {
  switch (mimeType) {
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "image/gif": return "gif";
    case "image/avif": return "avif";
    default: return "jpg";
  }
}

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
      publicUrls.push(image.uploadedPublicUrl);
      updatedImages.push(image);
      continue;
    }

    const { buffer, mimeType } = await downloadMediaBuffer(image.mediaId);
    const ext = pickExtension(image.mimeType ?? mimeType);
    const storagePath = `products/${Date.now()}-${Math.round(Math.random() * 1e9)}-${image.mediaId}.${ext}`;

    const { error } = await supabase.storage
      .from("productos")
      .upload(storagePath, buffer, {
        contentType: image.mimeType ?? mimeType,
        upsert: false,
      });

    if (error) {
      throw new Error(`Supabase upload failed for WhatsApp media ${image.mediaId}: ${error.message}`);
    }

    const { data } = supabase.storage.from("productos").getPublicUrl(storagePath);
    updatedImages.push({
      ...image,
      mimeType: image.mimeType ?? mimeType,
      uploadedStoragePath: storagePath,
      uploadedPublicUrl: data.publicUrl,
    });
    uploadedPaths.push(storagePath);
    publicUrls.push(data.publicUrl);
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

    const internalCode = await generateProductCode({
      departamento: null,
      categoriaId: lockedDraft.categoria_id ?? null,
      categoriaCustom: lockedDraft.categoria_custom ?? null,
      createdAt: new Date(),
    });

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
        :internal_code, NULL,
        now(), now()
      )
      RETURNING id, internal_code
      `,
      {
        replacements: {
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
          internal_code: internalCode,
        },
        type: QueryTypes.SELECT,
        transaction,
      }
    );

    const inserted = rows[0];
    if (!inserted?.id) {
      throw new Error("Product insert failed");
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
      await supabase.storage.from("productos").remove(uploadedInThisAttempt).catch(() => undefined);
    }

    throw error;
  }
}
