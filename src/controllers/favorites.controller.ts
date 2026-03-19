// src/controllers/favorites.controller.ts

import { RequestHandler } from "express";
import { sequelize } from "../config/db";
import { QueryTypes } from "sequelize";
import { createNotification } from "../utils/notifications";
import { notifySimilarProducts } from "../services/suggestions.service";

/* ============================================================
   ❤️ GET USER FAVORITES
   GET /api/favorites
============================================================ */
export const getFavorites: RequestHandler = async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) { res.status(401).json({ message: "No autenticado" }); return; }

    const favorites = await sequelize.query<{
      id: number;
      product_id: string | null;
      seller_id: number | null;
      product_nombre: string | null;
      product_imagen: string | null;
      product_precio: string | null;
      seller_nombre: string | null;
      seller_logo: string | null;
      created_at: string;
    }>(
      `
      SELECT
        f.id,
        f.product_id,
        f.seller_id,
        p.nombre        AS product_nombre,
        p.imagen_url    AS product_imagen,
        p.precio::text  AS product_precio,
        vp.nombre_comercio AS seller_nombre,
        vp.logo            AS seller_logo,
        f.created_at
      FROM favorites f
      LEFT JOIN productos       p  ON p.id  = f.product_id
      LEFT JOIN vendedor_perfil vp ON vp.id = f.seller_id
      WHERE f.user_id = :userId
      ORDER BY f.created_at DESC
      `,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );

    res.json({ success: true, data: favorites });
  } catch (err) {
    console.error("getFavorites error:", err);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ============================================================
   ❤️ CHECK IF FAVORITED
   GET /api/favorites/check?product_id=&seller_id=
============================================================ */
export const checkFavorite: RequestHandler = async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) { res.json({ favorited: false }); return; }

    const { product_id, seller_id } = req.query;

    const [row] = await sequelize.query<{ id: number }>(
      `
      SELECT id FROM favorites
      WHERE user_id = :userId
        AND (
          (:productId IS NOT NULL AND product_id = :productId)
          OR
          (:sellerId  IS NOT NULL AND seller_id  = :sellerId)
        )
      LIMIT 1
      `,
      {
        replacements: {
          userId,
          productId: product_id || null,
          sellerId:  seller_id  ? Number(seller_id) : null,
        },
        type: QueryTypes.SELECT,
      }
    );

    res.json({ success: true, favorited: !!row, favoriteId: row?.id ?? null });
  } catch (err) {
    console.error("checkFavorite error:", err);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ============================================================
   ❤️ ADD FAVORITE
   POST /api/favorites
   Body: { product_id? , seller_id? }
============================================================ */
export const addFavorite: RequestHandler = async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) { res.status(401).json({ message: "No autenticado" }); return; }

    const { product_id, seller_id } = req.body;

    if (!product_id && !seller_id) {
      res.status(400).json({ message: "Proporciona product_id o seller_id" });
      return;
    }

    // Upsert (ignore duplicates)
    const [result] = await sequelize.query<{ id: number }>(
      `
      INSERT INTO favorites (user_id, product_id, seller_id)
      VALUES (:userId, :productId, :sellerId)
      ON CONFLICT DO NOTHING
      RETURNING id
      `,
      {
        replacements: {
          userId,
          productId: product_id || null,
          sellerId:  seller_id ? Number(seller_id) : null,
        },
        type: QueryTypes.SELECT,
      }
    );

    // Only notify on a genuine new insert — ON CONFLICT DO NOTHING returns
    // no row when the favorite already existed, so result is undefined then.
    if (result?.id) {
      await createNotification(
        userId,
        "favorite",
        "Guardaste una pieza",
        "La encontrarás en tus favoritos.",
        "/buyer/favorites"
      );

      // Fire suggestion in background — non-blocking, never throws
      if (product_id) {
        notifySimilarProducts(userId, product_id).catch(() => {});
      }
    }

    res.status(201).json({ success: true, id: result?.id ?? null });
  } catch (err) {
    console.error("addFavorite error:", err);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ============================================================
   💔 REMOVE FAVORITE
   DELETE /api/favorites/:id
============================================================ */
export const removeFavorite: RequestHandler = async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) { res.status(401).json({ message: "No autenticado" }); return; }

    const { id } = req.params;

    await sequelize.query(
      `DELETE FROM favorites WHERE id = :id AND user_id = :userId`,
      { replacements: { id: Number(id), userId } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("removeFavorite error:", err);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ============================================================
   💔 REMOVE FAVORITE BY REFERENCE
   DELETE /api/favorites  Body: { product_id? , seller_id? }
============================================================ */
export const removeFavoriteByRef: RequestHandler = async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) { res.status(401).json({ message: "No autenticado" }); return; }

    const { product_id, seller_id } = req.body;

    await sequelize.query(
      `
      DELETE FROM favorites
      WHERE user_id = :userId
        AND (
          (:productId IS NOT NULL AND product_id = :productId)
          OR
          (:sellerId  IS NOT NULL AND seller_id  = :sellerId)
        )
      `,
      {
        replacements: {
          userId,
          productId: product_id || null,
          sellerId:  seller_id ? Number(seller_id) : null,
        },
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("removeFavoriteByRef error:", err);
    res.status(500).json({ message: "Error interno" });
  }
};
