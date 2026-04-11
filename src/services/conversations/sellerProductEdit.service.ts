import { QueryTypes } from "sequelize";
import type ListingDraft from "../../models/ListingDraft.model";
import { sequelize } from "../../config/db";
import { updateDraft } from "../listing-drafts/listingDraft.service";
import {
  getCategoriaLabel,
  getClaseLabel,
} from "../taxonomy.service";
import type { UxProductView } from "./ux/conversationUxTypes";
import { buildProductViewMessage } from "./ux/conversationUxBuilder.service";

type EditableProduct = {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: string;
  stock: number;
  categoria_id: number | null;
  categoria_custom: string | null;
  categoria_nombre: string | null;
  clase_id: number | null;
  clase_nombre: string | null;
  activo: boolean;
  imagen_url: string | null;
};

export type EditableProductDetail = EditableProduct;
export type ProductReferenceMatch = "seller_sku" | "internal_code";
export type SellerProductReferenceResult = {
  product: EditableProduct | null;
  matchedBy: ProductReferenceMatch | null;
};

function mapOwnedProductToViewModel(product: EditableProduct): UxProductView {
  return {
    nombre: product.nombre,
    precio: Number(product.precio),
    stock: product.stock,
    estado: product.activo ? "activo" : "inactivo",
    categoria: getCategoriaLabel(product),
    clase: getClaseLabel(product),
    descripcion: product.descripcion?.trim() || null,
  };
}

export function buildOwnedProductDetailMessage(product: EditableProduct): string {
  return buildProductViewMessage(mapOwnedProductToViewModel(product));
}

export async function getProductDetail(
  sellerUserId: number,
  productId: string
): Promise<EditableProduct | null> {
  console.log(
    `[product][detail.query] using_join=true seller=${sellerUserId} product=${productId}`
  );

  const rows = await sequelize.query<EditableProduct>(
    `
    SELECT
      p.id,
      p.nombre,
      p.descripcion,
      p.precio::text,
      p.stock,
      p.categoria_id,
      p.categoria_custom,
      c.nombre AS categoria_nombre,
      p.clase_id,
      cl.nombre AS clase_nombre,
      p.activo,
      p.imagen_url
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    LEFT JOIN clases cl ON cl.id = p.clase_id
    WHERE p.id = :productId
      AND p.vendedor_id = :sellerUserId
    LIMIT 1
    `,
    {
      replacements: { sellerUserId, productId },
      type: QueryTypes.SELECT,
    }
  );

  return rows[0] ?? null;
}

export async function getOwnedProductForConversation(
  sellerUserId: number,
  productId: string
): Promise<EditableProduct | null> {
  return getProductDetail(sellerUserId, productId);
}

// Mirrors the model-level format rule: letters, digits, hyphens, underscores.
// Max length matches the seller_sku column definition (100 chars).
const SKU_FORMAT_RE = /^[A-Za-z0-9\-_]+$/;
const SKU_MAX_LENGTH = 100;

/**
 * Looks up a seller's product by its seller_sku using an exact, case-insensitive
 * match. Returns null if the SKU does not exist, belongs to a different seller,
 * or fails format validation (no DB query is made in that case).
 *
 * @param sellerUserId - The authenticated seller's user ID.
 * @param sku          - The SKU string (already uppercased by the caller).
 */
export async function getSellerProductBySku(
  sellerUserId: number,
  sku: string
): Promise<EditableProduct | null> {
  // Guard: reject before hitting the DB. The format rule mirrors the model's
  // validator so we never send symbols, empty strings, or oversized input.
  if (!sku || sku.length > SKU_MAX_LENGTH || !SKU_FORMAT_RE.test(sku)) {
    console.log(
      `[conversation][product.search.sku] event=rejected seller=${sellerUserId} sku="${sku}" reason=invalid_format`
    );
    return null;
  }

  console.log(
    `[conversation][product.search.sku] event=start seller=${sellerUserId} sku="${sku}"`
  );

  const rows = await sequelize.query<EditableProduct>(
    `
    SELECT
      p.id,
      p.nombre,
      p.descripcion,
      p.precio::text,
      p.stock,
      p.categoria_id,
      p.categoria_custom,
      c.nombre AS categoria_nombre,
      p.clase_id,
      cl.nombre AS clase_nombre,
      p.activo,
      p.imagen_url
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    LEFT JOIN clases cl ON cl.id = p.clase_id
    WHERE UPPER(p.seller_sku) = UPPER(:sku)
      AND p.vendedor_id = :sellerUserId
    LIMIT 1
    `,
    {
      replacements: { sellerUserId, sku },
      type: QueryTypes.SELECT,
    }
  );

  const product = rows[0] ?? null;

  console.log(
    `[conversation][product.search.sku] event=${product ? "found" : "not_found"} seller=${sellerUserId} sku="${sku}"`
  );

  return product;
}

