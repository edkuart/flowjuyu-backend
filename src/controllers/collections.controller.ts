// src/controllers/collections.controller.ts

import { RequestHandler } from "express";
import { sequelize } from "../config/db";
import { QueryTypes } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import supabase from "../lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: verify that a collection belongs to the requesting seller
// ─────────────────────────────────────────────────────────────────────────────
async function assertOwnership(
  collectionId: number,
  sellerId: number
): Promise<boolean> {
  const rows = await sequelize.query<{ id: number }>(
    `SELECT id FROM collections WHERE id = :id AND seller_id = :sellerId LIMIT 1`,
    { replacements: { id: collectionId, sellerId }, type: QueryTypes.SELECT }
  );
  return rows.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/collections
// Returns all collections for the authenticated seller
// ─────────────────────────────────────────────────────────────────────────────
export const getMyCollections: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user) { res.status(401).json({ ok: false, message: "No autenticado" }); return; }

    const collections = await sequelize.query<{
      id: number;
      name: string;
      description: string | null;
      status: string;
      background_color: string;
      background_image_url: string | null;
      canvas_width: number;
      canvas_height: number;
      created_at: Date;
      updated_at: Date;
      item_count: number;
    }>(
      `
      SELECT
        c.id,
        c.name,
        c.description,
        c.status,
        c.background_color,
        c.background_image_url,
        c.canvas_width,
        c.canvas_height,
        c.created_at,
        c.updated_at,
        COUNT(ci.id)::int AS item_count
      FROM collections c
      LEFT JOIN collection_items ci ON ci.collection_id = c.id
      WHERE c.seller_id = :sellerId
      GROUP BY c.id
      ORDER BY c.created_at DESC
      `,
      { replacements: { sellerId: user.id }, type: QueryTypes.SELECT }
    );

    res.json({ ok: true, data: collections });
  } catch (err) {
    console.error("[collections] getMyCollections:", err);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/collections/:id
// Returns one collection with its items and product data
// ─────────────────────────────────────────────────────────────────────────────
export const getCollectionById: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user) { res.status(401).json({ ok: false, message: "No autenticado" }); return; }

    const collectionId = Number(req.params.id);

    const [collection] = await sequelize.query<{
      id: number; name: string; description: string | null;
      status: string; background_color: string; background_image_url: string | null;
      canvas_width: number; canvas_height: number;
      created_at: Date; updated_at: Date;
    }>(
      `SELECT * FROM collections WHERE id = :id AND seller_id = :sellerId LIMIT 1`,
      { replacements: { id: collectionId, sellerId: user.id }, type: QueryTypes.SELECT }
    );

    if (!collection) { res.status(404).json({ ok: false, message: "Colección no encontrada" }); return; }

    const items = await sequelize.query<{
      id: number; element_type: string; content: any;
      product_id: string | null;
      pos_x: number; pos_y: number; width: number; height: number; z_index: number;
      product_name: string | null; product_image: string | null; product_price: number | null;
    }>(
      `
      SELECT
        ci.id,
        ci.element_type,
        ci.content,
        ci.product_id,
        ci.pos_x,
        ci.pos_y,
        ci.width,
        ci.height,
        ci.z_index,
        p.nombre     AS product_name,
        p.imagen_url AS product_image,
        p.precio     AS product_price
      FROM collection_items ci
      LEFT JOIN productos p ON p.id = ci.product_id
      WHERE ci.collection_id = :collectionId
      ORDER BY ci.z_index ASC
      `,
      { replacements: { collectionId }, type: QueryTypes.SELECT }
    );

    res.json({ ok: true, data: { ...collection, items } });
  } catch (err) {
    console.error("[collections] getCollectionById:", err);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/collections
// Creates a new draft collection
// ─────────────────────────────────────────────────────────────────────────────
export const createCollection: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user) { res.status(401).json({ ok: false, message: "No autenticado" }); return; }

    const {
      name,
      description = null,
      background_color = "#FFFFFF",
      background_image_url = null,
      canvas_width = 800,
      canvas_height = 600,
    } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({ ok: false, message: "El nombre es requerido" });
      return;
    }

    const [result] = await sequelize.query<{ id: number }>(
      `
      INSERT INTO collections
        (seller_id, name, description, background_color, background_image_url, canvas_width, canvas_height, status, created_at, updated_at)
      VALUES
        (:sellerId, :name, :description, :backgroundColor, :backgroundImageUrl, :canvasWidth, :canvasHeight, 'draft', NOW(), NOW())
      RETURNING id
      `,
      {
        replacements: {
          sellerId: user.id,
          name: name.trim().slice(0, 120),
          description,
          backgroundColor: background_color,
          backgroundImageUrl: background_image_url,
          canvasWidth: canvas_width,
          canvasHeight: canvas_height,
        },
        type: QueryTypes.SELECT,
      }
    );

    res.status(201).json({ ok: true, data: { id: result.id } });
  } catch (err) {
    console.error("[collections] createCollection:", err);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/collections/:id
// Updates collection metadata and canvas settings
// ─────────────────────────────────────────────────────────────────────────────
export const updateCollection: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user) { res.status(401).json({ ok: false, message: "No autenticado" }); return; }

    const collectionId = Number(req.params.id);
    const owned = await assertOwnership(collectionId, user.id);
    if (!owned) { res.status(404).json({ ok: false, message: "Colección no encontrada" }); return; }

    const {
      name,
      description,
      background_color,
      background_image_url,
      background_style,
      canvas_width,
      canvas_height,
    } = req.body;

    await sequelize.query(
      `
      UPDATE collections SET
        name                 = COALESCE(:name, name),
        description          = COALESCE(:description, description),
        background_color     = COALESCE(:backgroundColor, background_color),
        background_image_url = COALESCE(:backgroundImageUrl, background_image_url),
        background_style     = CASE WHEN :hasStyle THEN :backgroundStyle ELSE background_style END,
        canvas_width         = COALESCE(:canvasWidth, canvas_width),
        canvas_height        = COALESCE(:canvasHeight, canvas_height),
        updated_at           = NOW()
      WHERE id = :id
      `,
      {
        replacements: {
          id: collectionId,
          name: name ? String(name).trim().slice(0, 120) : null,
          description: description ?? null,
          backgroundColor: background_color ?? null,
          backgroundImageUrl: background_image_url ?? null,
          hasStyle: background_style !== undefined,
          backgroundStyle: background_style ?? null,
          canvasWidth: canvas_width ?? null,
          canvasHeight: canvas_height ?? null,
        },
        type: QueryTypes.UPDATE,
      }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("[collections] updateCollection:", err);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/collections/:id/publish
// Toggles status between draft and published
// ─────────────────────────────────────────────────────────────────────────────
export const togglePublish: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user) { res.status(401).json({ ok: false, message: "No autenticado" }); return; }

    const collectionId = Number(req.params.id);
    const owned = await assertOwnership(collectionId, user.id);
    if (!owned) { res.status(404).json({ ok: false, message: "Colección no encontrada" }); return; }

    const [updated] = await sequelize.query<{ status: string }>(
      `
      UPDATE collections
      SET status = CASE WHEN status = 'published' THEN 'draft' ELSE 'published' END,
          updated_at = NOW()
      WHERE id = :id
      RETURNING status
      `,
      { replacements: { id: collectionId }, type: QueryTypes.SELECT }
    );

    res.json({ ok: true, data: { status: updated.status } });
  } catch (err) {
    console.error("[collections] togglePublish:", err);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/collections/:id
// Deletes a collection and all its items (CASCADE)
// ─────────────────────────────────────────────────────────────────────────────
export const deleteCollection: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user) { res.status(401).json({ ok: false, message: "No autenticado" }); return; }

    const collectionId = Number(req.params.id);
    const owned = await assertOwnership(collectionId, user.id);
    if (!owned) { res.status(404).json({ ok: false, message: "Colección no encontrada" }); return; }

    await sequelize.query(
      `DELETE FROM collections WHERE id = :id`,
      { replacements: { id: collectionId }, type: QueryTypes.DELETE }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("[collections] deleteCollection:", err);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/collections/:id/items
// Adds a product to the canvas
// ─────────────────────────────────────────────────────────────────────────────
export const addItem: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user) { res.status(401).json({ ok: false, message: "No autenticado" }); return; }

    const collectionId = Number(req.params.id);
    const owned = await assertOwnership(collectionId, user.id);
    if (!owned) { res.status(404).json({ ok: false, message: "Colección no encontrada" }); return; }

    const {
      product_id = null,
      element_type = "product",
      content = null,
      pos_x = 50,
      pos_y = 50,
      width = 150,
      height = 150,
      z_index = 0,
    } = req.body;

    const validTypes = ["product", "text", "shape", "image"];
    if (!validTypes.includes(element_type)) {
      res.status(400).json({ ok: false, message: "element_type inválido" });
      return;
    }

    if (element_type === "product") {
      if (!product_id) {
        res.status(400).json({ ok: false, message: "product_id es requerido para tipo producto" });
        return;
      }
      const [product] = await sequelize.query<{ id: string }>(
        `SELECT id FROM productos WHERE id = :productId AND vendedor_id = :sellerId AND activo = true LIMIT 1`,
        { replacements: { productId: product_id, sellerId: user.id }, type: QueryTypes.SELECT }
      );
      if (!product) {
        res.status(400).json({ ok: false, message: "Producto no válido para esta colección" });
        return;
      }
    }

    const [item] = await sequelize.query<{ id: number }>(
      `
      INSERT INTO collection_items
        (collection_id, product_id, element_type, content, pos_x, pos_y, width, height, z_index, created_at, updated_at)
      VALUES
        (:collectionId, :productId, :elementType, CAST(:content AS jsonb), :posX, :posY, :width, :height, :zIndex, NOW(), NOW())
      RETURNING id
      `,
      {
        replacements: {
          collectionId,
          productId: product_id,
          elementType: element_type,
          content: content !== null ? JSON.stringify(content) : null,
          posX: pos_x,
          posY: pos_y,
          width,
          height,
          zIndex: z_index,
        },
        type: QueryTypes.SELECT,
      }
    );

    res.status(201).json({ ok: true, data: { id: item.id } });
  } catch (err) {
    console.error("[collections] addItem:", err);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/collections/:id/items/:itemId
// Updates position/size of a canvas item
// ─────────────────────────────────────────────────────────────────────────────
export const updateItem: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user) { res.status(401).json({ ok: false, message: "No autenticado" }); return; }

    const collectionId = Number(req.params.id);
    const itemId = Number(req.params.itemId);

    const owned = await assertOwnership(collectionId, user.id);
    if (!owned) { res.status(404).json({ ok: false, message: "Colección no encontrada" }); return; }

    const { pos_x, pos_y, width, height, z_index, content } = req.body;

    await sequelize.query(
      `
      UPDATE collection_items SET
        pos_x      = COALESCE(:posX, pos_x),
        pos_y      = COALESCE(:posY, pos_y),
        width      = COALESCE(:width, width),
        height     = COALESCE(:height, height),
        z_index    = COALESCE(:zIndex, z_index),
        content    = CASE WHEN :contentJson IS NULL THEN content ELSE CAST(:contentJson AS jsonb) END,
        updated_at = NOW()
      WHERE id = :itemId AND collection_id = :collectionId
      `,
      {
        replacements: {
          itemId,
          collectionId,
          posX: pos_x ?? null,
          posY: pos_y ?? null,
          width: width ?? null,
          height: height ?? null,
          zIndex: z_index ?? null,
          contentJson: content !== undefined ? JSON.stringify(content) : null,
        },
        type: QueryTypes.UPDATE,
      }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("[collections] updateItem:", err);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/collections/:id/items/:itemId
// Removes a product from the canvas
// ─────────────────────────────────────────────────────────────────────────────
export const removeItem: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user) { res.status(401).json({ ok: false, message: "No autenticado" }); return; }

    const collectionId = Number(req.params.id);
    const itemId = Number(req.params.itemId);

    const owned = await assertOwnership(collectionId, user.id);
    if (!owned) { res.status(404).json({ ok: false, message: "Colección no encontrada" }); return; }

    await sequelize.query(
      `DELETE FROM collection_items WHERE id = :itemId AND collection_id = :collectionId`,
      { replacements: { itemId, collectionId }, type: QueryTypes.DELETE }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("[collections] removeItem:", err);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/collections/:id/images
// Uploads an image to Supabase and returns its public URL.
// Used by the collection editor to add image elements to the canvas.
// ─────────────────────────────────────────────────────────────────────────────
export const uploadCollectionImage: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user) { res.status(401).json({ ok: false, message: "No autenticado" }); return; }

    const collectionId = Number(req.params.id);
    const owned = await assertOwnership(collectionId, user.id);
    if (!owned) { res.status(404).json({ ok: false, message: "Colección no encontrada" }); return; }

    const file = (req as any).file as Express.Multer.File | undefined;
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

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from("colecciones_imagenes")
      .getPublicUrl(fileName);

    res.status(201).json({ ok: true, url: publicUrlData.publicUrl });
  } catch (err) {
    console.error("[collections] uploadCollectionImage:", err);
    res.status(500).json({ ok: false, message: "Error al subir imagen" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/collections/public/seller/:sellerId
// Public: returns published collections by numeric seller user_id
// Used by the store frontend which only has seller.id (user id)
// ─────────────────────────────────────────────────────────────────────────────
export const getPublicCollectionsBySellerId: RequestHandler = async (req, res): Promise<void> => {
  try {
    const sellerId = Number(req.params.sellerId);
    if (!sellerId || isNaN(sellerId)) {
      res.status(400).json({ ok: false, message: "sellerId inválido" });
      return;
    }

    const collections = await sequelize.query<{
      id: number; name: string; description: string | null;
      background_color: string; background_image_url: string | null;
      background_style: string | null;
      canvas_width: number; canvas_height: number; created_at: Date;
      items: any;
    }>(
      `
      SELECT
        c.id,
        c.name,
        c.description,
        c.background_color,
        c.background_image_url,
        c.background_style,
        c.canvas_width,
        c.canvas_height,
        c.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id',            ci.id,
              'element_type',  ci.element_type,
              'content',       ci.content,
              'product_id',    ci.product_id,
              'pos_x',         ci.pos_x,
              'pos_y',         ci.pos_y,
              'width',         ci.width,
              'height',        ci.height,
              'z_index',       ci.z_index,
              'product_name',  p.nombre,
              'product_image', p.imagen_url,
              'product_price', p.precio,
              'internal_code', p.internal_code
            ) ORDER BY ci.z_index ASC
          ) FILTER (WHERE ci.id IS NOT NULL),
          '[]'
        ) AS items
      FROM collections c
      LEFT JOIN collection_items ci ON ci.collection_id = c.id
      LEFT JOIN productos p ON p.id = ci.product_id
      WHERE c.seller_id = :sellerId
        AND c.status = 'published'
      GROUP BY c.id
      ORDER BY c.created_at DESC
      `,
      { replacements: { sellerId }, type: QueryTypes.SELECT }
    );

    res.json({ ok: true, data: collections });
  } catch (err) {
    console.error("[collections] getPublicCollectionsBySellerId:", err);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/collections/public/:slug
// Public: returns published collections for a seller profile page
// ─────────────────────────────────────────────────────────────────────────────
export const getPublicCollections: RequestHandler = async (req, res): Promise<void> => {
  try {
    const { slug } = req.params;

    const collections = await sequelize.query<{
      id: number; name: string; description: string | null;
      background_color: string; background_image_url: string | null;
      background_style: string | null;
      canvas_width: number; canvas_height: number; created_at: Date;
      items: any;
    }>(
      `
      SELECT
        c.id,
        c.name,
        c.description,
        c.background_color,
        c.background_image_url,
        c.background_style,
        c.canvas_width,
        c.canvas_height,
        c.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id',            ci.id,
              'element_type',  ci.element_type,
              'content',       ci.content,
              'product_id',    ci.product_id,
              'pos_x',         ci.pos_x,
              'pos_y',         ci.pos_y,
              'width',         ci.width,
              'height',        ci.height,
              'z_index',       ci.z_index,
              'product_name',  p.nombre,
              'product_image', p.imagen_url,
              'product_price', p.precio,
              'internal_code', p.internal_code
            ) ORDER BY ci.z_index ASC
          ) FILTER (WHERE ci.id IS NOT NULL),
          '[]'
        ) AS items
      FROM collections c
      JOIN vendedor_perfil vp ON vp.user_id = c.seller_id
      LEFT JOIN collection_items ci ON ci.collection_id = c.id
      LEFT JOIN productos p ON p.id = ci.product_id
      WHERE vp.slug = :slug
        AND c.status = 'published'
      GROUP BY c.id
      ORDER BY c.created_at DESC
      `,
      { replacements: { slug }, type: QueryTypes.SELECT }
    );

    res.json({ ok: true, data: collections });
  } catch (err) {
    console.error("[collections] getPublicCollections:", err);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};
