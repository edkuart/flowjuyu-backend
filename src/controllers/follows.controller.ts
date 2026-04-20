// src/controllers/follows.controller.ts

import { RequestHandler } from "express";
import { QueryTypes } from "sequelize";
import { sequelize } from "../config/db";
import { emitAppEvent } from "../lib/appEvents";

// ── helpers ────────────────────────────────────────────────────────────────────

function parseSellerId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* ============================================================
   ➕ FOLLOW SELLER
   POST /api/follows/sellers/:sellerId

   Idempotent: calling twice returns { wasAlreadyFollowing: true }.
   Response 201 on new follow, 200 if already following.
============================================================ */
export const followSeller: RequestHandler = async (req, res) => {
  const userId   = (req as any).user?.id as number;
  const sellerId = parseSellerId(req.params.sellerId as string);

  if (!sellerId) {
    res.status(400).json({ message: "ID de vendedor inválido" });
    return;
  }

  // Application-level self-follow guard (DB constraint is the safety net)
  if (userId === sellerId) {
    res.status(400).json({ message: "No puedes seguirte a ti mismo" });
    return;
  }

  try {
    // 1. Verify the target user exists and is a seller
    const [seller] = await sequelize.query<{ id: number }>(
      `SELECT id FROM users WHERE id = :sellerId AND rol = 'seller' LIMIT 1`,
      { replacements: { sellerId }, type: QueryTypes.SELECT }
    );

    if (!seller) {
      res.status(404).json({ message: "Vendedor no encontrado" });
      return;
    }

    // 2. INSERT — ON CONFLICT DO NOTHING makes this idempotent at DB level.
    //    RETURNING only comes back when a row is actually inserted.
    const rows = await sequelize.query<{ id: string }>(
      `
      INSERT INTO seller_follows (follower_user_id, seller_user_id)
      VALUES (:userId, :sellerId)
      ON CONFLICT (follower_user_id, seller_user_id) DO NOTHING
      RETURNING id
      `,
      { replacements: { userId, sellerId }, type: QueryTypes.SELECT }
    );

    const wasAlreadyFollowing = rows.length === 0;

    // 3. Emit event only on a genuine new follow
    if (!wasAlreadyFollowing) {
      emitAppEvent("seller.followed", {
        followerUserId: userId,
        sellerUserId:   sellerId,
      });
    }

    res
      .status(wasAlreadyFollowing ? 200 : 201)
      .json({ success: true, followed: true, wasAlreadyFollowing });
  } catch (err) {
    console.error("followSeller error:", err);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ============================================================
   ➖ UNFOLLOW SELLER
   DELETE /api/follows/sellers/:sellerId
============================================================ */
export const unfollowSeller: RequestHandler = async (req, res) => {
  const userId   = (req as any).user?.id as number;
  const sellerId = parseSellerId(req.params.sellerId as string);

  if (!sellerId) {
    res.status(400).json({ message: "ID de vendedor inválido" });
    return;
  }

  try {
    // RETURNING id lets us detect whether a row existed without a prior SELECT
    const rows = await sequelize.query<{ id: string }>(
      `
      DELETE FROM seller_follows
      WHERE follower_user_id = :userId AND seller_user_id = :sellerId
      RETURNING id
      `,
      { replacements: { userId, sellerId }, type: QueryTypes.SELECT }
    );

    const wasFollowing = rows.length > 0;

    if (wasFollowing) {
      emitAppEvent("seller.unfollowed", {
        followerUserId: userId,
        sellerUserId:   sellerId,
      });
    }

    res.json({ success: true, unfollowed: true, wasFollowing });
  } catch (err) {
    console.error("unfollowSeller error:", err);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ============================================================
   🔕 MUTE / UNMUTE SELLER NOTIFICATIONS
   PATCH /api/follows/sellers/:sellerId/mute
   Body: { mute: boolean }
============================================================ */
export const muteFollowedSeller: RequestHandler = async (req, res) => {
  const userId   = (req as any).user?.id as number;
  const sellerId = parseSellerId(req.params.sellerId as string);
  const { mute } = req.body;

  if (!sellerId) {
    res.status(400).json({ message: "ID de vendedor inválido" });
    return;
  }

  if (typeof mute !== "boolean") {
    res.status(400).json({ message: "El campo 'mute' debe ser un booleano" });
    return;
  }

  try {
    const rows = await sequelize.query<{ notifications_enabled: boolean }>(
      `
      UPDATE seller_follows
      SET    notifications_enabled = :enabled
      WHERE  follower_user_id = :userId AND seller_user_id = :sellerId
      RETURNING notifications_enabled
      `,
      {
        replacements: { userId, sellerId, enabled: !mute },
        type: QueryTypes.SELECT,
      }
    );

    if (rows.length === 0) {
      res.status(404).json({ message: "No sigues a este vendedor" });
      return;
    }

    res.json({
      success: true,
      notifications_enabled: rows[0].notifications_enabled,
    });
  } catch (err) {
    console.error("muteFollowedSeller error:", err);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ============================================================
   📋 LIST FOLLOWED SELLERS
   GET /api/follows/sellers
   Returns up to 50 sellers the authenticated buyer follows.
============================================================ */
export const getFollowedSellers: RequestHandler = async (req, res) => {
  const userId = (req as any).user?.id as number;

  try {
    const rows = await sequelize.query<{
      seller_user_id:        number;
      nombre:                string;
      nombre_comercio:       string;
      logo:                  string | null;
      departamento:          string | null;
      municipio:             string | null;
      notifications_enabled: boolean;
      following_since:       string;
    }>(
      `
      SELECT
        vp.user_id          AS seller_user_id,
        vp.nombre,
        vp.nombre_comercio,
        vp.logo,
        vp.departamento,
        vp.municipio,
        sf.notifications_enabled,
        sf.created_at       AS following_since
      FROM  seller_follows sf
      JOIN  vendedor_perfil vp ON vp.user_id = sf.seller_user_id
      WHERE sf.follower_user_id = :userId
      ORDER BY sf.created_at DESC
      LIMIT 50
      `,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );

    res.json({ success: true, data: rows, total: rows.length });
  } catch (err) {
    console.error("getFollowedSellers error:", err);
    res.status(500).json({ message: "Error interno" });
  }
};