async function getSellerProductByField(
  sellerUserId: number,
  value: string,
  field: ProductReferenceMatch
): Promise<EditableProduct | null> {
  const column = field === "seller_sku" ? "p.seller_sku" : "p.internal_code";

  const rows = await sequelize.query<EditableProduct>(
    `
    SELECT
      p.id,
      p.nombre,
      p.descripcion,
      p.precio::text,
      p.stock,
      p.categoria_id,
      p.categoria_custom,
      c.nombre AS categoria_nombre,
      p.clase_id,
      cl.nombre AS clase_nombre,
      p.activo,
      p.imagen_url
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    LEFT JOIN clases cl ON cl.id = p.clase_id
    WHERE UPPER(${column}) = UPPER(:value)
      AND p.vendedor_id = :sellerUserId
    LIMIT 1
    `,
    {
      replacements: { sellerUserId, value },
      type: QueryTypes.SELECT,
    }
  );

  return rows[0] ?? null;
}

export async function getSellerProductByReference(
  sellerUserId: number,
  reference: string
): Promise<SellerProductReferenceResult> {
  if (!reference || reference.length > SKU_MAX_LENGTH || !SKU_FORMAT_RE.test(reference)) {
    console.log(
      `[conversation][product.search.reference] event=rejected seller=${sellerUserId} reference="${reference}" reason=invalid_format`
    );
    return { product: null, matchedBy: null };
  }

  console.log(
    `[conversation][product.search.reference] event=start seller=${sellerUserId} reference="${reference}"`
  );

  const productBySellerSku = await getSellerProductByField(
    sellerUserId,
    reference,
    "seller_sku"
  );

  if (productBySellerSku) {
    console.log(
      `[conversation][product.search.reference] event=found seller=${sellerUserId} reference="${reference}" matchedBy=seller_sku`
    );
    return { product: productBySellerSku, matchedBy: "seller_sku" };
  }

  const productByInternalCode = await getSellerProductByField(
    sellerUserId,
    reference,
    "internal_code"
  );

  if (productByInternalCode) {
    console.log(
      `[conversation][product.search.reference] event=found seller=${sellerUserId} reference="${reference}" matchedBy=internal_code`
    );
    return { product: productByInternalCode, matchedBy: "internal_code" };
  }

  console.log(
    `[conversation][product.search.reference] event=not_found seller=${sellerUserId} reference="${reference}"`
  );

  return { product: null, matchedBy: null };
}

export async function buildOwnedProductDetailResponse(
  sellerUserId: number,
  productId: string
): Promise<string | null> {
  const product = await getProductDetail(sellerUserId, productId);
  if (!product) return null;

  return buildOwnedProductDetailMessage(product);
}

export async function loadOwnedProductIntoDraft(
  draft: ListingDraft,
  sellerUserId: number,
  productId: string,
  waMessageId?: string
): Promise<EditableProduct | null> {
  const product = await getProductDetail(sellerUserId, productId);
  if (!product) return null;

  await updateDraft(
    draft,
    {
      images_json: product.imagen_url
        ? [
            {
              source: "whatsapp",
              mediaId: `existing:${product.id}`,
              mimeType: null,
              uploadedPublicUrl: product.imagen_url,
              uploadedStoragePath: null,
            },
          ]
        : [],
      suggested_title: product.nombre,
      suggested_description: product.descripcion,
      price: Number(product.precio),
      stock: product.stock,
      categoria_id: product.categoria_id,
      categoria_custom: product.categoria_custom,
      clase_id: product.clase_id,
      status: "collecting",
      published_product_id: null,
      vision_suggestions_json: null,
    },
    { waMessageId }
  );

  await draft.reload();
  return product;
}

export async function saveOwnedProductFromDraft(
  sellerUserId: number,
  productId: string,
  draft: ListingDraft
): Promise<boolean> {
  const result = await sequelize.query(
    `
    UPDATE productos
    SET
      nombre = :nombre,
      descripcion = :descripcion,
      precio = :precio,
      stock = :stock,
      categoria_id = :categoria_id,
      categoria_custom = :categoria_custom,
      clase_id = :clase_id,
      updated_at = now()
    WHERE id = :productId
      AND vendedor_id = :sellerUserId
    `,
    {
      replacements: {
        sellerUserId,
        productId,
        nombre: draft.suggested_title?.trim() || draft.categoria_custom?.trim() || "Producto artesanal",
        descripcion: draft.suggested_description?.trim() || null,
        precio: Number(draft.price),
        stock: Number(draft.stock),
        categoria_id: draft.categoria_id ?? null,
        categoria_custom: draft.categoria_custom ?? null,
        clase_id: draft.clase_id ?? null,
      },
      type: QueryTypes.UPDATE,
    }
  );

  return Array.isArray(result);
}

export async function deactivateOwnedProduct(
  sellerUserId: number,
  productId: string
): Promise<boolean> {
  await sequelize.query(
    `
    UPDATE productos
    SET activo = false,
        updated_at = now()
    WHERE id = :productId
      AND vendedor_id = :sellerUserId
    `,
    {
      replacements: {
        sellerUserId,
        productId,
      },
    }
  );

  const product = await getProductDetail(sellerUserId, productId);
  return Boolean(product);
}
