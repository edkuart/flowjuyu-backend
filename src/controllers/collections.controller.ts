import { RequestHandler } from "express";
import { QueryTypes } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { sequelize } from "../config/db";
import supabase from "../lib/supabase";

type AuthUser = { id: number };

type CollectionRow = {
  id: number;
  seller_id: number;
  name: string;
  description: string | null;
  status: "draft" | "published";
  promo_image_url: string | null;
  background_image_url: string | null;
  background_color: string | null;
  background_style: string | null;
  canvas_width: number;
  canvas_height: number;
  created_at: Date;
  updated_at: Date;
};

type CollectionProductRow = {
  item_id: number;
  product_id: string;
  nombre: string;
  precio: number | string;
  imagen_url: string | null;
  internal_code: string | null;
  seller_sku: string | null;
  z_index: number;
};

type CollectionCanvasItemRow = {
  id: number;
  element_type: "product" | "text" | "shape" | "image" | null;
  content: unknown;
  product_id: string | null;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  z_index: number;
  product_name: string | null;
  product_image: string | null;
  product_price: number | string | null;
};

function getUser(req: unknown): AuthUser | null {
  const user = (req as { user?: AuthUser }).user;
  return user?.id ? user : null;
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function normalizeDescription(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizePromoImageUrl(body: Record<string, unknown>): string | null | undefined {
  if (Object.prototype.hasOwnProperty.call(body, "promo_image_url")) {
    const value = body.promo_image_url;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  if (Object.prototype.hasOwnProperty.call(body, "background_image_url")) {
    const value = body.background_image_url;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  return undefined;
}

function normalizeProductIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const ids: string[] = [];

  for (const rawValue of input) {
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!value || seen.has(value)) continue;
    seen.add(value);
    ids.push(value);
  }

  return ids;
}

function deriveTemplateThumbnail(
  backgroundImageUrl: string | null | undefined,
  thumbnailUrl: string | null | undefined,
  itemsSnapshot: any[]
): string | null {
  if (thumbnailUrl) return thumbnailUrl;
  if (backgroundImageUrl) return backgroundImageUrl;

  for (const item of itemsSnapshot) {
    if (item?.element_type === "image" && item?.content?.url) return String(item.content.url);
    if (item?.element_type === "product" && item?.product_image) return String(item.product_image);
  }

  return null;
}

async function assertOwnership(collectionId: number, sellerId: number): Promise<boolean> {
  const rows = await sequelize.query<{ id: number }>(
    `
    SELECT id
    FROM collections
    WHERE id = :collectionId
      AND seller_id = :sellerId
    LIMIT 1
    `,
    {
      replacements: { collectionId, sellerId },
      type: QueryTypes.SELECT,
    }
  );

  return rows.length > 0;
}

async function getCollectionRowForSeller(collectionId: number, sellerId: number): Promise<CollectionRow | null> {
  const rows = await sequelize.query<CollectionRow>(
    `
    SELECT
      c.id,
      c.seller_id,
      c.name,
      c.description,
      c.status,
      COALESCE(c.promo_image_url, c.background_image_url) AS promo_image_url,
      c.background_image_url,
      c.background_color,
      c.background_style,
      c.canvas_width,
      c.canvas_height,
      c.created_at,
      c.updated_at
    FROM collections c
    WHERE c.id = :collectionId
      AND c.seller_id = :sellerId
    LIMIT 1
    `,
    {
      replacements: { collectionId, sellerId },
      type: QueryTypes.SELECT,
    }
  );

  return rows[0] ?? null;
}

async function getCollectionProducts(collectionId: number, sellerId?: number): Promise<CollectionProductRow[]> {
  const rows = await sequelize.query<CollectionProductRow>(
    `
    SELECT
      ci.id          AS item_id,
      p.id           AS product_id,
      p.nombre,
      p.precio,
      p.imagen_url,
      p.internal_code,
      p.seller_sku,
      COALESCE(ci.z_index, 0) AS z_index
    FROM collection_items ci
    JOIN productos p ON p.id = ci.product_id
    WHERE ci.collection_id = :collectionId
      AND (ci.element_type = 'product' OR ci.element_type IS NULL)
      ${sellerId ? "AND p.vendedor_id = :sellerId" : ""}
      AND p.activo = true
    ORDER BY COALESCE(ci.z_index, 0) ASC, p.created_at DESC
    `,
    {
      replacements: sellerId ? { collectionId, sellerId } : { collectionId },
      type: QueryTypes.SELECT,
    }
  );

  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = String(row.product_id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function getCollectionCanvasItems(collectionId: number, sellerId: number): Promise<CollectionCanvasItemRow[]> {
  return sequelize.query<CollectionCanvasItemRow>(
    `
    SELECT
      ci.id,
      COALESCE(ci.element_type, 'product') AS element_type,
      ci.content,
      ci.product_id,
      COALESCE(ci.pos_x, 0) AS pos_x,
      COALESCE(ci.pos_y, 0) AS pos_y,
      COALESCE(ci.width, 0) AS width,
      COALESCE(ci.height, 0) AS height,
      COALESCE(ci.z_index, 0) AS z_index,
      p.nombre AS product_name,
      p.imagen_url AS product_image,
      p.precio AS product_price
    FROM collection_items ci
    LEFT JOIN productos p
      ON p.id = ci.product_id
     AND p.vendedor_id = :sellerId
    WHERE ci.collection_id = :collectionId
    ORDER BY COALESCE(ci.z_index, 0) ASC, ci.id ASC
    `,
    {
      replacements: { collectionId, sellerId },
      type: QueryTypes.SELECT,
    }
  );
}

function buildCollectionPayload(
  collection: CollectionRow,
  products: CollectionProductRow[],
  canvasItems?: CollectionCanvasItemRow[]
) {
  const promoImageUrl = collection.promo_image_url ?? collection.background_image_url ?? null;
  const productItems = products.map((product, index) => ({
    id: product.item_id,
    element_type: "product" as const,
    product_id: product.product_id,
    z_index: product.z_index ?? index,
    product_name: product.nombre,
    product_image: product.imagen_url,
    product_price: product.precio,
    internal_code: product.internal_code,
    seller_sku: product.seller_sku,
  }));
  const resolvedItems = canvasItems ?? productItems;

  return {
    id: collection.id,
    seller_id: collection.seller_id,
    name: collection.name,
    description: collection.description,
    status: collection.status,
    promo_image_url: promoImageUrl,
    background_image_url: promoImageUrl,
    background_color: collection.background_color,
    background_style: collection.background_style,
    canvas_width: collection.canvas_width,
    canvas_height: collection.canvas_height,
    item_count: resolvedItems.length,
    product_count: products.length,
    products: products.map((product) => ({
      id: product.product_id,
      nombre: product.nombre,
      precio: product.precio,
      imagen_url: product.imagen_url,
      internal_code: product.internal_code,
      seller_sku: product.seller_sku,
    })),
    items: resolvedItems,
    created_at: collection.created_at,
    updated_at: collection.updated_at,
  };
}

async function validateSellerProducts(productIds: string[], sellerId: number): Promise<string[]> {
  if (!productIds.length) return [];

  const rows = await sequelize.query<{ id: string }>(
    `
    SELECT id
    FROM productos
    WHERE vendedor_id = :sellerId
      AND activo = true
      AND id IN (:productIds)
    `,
    {
      replacements: { sellerId, productIds },
      type: QueryTypes.SELECT,
    }
  );

  const valid = new Set(rows.map((row) => String(row.id)));
  return productIds.filter((productId) => valid.has(productId));
}

async function replaceCollectionProducts(collectionId: number, sellerId: number, productIds: string[]): Promise<void> {
  const validProductIds = await validateSellerProducts(productIds, sellerId);

  if (validProductIds.length !== productIds.length) {
    throw Object.assign(new Error("INVALID_PRODUCTS"), { statusCode: 400 });
  }

  const transaction = await sequelize.transaction();

  try {
    await sequelize.query(
      `
      DELETE FROM collection_items
      WHERE collection_id = :collectionId
        AND (element_type = 'product' OR element_type IS NULL)
      `,
      {
        replacements: { collectionId },
        type: QueryTypes.DELETE,
        transaction,
      }
    );

    for (const [index, productId] of validProductIds.entries()) {
      await sequelize.query(
        `
        INSERT INTO collection_items
          (collection_id, product_id, element_type, content, pos_x, pos_y, width, height, z_index, created_at, updated_at)
        VALUES
          (:collectionId, :productId, 'product', NULL, 0, 0, 0, 0, :zIndex, NOW(), NOW())
        `,
        {
          replacements: {
            collectionId,
            productId,
            zIndex: index,
          },
          type: QueryTypes.INSERT,
          transaction,
        }
      );
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function getPublishedCollectionsByQuery(
  replacements: Record<string, unknown>,
  whereClause: string
): Promise<Array<ReturnType<typeof buildCollectionPayload>>> {
  const collections = await sequelize.query<CollectionRow>(
    `
    SELECT
      c.id,
      c.seller_id,
      c.name,
      c.description,
      c.status,
      COALESCE(c.promo_image_url, c.background_image_url) AS promo_image_url,
      c.background_image_url,
      c.background_color,
      c.background_style,
      c.canvas_width,
      c.canvas_height,
      c.created_at,
      c.updated_at
    FROM collections c
    ${whereClause}
    ORDER BY c.created_at DESC
    `,
    {
      replacements,
      type: QueryTypes.SELECT,
    }
  );

  const payloads = await Promise.all(
    collections.map(async (collection) => {
      const [products, canvasItems] = await Promise.all([
        getCollectionProducts(collection.id),
        getCollectionCanvasItems(collection.id, collection.seller_id),
      ]);
      return buildCollectionPayload(collection, products, canvasItems);
    })
  );

  return payloads;
}

export const getMyCollections: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const collections = await sequelize.query<CollectionRow>(
      `
      SELECT
        c.id,
        c.seller_id,
        c.name,
        c.description,
        c.status,
        COALESCE(c.promo_image_url, c.background_image_url) AS promo_image_url,
        c.background_image_url,
        c.background_color,
        c.background_style,
        c.canvas_width,
        c.canvas_height,
        c.created_at,
        c.updated_at
      FROM collections c
      WHERE c.seller_id = :sellerId
      ORDER BY c.created_at DESC
      `,
      {
        replacements: { sellerId: user.id },
        type: QueryTypes.SELECT,
      }
    );

    const data = await Promise.all(
      collections.map(async (collection) => {
        const [products, canvasItems] = await Promise.all([
          getCollectionProducts(collection.id, user.id),
          getCollectionCanvasItems(collection.id, user.id),
        ]);
        return buildCollectionPayload(collection, products, canvasItems);
      })
    );

    res.json({ ok: true, data });
  } catch (error) {
    console.error("[collections] getMyCollections:", error);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

export const getCollectionById: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const collectionId = Number(req.params.id);
    if (!collectionId || Number.isNaN(collectionId)) {
      res.status(400).json({ ok: false, message: "Colección inválida" });
      return;
    }

    const collection = await getCollectionRowForSeller(collectionId, user.id);
    if (!collection) {
      res.status(404).json({ ok: false, message: "Colección no encontrada" });
      return;
    }

    const [products, canvasItems] = await Promise.all([
      getCollectionProducts(collectionId, user.id),
      getCollectionCanvasItems(collectionId, user.id),
    ]);
    res.json({ ok: true, data: buildCollectionPayload(collection, products, canvasItems) });
  } catch (error) {
    console.error("[collections] getCollectionById:", error);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

export const createCollection: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = normalizeText(body.name, 120);

    if (!name) {
      res.status(400).json({ ok: false, message: "El nombre es requerido" });
      return;
    }

    const description = normalizeDescription(body.description);
    const promoImageUrl = normalizePromoImageUrl(body) ?? null;

    const rows = await sequelize.query<{ id: number }>(
      `
      INSERT INTO collections
        (seller_id, name, description, promo_image_url, background_image_url, background_color, canvas_width, canvas_height, status, created_at, updated_at)
      VALUES
        (:sellerId, :name, :description, :promoImageUrl, :backgroundImageUrl, '#FFFFFF', 800, 600, 'draft', NOW(), NOW())
      RETURNING id
      `,
      {
        replacements: {
          sellerId: user.id,
          name,
          description,
          promoImageUrl,
          backgroundImageUrl: promoImageUrl,
        },
        type: QueryTypes.SELECT,
      }
    );

    const collectionId = rows[0]?.id;
    const productIds = normalizeProductIds(body.product_ids);
    if (collectionId && productIds.length) {
      await replaceCollectionProducts(collectionId, user.id, productIds);
    }

    res.status(201).json({ ok: true, data: { id: collectionId } });
  } catch (error) {
    console.error("[collections] createCollection:", error);
    if ((error as { statusCode?: number }).statusCode === 400) {
      res.status(400).json({ ok: false, message: "Uno o más productos no son válidos para esta colección" });
      return;
    }
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

export const updateCollection: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const collectionId = Number(req.params.id);
    const owned = await assertOwnership(collectionId, user.id);
    if (!owned) {
      res.status(404).json({ ok: false, message: "Colección no encontrada" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = Object.prototype.hasOwnProperty.call(body, "name")
      ? normalizeText(body.name, 120)
      : undefined;
    const description = Object.prototype.hasOwnProperty.call(body, "description")
      ? normalizeDescription(body.description)
      : undefined;
    const promoImageUrl = normalizePromoImageUrl(body);

    if (Object.prototype.hasOwnProperty.call(body, "name") && !name) {
      res.status(400).json({ ok: false, message: "El nombre es requerido" });
      return;
    }

    await sequelize.query(
      `
      UPDATE collections
      SET
        name = CASE WHEN :hasName THEN :name ELSE name END,
        description = CASE WHEN :hasDescription THEN :description ELSE description END,
        promo_image_url = CASE WHEN :hasPromoImage THEN :promoImageUrl ELSE promo_image_url END,
        background_image_url = CASE WHEN :hasPromoImage THEN :promoImageUrl ELSE background_image_url END,
        updated_at = NOW()
      WHERE id = :collectionId
      `,
      {
        replacements: {
          collectionId,
          hasName: Object.prototype.hasOwnProperty.call(body, "name"),
          name: name ?? null,
          hasDescription: Object.prototype.hasOwnProperty.call(body, "description"),
          description: description ?? null,
          hasPromoImage: promoImageUrl !== undefined,
          promoImageUrl: promoImageUrl ?? null,
        },
        type: QueryTypes.UPDATE,
      }
    );

    if (Object.prototype.hasOwnProperty.call(body, "product_ids")) {
      await replaceCollectionProducts(collectionId, user.id, normalizeProductIds(body.product_ids));
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("[collections] updateCollection:", error);
    if ((error as { statusCode?: number }).statusCode === 400) {
      res.status(400).json({ ok: false, message: "Uno o más productos no son válidos para esta colección" });
      return;
    }
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

export const setCollectionProducts: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const collectionId = Number(req.params.id);
    const owned = await assertOwnership(collectionId, user.id);
    if (!owned) {
      res.status(404).json({ ok: false, message: "Colección no encontrada" });
      return;
    }

    const productIds = normalizeProductIds((req.body ?? {}).product_ids);
    await replaceCollectionProducts(collectionId, user.id, productIds);

    res.json({ ok: true, data: { product_count: productIds.length } });
  } catch (error) {
    console.error("[collections] setCollectionProducts:", error);
    if ((error as { statusCode?: number }).statusCode === 400) {
      res.status(400).json({ ok: false, message: "Uno o más productos no son válidos para esta colección" });
      return;
    }
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

export const getPublicCollectionTemplates: RequestHandler = async (_req, res): Promise<void> => {
  try {
    const templates = await sequelize.query(
      `
      SELECT
        id,
        name,
        thumbnail_url,
        items_snapshot,
        canvas_width,
        canvas_height,
        background_color,
        background_style,
        background_image_url,
        is_public,
        created_at
      FROM collection_templates
      WHERE is_public = true
      ORDER BY created_at DESC
      `,
      { type: QueryTypes.SELECT }
    );

    res.json({ ok: true, data: templates });
  } catch (error) {
    console.error("[collections] getPublicCollectionTemplates:", error);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

export const getMyCollectionTemplates: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const templates = await sequelize.query(
      `
      SELECT
        id,
        name,
        thumbnail_url,
        items_snapshot,
        canvas_width,
        canvas_height,
        background_color,
        background_style,
        background_image_url,
        is_public,
        created_at,
        CASE WHEN seller_id IS NULL THEN 'system' ELSE 'mine' END AS owner_scope
      FROM collection_templates
      WHERE seller_id IS NULL
         OR seller_id = :sellerId
      ORDER BY
        CASE WHEN seller_id IS NULL THEN 0 ELSE 1 END,
        created_at DESC
      `,
      {
        replacements: { sellerId: user.id },
        type: QueryTypes.SELECT,
      }
    );

    res.json({ ok: true, data: templates });
  } catch (error) {
    console.error("[collections] getMyCollectionTemplates:", error);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

export const getCollectionTemplateById: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const templateId = Number(req.params.templateId);
    if (!templateId || Number.isNaN(templateId)) {
      res.status(400).json({ ok: false, message: "templateId inválido" });
      return;
    }

    const rows = await sequelize.query(
      `
      SELECT
        id,
        seller_id,
        name,
        thumbnail_url,
        items_snapshot,
        canvas_width,
        canvas_height,
        background_color,
        background_style,
        background_image_url,
        is_public,
        created_at,
        updated_at
      FROM collection_templates
      WHERE id = :templateId
        AND (seller_id IS NULL OR seller_id = :sellerId)
      LIMIT 1
      `,
      {
        replacements: {
          templateId,
          sellerId: user.id,
        },
        type: QueryTypes.SELECT,
      }
    );

    const template = rows[0];
    if (!template) {
      res.status(404).json({ ok: false, message: "Plantilla no encontrada" });
      return;
    }

    res.json({ ok: true, data: template });
  } catch (error) {
    console.error("[collections] getCollectionTemplateById:", error);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

export const saveCollectionAsTemplate: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const collectionId = Number(req.params.id);
    const owned = await assertOwnership(collectionId, user.id);
    if (!owned) {
      res.status(404).json({ ok: false, message: "Colección no encontrada" });
      return;
    }

    const {
      name,
      thumbnail_url = null,
      items_snapshot = [],
      canvas_width = 800,
      canvas_height = 600,
      background_color = "#FFFFFF",
      background_style = null,
      background_image_url = null,
      is_public = true,
    } = req.body ?? {};

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ ok: false, message: "El nombre de la plantilla es requerido" });
      return;
    }

    if (!Array.isArray(items_snapshot)) {
      res.status(400).json({ ok: false, message: "items_snapshot debe ser un arreglo" });
      return;
    }

    const finalThumbnail = deriveTemplateThumbnail(background_image_url, thumbnail_url, items_snapshot);

    const rows = await sequelize.query<{ id: number }>(
      `
      INSERT INTO collection_templates
        (seller_id, name, thumbnail_url, items_snapshot, canvas_width, canvas_height, background_color, background_style, background_image_url, is_public, created_at, updated_at)
      VALUES
        (:sellerId, :name, :thumbnailUrl, CAST(:itemsSnapshot AS jsonb), :canvasWidth, :canvasHeight, :backgroundColor, :backgroundStyle, :backgroundImageUrl, :isPublic, NOW(), NOW())
      RETURNING id
      `,
      {
        replacements: {
          sellerId: user.id,
          name: name.trim().slice(0, 120),
          thumbnailUrl: finalThumbnail,
          itemsSnapshot: JSON.stringify(items_snapshot),
          canvasWidth: Number(canvas_width) || 800,
          canvasHeight: Number(canvas_height) || 600,
          backgroundColor: background_color ?? "#FFFFFF",
          backgroundStyle: background_style ?? null,
          backgroundImageUrl: background_image_url ?? null,
          isPublic: Boolean(is_public),
        },
        type: QueryTypes.SELECT,
      }
    );

    res.status(201).json({ ok: true, data: { id: rows[0]?.id } });
  } catch (error) {
    console.error("[collections] saveCollectionAsTemplate:", error);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

export const applyCollectionTemplate: RequestHandler = async (req, res): Promise<void> => {
  const transaction = await sequelize.transaction();

  try {
    const user = getUser(req);
    if (!user) {
      await transaction.rollback();
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const collectionId = Number(req.params.id);
    const templateId = Number(req.body?.template_id);

    if (!templateId || Number.isNaN(templateId)) {
      await transaction.rollback();
      res.status(400).json({ ok: false, message: "template_id inválido" });
      return;
    }

    const owned = await assertOwnership(collectionId, user.id);
    if (!owned) {
      await transaction.rollback();
      res.status(404).json({ ok: false, message: "Colección no encontrada" });
      return;
    }

    const templateRows = await sequelize.query<{
      id: number;
      seller_id: number | null;
      name: string;
      items_snapshot: any[];
      canvas_width: number;
      canvas_height: number;
      background_color: string;
      background_style: string | null;
      background_image_url: string | null;
      is_public: boolean;
    }>(
      `
      SELECT *
      FROM collection_templates
      WHERE id = :templateId
        AND (is_public = true OR seller_id = :sellerId)
      LIMIT 1
      `,
      {
        replacements: { templateId, sellerId: user.id },
        type: QueryTypes.SELECT,
        transaction,
      }
    );

    const template = templateRows[0];
    if (!template) {
      await transaction.rollback();
      res.status(404).json({ ok: false, message: "Plantilla no encontrada" });
      return;
    }

    const itemsSnapshot = Array.isArray(template.items_snapshot) ? template.items_snapshot : [];
    const productIds = itemsSnapshot
      .filter((item) => item?.element_type === "product" && item?.product_id)
      .map((item) => String(item.product_id));

    let validProductIds = new Set<string>();
    if (productIds.length > 0) {
      const rows = await sequelize.query<{ id: string }>(
        `
        SELECT id
        FROM productos
        WHERE vendedor_id = :sellerId
          AND activo = true
          AND id IN (:productIds)
        `,
        {
          replacements: { sellerId: user.id, productIds },
          type: QueryTypes.SELECT,
          transaction,
        }
      );
      validProductIds = new Set(rows.map((row) => String(row.id)));
    }

    await sequelize.query(
      `
      UPDATE collections SET
        background_color     = :backgroundColor,
        background_style     = :backgroundStyle,
        background_image_url = :backgroundImageUrl,
        canvas_width         = :canvasWidth,
        canvas_height        = :canvasHeight,
        updated_at           = NOW()
      WHERE id = :collectionId
      `,
      {
        replacements: {
          collectionId,
          backgroundColor: template.background_color ?? "#FFFFFF",
          backgroundStyle: template.background_style ?? null,
          backgroundImageUrl: template.background_image_url ?? null,
          canvasWidth: template.canvas_width ?? 800,
          canvasHeight: template.canvas_height ?? 600,
        },
        type: QueryTypes.UPDATE,
        transaction,
      }
    );

    await sequelize.query(
      `DELETE FROM collection_items WHERE collection_id = :collectionId`,
      {
        replacements: { collectionId },
        type: QueryTypes.DELETE,
        transaction,
      }
    );

    let insertedCount = 0;
    let skippedProducts = 0;

    for (const rawItem of itemsSnapshot) {
      const elementType = rawItem?.element_type ?? "product";
      const isProduct = elementType === "product";
      const productId = rawItem?.product_id ? String(rawItem.product_id) : null;

      if (isProduct && (!productId || !validProductIds.has(productId))) {
        skippedProducts += 1;
        continue;
      }

      await sequelize.query(
        `
        INSERT INTO collection_items
          (collection_id, product_id, element_type, content, pos_x, pos_y, width, height, z_index, created_at, updated_at)
        VALUES
          (:collectionId, :productId, :elementType, CAST(:content AS jsonb), :posX, :posY, :width, :height, :zIndex, NOW(), NOW())
        `,
        {
          replacements: {
            collectionId,
            productId,
            elementType,
            content: JSON.stringify(rawItem?.content ?? null),
            posX: Number(rawItem?.pos_x ?? 0),
            posY: Number(rawItem?.pos_y ?? 0),
            width: Number(rawItem?.width ?? 150),
            height: Number(rawItem?.height ?? 150),
            zIndex: Number(rawItem?.z_index ?? insertedCount),
          },
          type: QueryTypes.INSERT,
          transaction,
        }
      );
      insertedCount += 1;
    }

    await transaction.commit();
    res.json({
      ok: true,
      data: {
        inserted_count: insertedCount,
        skipped_products: skippedProducts,
        canvas_width: template.canvas_width,
        canvas_height: template.canvas_height,
        background_color: template.background_color,
        background_style: template.background_style,
        background_image_url: template.background_image_url,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("[collections] applyCollectionTemplate:", error);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

export const togglePublish: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const collectionId = Number(req.params.id);
    const owned = await assertOwnership(collectionId, user.id);
    if (!owned) {
      res.status(404).json({ ok: false, message: "Colección no encontrada" });
      return;
    }

    const rows = await sequelize.query<{ status: "draft" | "published" }>(
      `
      UPDATE collections
      SET
        status = CASE WHEN status = 'published' THEN 'draft' ELSE 'published' END,
        updated_at = NOW()
      WHERE id = :collectionId
      RETURNING status
      `,
      {
        replacements: { collectionId },
        type: QueryTypes.SELECT,
      }
    );

    res.json({ ok: true, data: { status: rows[0]?.status ?? "draft" } });
  } catch (error) {
    console.error("[collections] togglePublish:", error);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

export const deleteCollection: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const collectionId = Number(req.params.id);
    const owned = await assertOwnership(collectionId, user.id);
    if (!owned) {
      res.status(404).json({ ok: false, message: "Colección no encontrada" });
      return;
    }

    await sequelize.query(
      `DELETE FROM collections WHERE id = :collectionId`,
      {
        replacements: { collectionId },
        type: QueryTypes.DELETE,
      }
    );

    res.json({ ok: true });
  } catch (error) {
    console.error("[collections] deleteCollection:", error);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

export const addItem: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const collectionId = Number(req.params.id);
    const owned = await assertOwnership(collectionId, user.id);
    if (!owned) {
      res.status(404).json({ ok: false, message: "Colección no encontrada" });
      return;
    }

    const productId = typeof req.body?.product_id === "string" ? req.body.product_id.trim() : "";
    if (!productId) {
      res.status(400).json({ ok: false, message: "product_id es requerido" });
      return;
    }

    const validProducts = await validateSellerProducts([productId], user.id);
    if (!validProducts.length) {
      res.status(400).json({ ok: false, message: "Producto no válido para esta colección" });
      return;
    }

    const currentRows = await sequelize.query<{ next_index: number }>(
      `
      SELECT COALESCE(MAX(z_index), -1) + 1 AS next_index
      FROM collection_items
      WHERE collection_id = :collectionId
        AND (element_type = 'product' OR element_type IS NULL)
      `,
      {
        replacements: { collectionId },
        type: QueryTypes.SELECT,
      }
    );

    const nextIndex = Number(currentRows[0]?.next_index ?? 0);

    const rows = await sequelize.query<{ id: number }>(
      `
      INSERT INTO collection_items
        (collection_id, product_id, element_type, content, pos_x, pos_y, width, height, z_index, created_at, updated_at)
      VALUES
        (:collectionId, :productId, 'product', NULL, 0, 0, 0, 0, :zIndex, NOW(), NOW())
      RETURNING id
      `,
      {
        replacements: {
          collectionId,
          productId,
          zIndex: nextIndex,
        },
        type: QueryTypes.SELECT,
      }
    );

    res.status(201).json({ ok: true, data: { id: rows[0]?.id } });
  } catch (error) {
    console.error("[collections] addItem:", error);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

export const updateItem: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const collectionId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const owned = await assertOwnership(collectionId, user.id);
    if (!owned) {
      res.status(404).json({ ok: false, message: "Colección no encontrada" });
      return;
    }

    const zIndex = req.body?.z_index;
    const productId = typeof req.body?.product_id === "string" ? req.body.product_id.trim() : undefined;

    if (productId) {
      const validProducts = await validateSellerProducts([productId], user.id);
      if (!validProducts.length) {
        res.status(400).json({ ok: false, message: "Producto no válido para esta colección" });
        return;
      }
    }

    await sequelize.query(
      `
      UPDATE collection_items
      SET
        product_id = CASE WHEN :hasProductId THEN :productId ELSE product_id END,
        z_index = COALESCE(:zIndex, z_index),
        updated_at = NOW()
      WHERE id = :itemId
        AND collection_id = :collectionId
        AND (element_type = 'product' OR element_type IS NULL)
      `,
      {
        replacements: {
          itemId,
          collectionId,
          hasProductId: Boolean(productId),
          productId: productId ?? null,
          zIndex: typeof zIndex === "number" ? zIndex : null,
        },
        type: QueryTypes.UPDATE,
      }
    );

    res.json({ ok: true });
  } catch (error) {
    console.error("[collections] updateItem:", error);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

export const removeItem: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const collectionId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const owned = await assertOwnership(collectionId, user.id);
    if (!owned) {
      res.status(404).json({ ok: false, message: "Colección no encontrada" });
      return;
    }

    await sequelize.query(
      `
      DELETE FROM collection_items
      WHERE id = :itemId
        AND collection_id = :collectionId
        AND (element_type = 'product' OR element_type IS NULL)
      `,
      {
        replacements: { itemId, collectionId },
        type: QueryTypes.DELETE,
      }
    );

    res.json({ ok: true });
  } catch (error) {
    console.error("[collections] removeItem:", error);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

export const uploadCollectionImage: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const collectionId = Number(req.params.id);
    const owned = await assertOwnership(collectionId, user.id);
    if (!owned) {
      res.status(404).json({ ok: false, message: "Colección no encontrada" });
      return;
    }

    const file = (req as { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ ok: false, message: "No se recibió ninguna imagen" });
      return;
    }

    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.mimetype)) {
      res.status(400).json({ ok: false, message: "Formato no permitido (jpg, png, webp, gif)" });
      return;
    }

    const ext = file.originalname.split(".").pop() ?? "jpg";
    const fileName = `collections/${collectionId}/${uuidv4()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("colecciones_imagenes")
      .upload(fileName, file.buffer, { contentType: file.mimetype });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage.from("colecciones_imagenes").getPublicUrl(fileName);

    await sequelize.query(
      `
      UPDATE collections
      SET
        promo_image_url = :promoImageUrl,
        background_image_url = :promoImageUrl,
        updated_at = NOW()
      WHERE id = :collectionId
      `,
      {
        replacements: {
          collectionId,
          promoImageUrl: data.publicUrl,
        },
        type: QueryTypes.UPDATE,
      }
    );

    res.status(201).json({ ok: true, url: data.publicUrl, promo_image_url: data.publicUrl });
  } catch (error) {
    console.error("[collections] uploadCollectionImage:", error);
    res.status(500).json({ ok: false, message: "Error al subir imagen" });
  }
};

export const getPublicCollectionsBySellerId: RequestHandler = async (req, res): Promise<void> => {
  try {
    const sellerId = Number(req.params.sellerId);
    if (!sellerId || Number.isNaN(sellerId)) {
      res.status(400).json({ ok: false, message: "sellerId inválido" });
      return;
    }

    const data = await getPublishedCollectionsByQuery(
      { sellerId },
      `WHERE c.seller_id = :sellerId AND c.status = 'published'`
    );

    res.json({ ok: true, data });
  } catch (error) {
    console.error("[collections] getPublicCollectionsBySellerId:", error);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

export const getPublicCollections: RequestHandler = async (req, res): Promise<void> => {
  try {
    const { slug } = req.params;

    const data = await getPublishedCollectionsByQuery(
      { slug },
      `
      JOIN vendedor_perfil vp ON vp.user_id = c.seller_id
      WHERE vp.slug = :slug
        AND c.status = 'published'
      `
    );

    res.json({ ok: true, data });
  } catch (error) {
    console.error("[collections] getPublicCollections:", error);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};
