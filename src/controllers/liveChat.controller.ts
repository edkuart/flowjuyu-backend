import type { RequestHandler } from "express";
import { QueryTypes } from "sequelize";

import { sequelize } from "../config/db";
import {
  addLiveChatConnection,
  pushLiveChatMessage,
  removeLiveChatConnection,
} from "../lib/liveChatRegistry";

const MESSAGE_MAX = 240;
const MESSAGE_LIMIT = 50;
const MESSAGE_COOLDOWN_MS = 8_000;
const SELLER_MESSAGE_LIMIT = 100;
const ALLOWED_SLOW_MODE_VALUES = new Set([0, 15, 30, 60]);

async function isSellerLive(sellerId: number): Promise<boolean> {
  const rows = (await sequelize.query(
    `
    SELECT 1
    FROM vendedor_perfil
    WHERE user_id = :sellerId
      AND is_live = true
    LIMIT 1
    `,
    {
      replacements: { sellerId },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ "?column?": number }>;

  return rows.length > 0;
}

async function getSellerLiveChatSettings(sellerId: number): Promise<{
  slowModeSeconds: number;
  pinnedMessage: string | null;
}> {
  const rows = (await sequelize.query(
    `
    SELECT live_chat_slow_mode_seconds, live_chat_pinned_message
    FROM vendedor_perfil
    WHERE user_id = :sellerId
    LIMIT 1
    `,
    {
      replacements: { sellerId },
      type: QueryTypes.SELECT,
    },
  )) as Array<{
    live_chat_slow_mode_seconds: number | null;
    live_chat_pinned_message: string | null;
  }>;

  return {
    slowModeSeconds: Number(rows[0]?.live_chat_slow_mode_seconds ?? 0) || 0,
    pinnedMessage:
      typeof rows[0]?.live_chat_pinned_message === "string"
        ? rows[0].live_chat_pinned_message.trim() || null
        : null,
  };
}

function normalizeMessage(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
}

export const listLiveChatMessages: RequestHandler = async (req, res) => {
  try {
    const sellerId = Number(req.params.sellerId);

    if (!Number.isInteger(sellerId) || sellerId <= 0) {
      res.status(400).json({ success: false, message: "sellerId inválido" });
      return;
    }

    const settings = await getSellerLiveChatSettings(sellerId);
    const rows = (await sequelize.query(
      `
      SELECT
        id::text,
        seller_id,
        user_id,
        buyer_name,
        sender_role,
        message,
        created_at
      FROM live_chat_messages
      WHERE seller_id = :sellerId
        AND status = 'visible'
      ORDER BY created_at DESC
      LIMIT :limit
      `,
      {
        replacements: {
          sellerId,
          limit: MESSAGE_LIMIT,
        },
        type: QueryTypes.SELECT,
      },
    )) as Array<{
      id: string;
      seller_id: number;
      user_id: number;
      buyer_name: string;
      sender_role: "buyer" | "seller";
      message: string;
      created_at: string;
    }>;

    res.json({
      success: true,
      data: rows.reverse().map((row) => ({
        id: row.id,
        seller_id: Number(row.seller_id),
        user_id: Number(row.user_id),
        buyer_name: row.buyer_name,
        sender_role: row.sender_role === "seller" ? "seller" : "buyer",
        message: row.message,
        created_at: row.created_at,
      })),
      meta: {
        slow_mode_seconds: settings.slowModeSeconds,
        pinned_message: settings.pinnedMessage,
      },
    });
  } catch (error) {
    console.error("listLiveChatMessages error:", error);
    res.status(500).json({ success: false, message: "Error interno" });
  }
};

export const streamLiveChatMessages: RequestHandler = async (req, res) => {
  try {
    const sellerId = Number(req.params.sellerId);

    if (!Number.isInteger(sellerId) || sellerId <= 0) {
      res.status(400).json({ success: false, message: "sellerId inválido" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    addLiveChatConnection(sellerId, res);

    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    const keepAlive = setInterval(() => {
      try {
        res.write(`event: ping\ndata: ${Date.now()}\n\n`);
        (res as any).flush?.();
      } catch {
        clearInterval(keepAlive);
      }
    }, 20_000);

    req.on("close", () => {
      clearInterval(keepAlive);
      removeLiveChatConnection(sellerId, res);
    });
  } catch (error) {
    console.error("streamLiveChatMessages error:", error);
    res.status(500).json({ success: false, message: "Error interno" });
  }
};

export const createLiveChatMessage: RequestHandler = async (req, res) => {
  try {
    const buyerId = Number(req.user?.id);
    const role = req.user?.role;
    const sellerId = Number(req.body?.seller_id);
    const message = normalizeMessage(req.body?.message);

    if (!buyerId || role !== "buyer") {
      res.status(403).json({ success: false, message: "Solo compradores pueden comentar" });
      return;
    }

    if (!Number.isInteger(sellerId) || sellerId <= 0) {
      res.status(400).json({ success: false, message: "seller_id inválido" });
      return;
    }

    if (!message) {
      res.status(400).json({ success: false, message: "El mensaje es obligatorio" });
      return;
    }

    if (message.length > MESSAGE_MAX) {
      res.status(400).json({
        success: false,
        message: `El mensaje no puede superar ${MESSAGE_MAX} caracteres`,
      });
      return;
    }

    if (!(await isSellerLive(sellerId))) {
      res.status(400).json({
        success: false,
        message: "La sala live no está activa ahora",
      });
      return;
    }

    const settings = await getSellerLiveChatSettings(sellerId);
    const cooldownMs = Math.max(
      MESSAGE_COOLDOWN_MS,
      settings.slowModeSeconds * 1000,
    );

    const cooldownRows = (await sequelize.query(
      `
      SELECT created_at
      FROM live_chat_messages
      WHERE seller_id = :sellerId
        AND user_id = :buyerId
        AND status = 'visible'
      ORDER BY created_at DESC
      LIMIT 1
      `,
      {
        replacements: {
          sellerId,
          buyerId,
        },
        type: QueryTypes.SELECT,
      },
    )) as Array<{ created_at: string }>;

    if (cooldownRows[0]?.created_at) {
      const lastCreatedAt = new Date(cooldownRows[0].created_at).getTime();
      if (Number.isFinite(lastCreatedAt) && Date.now() - lastCreatedAt < cooldownMs) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((cooldownMs - (Date.now() - lastCreatedAt)) / 1000),
        );
        res.status(429).json({
          success: false,
          message: `Espera ${retryAfterSeconds}s antes de enviar otro mensaje`,
          retry_after_seconds: retryAfterSeconds,
        });
        return;
      }
    }

    const buyerRows = (await sequelize.query(
      `
      SELECT nombre
      FROM users
      WHERE id = :buyerId
        AND rol = 'buyer'
      LIMIT 1
      `,
      {
        replacements: { buyerId },
        type: QueryTypes.SELECT,
      },
    )) as Array<{ nombre: string }>;

    if (!buyerRows.length) {
      res.status(404).json({ success: false, message: "Comprador no encontrado" });
      return;
    }

    const buyerName = buyerRows[0].nombre?.trim() || "Comprador";
    const [insertedRows] = await sequelize.query(
      `
      INSERT INTO live_chat_messages (
        seller_id,
        user_id,
        buyer_name,
        sender_role,
        message,
        status
      )
      VALUES (
        :sellerId,
        :buyerId,
        :buyerName,
        'buyer',
        :message,
        'visible'
      )
      RETURNING
        id::text,
        seller_id,
        user_id,
        buyer_name,
        sender_role,
        message,
        created_at
      `,
      {
        replacements: {
          sellerId,
          buyerId,
          buyerName,
          message,
        },
      },
    );

    const inserted = insertedRows as Array<{
      id: string;
      seller_id: number;
      user_id: number;
      buyer_name: string;
      sender_role: "buyer" | "seller";
      message: string;
      created_at: string;
    }>;

    const row = inserted[0];
    const payload: {
      id: string;
      seller_id: number;
      user_id: number;
      buyer_name: string;
      sender_role: "buyer" | "seller";
      message: string;
      created_at: string;
    } = {
      id: row.id,
      seller_id: Number(row.seller_id),
      user_id: Number(row.user_id),
      buyer_name: row.buyer_name,
      sender_role: row.sender_role === "seller" ? "seller" : "buyer",
      message: row.message,
      created_at: row.created_at,
    };

    pushLiveChatMessage(sellerId, payload);

    res.status(201).json({
      success: true,
      data: payload,
    });
  } catch (error) {
    console.error("createLiveChatMessage error:", error);
    res.status(500).json({ success: false, message: "Error interno" });
  }
};

export const getSellerLiveChatSettingsHandler: RequestHandler = async (
  req,
  res,
) => {
  try {
    const sellerId = Number(req.user?.id);

    if (!sellerId) {
      res.status(401).json({ success: false, message: "No autenticado" });
      return;
    }

    const settings = await getSellerLiveChatSettings(sellerId);

    res.json({
      success: true,
      data: {
        slow_mode_seconds: settings.slowModeSeconds,
        pinned_message: settings.pinnedMessage,
      },
    });
  } catch (error) {
    console.error("getSellerLiveChatSettingsHandler error:", error);
    res.status(500).json({ success: false, message: "Error interno" });
  }
};

export const updateSellerLiveChatSettingsHandler: RequestHandler = async (
  req,
  res,
) => {
  try {
    const sellerId = Number(req.user?.id);
    const slowModeSeconds = Number(req.body?.slow_mode_seconds ?? 0);
    const rawPinnedMessage = req.body?.pinned_message;
    const pinnedMessage =
      typeof rawPinnedMessage === "string"
        ? rawPinnedMessage.trim().replace(/\s+/g, " ")
        : rawPinnedMessage == null
          ? null
          : "__INVALID__";

    if (!sellerId) {
      res.status(401).json({ success: false, message: "No autenticado" });
      return;
    }

    if (!Number.isFinite(slowModeSeconds) || !ALLOWED_SLOW_MODE_VALUES.has(slowModeSeconds)) {
      res.status(400).json({
        success: false,
        message: "slow_mode_seconds inválido",
      });
      return;
    }

    if (pinnedMessage === "__INVALID__") {
      res.status(400).json({
        success: false,
        message: "pinned_message inválido",
      });
      return;
    }

    if (typeof pinnedMessage === "string" && pinnedMessage.length > MESSAGE_MAX) {
      res.status(400).json({
        success: false,
        message: `El mensaje fijado no puede superar ${MESSAGE_MAX} caracteres`,
      });
      return;
    }

    const [rows] = await sequelize.query(
      `
      UPDATE vendedor_perfil
      SET
        live_chat_slow_mode_seconds = :slowModeSeconds,
        live_chat_pinned_message = :pinnedMessage
      WHERE user_id = :sellerId
      RETURNING live_chat_slow_mode_seconds, live_chat_pinned_message
      `,
      {
        replacements: {
          sellerId,
          slowModeSeconds,
          pinnedMessage,
        },
      },
    );

    const updatedRows = rows as Array<{
      live_chat_slow_mode_seconds: number;
      live_chat_pinned_message: string | null;
    }>;

    if (!updatedRows.length) {
      res.status(404).json({ success: false, message: "Perfil no encontrado" });
      return;
    }

    res.json({
      success: true,
      data: {
        slow_mode_seconds:
          Number(updatedRows[0]?.live_chat_slow_mode_seconds ?? 0) || 0,
        pinned_message:
          typeof updatedRows[0]?.live_chat_pinned_message === "string"
            ? updatedRows[0].live_chat_pinned_message.trim() || null
            : null,
      },
    });
  } catch (error) {
    console.error("updateSellerLiveChatSettingsHandler error:", error);
    res.status(500).json({ success: false, message: "Error interno" });
  }
};

export const listSellerLiveChatMessages: RequestHandler = async (req, res) => {
  try {
    const sellerId = Number(req.user?.id);

    if (!sellerId) {
      res.status(401).json({ success: false, message: "No autenticado" });
      return;
    }

    const rows = (await sequelize.query(
      `
      SELECT
        id::text,
        seller_id,
        user_id,
        buyer_name,
        sender_role,
        message,
        status,
        created_at,
        updated_at
      FROM live_chat_messages
      WHERE seller_id = :sellerId
      ORDER BY created_at DESC
      LIMIT :limit
      `,
      {
        replacements: {
          sellerId,
          limit: SELLER_MESSAGE_LIMIT,
        },
        type: QueryTypes.SELECT,
      },
    )) as Array<{
      id: string;
      seller_id: number;
      user_id: number;
      buyer_name: string;
      sender_role: "buyer" | "seller";
      message: string;
      status: "visible" | "hidden" | "deleted";
      created_at: string;
      updated_at: string;
    }>;

    res.json({
      success: true,
      data: rows.map((row) => ({
        ...row,
        seller_id: Number(row.seller_id),
        user_id: Number(row.user_id),
        sender_role: row.sender_role === "seller" ? "seller" : "buyer",
      })),
    });
  } catch (error) {
    console.error("listSellerLiveChatMessages error:", error);
    res.status(500).json({ success: false, message: "Error interno" });
  }
};

export const updateSellerLiveChatMessageStatus: RequestHandler = async (
  req,
  res,
) => {
  try {
    const sellerId = Number(req.user?.id);
    const messageId = String(req.params.messageId ?? "").trim();
    const nextStatus = String(req.body?.status ?? "").trim();

    if (!sellerId) {
      res.status(401).json({ success: false, message: "No autenticado" });
      return;
    }

    if (!messageId) {
      res.status(400).json({ success: false, message: "messageId inválido" });
      return;
    }

    if (!["visible", "hidden", "deleted"].includes(nextStatus)) {
      res.status(400).json({ success: false, message: "status inválido" });
      return;
    }

    const [rows] = await sequelize.query(
      `
      UPDATE live_chat_messages
      SET
        status = :nextStatus,
        updated_at = NOW()
      WHERE id = :messageId
        AND seller_id = :sellerId
      RETURNING
        id::text,
        seller_id,
        user_id,
        buyer_name,
        sender_role,
        message,
        status,
        created_at,
        updated_at
      `,
      {
        replacements: {
          messageId,
          sellerId,
          nextStatus,
        },
      },
    );

    const updatedRows = rows as Array<{
      id: string;
      seller_id: number;
      user_id: number;
      buyer_name: string;
      sender_role: "buyer" | "seller";
      message: string;
      status: "visible" | "hidden" | "deleted";
      created_at: string;
      updated_at: string;
    }>;

    if (!updatedRows.length) {
      res.status(404).json({ success: false, message: "Mensaje no encontrado" });
      return;
    }

    const row = updatedRows[0];

    res.json({
      success: true,
      data: {
        ...row,
        seller_id: Number(row.seller_id),
        user_id: Number(row.user_id),
        sender_role: row.sender_role === "seller" ? "seller" : "buyer",
      },
    });
  } catch (error) {
    console.error("updateSellerLiveChatMessageStatus error:", error);
    res.status(500).json({ success: false, message: "Error interno" });
  }
};

export const createSellerLiveChatMessage: RequestHandler = async (req, res) => {
  try {
    const sellerId = Number(req.user?.id);
    const role = req.user?.role;
    const message = normalizeMessage(req.body?.message);

    if (!sellerId || role !== "seller") {
      res.status(403).json({ success: false, message: "Solo sellers pueden responder aquí" });
      return;
    }

    if (!message) {
      res.status(400).json({ success: false, message: "El mensaje es obligatorio" });
      return;
    }

    if (message.length > MESSAGE_MAX) {
      res.status(400).json({
        success: false,
        message: `El mensaje no puede superar ${MESSAGE_MAX} caracteres`,
      });
      return;
    }

    if (!(await isSellerLive(sellerId))) {
      res.status(400).json({
        success: false,
        message: "Tu sala live no está activa ahora",
      });
      return;
    }

    const sellerRows = (await sequelize.query(
      `
      SELECT COALESCE(vp.nombre_comercio, u.nombre, 'Tienda') AS seller_name
      FROM users u
      LEFT JOIN vendedor_perfil vp ON vp.user_id = u.id
      WHERE u.id = :sellerId
      LIMIT 1
      `,
      {
        replacements: { sellerId },
        type: QueryTypes.SELECT,
      },
    )) as Array<{ seller_name: string }>;

    const sellerName = sellerRows[0]?.seller_name?.trim() || "Tienda";

    const [insertedRows] = await sequelize.query(
      `
      INSERT INTO live_chat_messages (
        seller_id,
        user_id,
        buyer_name,
        sender_role,
        message,
        status
      )
      VALUES (
        :sellerId,
        :sellerId,
        :sellerName,
        'seller',
        :message,
        'visible'
      )
      RETURNING
        id::text,
        seller_id,
        user_id,
        buyer_name,
        sender_role,
        message,
        created_at
      `,
      {
        replacements: {
          sellerId,
          sellerName,
          message,
        },
      },
    );

    const inserted = insertedRows as Array<{
      id: string;
      seller_id: number;
      user_id: number;
      buyer_name: string;
      sender_role: "buyer" | "seller";
      message: string;
      created_at: string;
    }>;

    const row = inserted[0];
    const payload: {
      id: string;
      seller_id: number;
      user_id: number;
      buyer_name: string;
      sender_role: "buyer" | "seller";
      message: string;
      created_at: string;
    } = {
      id: row.id,
      seller_id: Number(row.seller_id),
      user_id: Number(row.user_id),
      buyer_name: row.buyer_name,
      sender_role: row.sender_role === "seller" ? "seller" : "buyer",
      message: row.message,
      created_at: row.created_at,
    };

    pushLiveChatMessage(sellerId, payload);

    res.status(201).json({
      success: true,
      data: payload,
    });
  } catch (error) {
    console.error("createSellerLiveChatMessage error:", error);
    res.status(500).json({ success: false, message: "Error interno" });
  }
};
