import { RequestHandler } from "express";
import { sequelize } from "../config/db";
import { QueryTypes } from "sequelize";
import { v4 as uuidv4 } from "uuid";

/* ============================================
   Helper: asegurar creación de sesión
============================================ */
function ensureSession(req: any) {
  if (!req.session) return;
  req.session._analytics = req.session._analytics || true;
}

/* ============================================
   📊 TOP PRODUCTOS MÁS VISTOS (ADMIN)
============================================ */
export const getTopViewedProducts: RequestHandler = async (_req, res) => {
  try {
    const rows = await sequelize.query(
      `
      SELECT 
        p.id,
        p.nombre,
        COUNT(pv.id)::int AS total_views
      FROM productos p
      JOIN product_views pv ON pv.product_id = p.id
      GROUP BY p.id, p.nombre
      ORDER BY total_views DESC
      LIMIT 10
      `,
      { type: QueryTypes.SELECT }
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Error getTopViewedProducts:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ============================================
   👁 TRACK PRODUCT VIEW (10 min dedupe)
============================================ */
export const trackProductView: RequestHandler = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      res.status(400).json({ message: "productId requerido" });
      return;
    }

    ensureSession(req);

    const sessionId = req.sessionID;
    const ip = req.ip;
    const userAgent = req.headers["user-agent"] || null;

    const product: any[] = await sequelize.query(
      `SELECT vendedor_id FROM productos WHERE id = :id`,
      {
        replacements: { id: productId },
        type: QueryTypes.SELECT,
      }
    );

    if (!product.length) {
      res.status(404).json({ message: "Producto no encontrado" });
      return;
    }

    const sellerId = product[0].vendedor_id;

    const result = await sequelize.query(
      `
      INSERT INTO product_views (
        product_id,
        seller_id,
        session_id,
        viewed_at,
        view_date,
        ip_address,
        user_agent
      )
      SELECT
        :product_id,
        :seller_id,
        :session_id,
        NOW(),
        CURRENT_DATE,
        :ip_address,
        :user_agent
      WHERE NOT EXISTS (
        SELECT 1 FROM product_views
        WHERE product_id = :product_id
        AND session_id = :session_id
        AND viewed_at > NOW() - INTERVAL '10 minutes'
      )
      `,
      {
        replacements: {
        product_id: productId,
        seller_id: sellerId,
        session_id: sessionId,
        ip_address: ip,
        user_agent: userAgent,
        },
      }
    );

        // Sequelize devuelve [rows, metadata]
        const rows = result?.[0];

        if (!rows || rows.length === 0) {
        res.json({ success: true, deduped: true });
        return;
        }

        res.json({ success: true, inserted: true });


    res.json({ success: true, inserted: true });
  } catch (error) {
    console.error("Error trackProductView:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/* ============================================
   👁 TRACK SELLER PROFILE VIEW (10 min dedupe)
============================================ */
export const trackSellerView: RequestHandler = async (req, res) => {
  try {
    const { sellerId } = req.params;

    if (!sellerId) {
      res.status(400).json({ message: "sellerId requerido" });
      return;
    }

    ensureSession(req);

    const sessionId = req.sessionID;
    const ip = req.ip;
    const userAgent = req.headers["user-agent"] || null;

    await sequelize.query(
      `
      INSERT INTO seller_views (
        seller_id,
        session_id,
        viewed_at,
        view_date,
        ip_address,
        user_agent
      )
      SELECT
        :seller_id,
        :session_id,
        NOW(),
        CURRENT_DATE,
        :ip_address,
        :user_agent
      WHERE NOT EXISTS (
        SELECT 1 FROM seller_views
        WHERE seller_id = :seller_id
        AND session_id = :session_id
        AND viewed_at > NOW() - INTERVAL '10 minutes'
      )
      `,
      {
        replacements: {
          seller_id: Number(sellerId),
          session_id: sessionId,
          ip_address: ip,
          user_agent: userAgent,
        },
      }
    );

    res.json({ success: true });

  } catch (error) {
    console.error("Error trackSellerView:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

/* ============================================
   ▶️ INICIAR SESIÓN DE PRODUCTO
============================================ */
export const startProductSession: RequestHandler = async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      res.status(400).json({ message: "productId requerido" });
      return;
    }

    const product: any[] = await sequelize.query(
      `
      SELECT p.id, p.vendedor_id
      FROM productos p
      JOIN vendedor_perfil v ON v.user_id = p.vendedor_id
      WHERE p.id = :productId
        AND p.activo = true
        AND v.estado_validacion = 'aprobado'
      `,
      {
        replacements: { productId },
        type: QueryTypes.SELECT,
      }
    );

    if (!product.length) {
      res.status(404).json({ message: "Producto no disponible" });
      return;
    }

    const sessionId = uuidv4();

    await sequelize.query(
      `
      INSERT INTO product_sessions (
        product_id,
        vendedor_id,
        session_id,
        duration_seconds,
        created_at
      )
      VALUES (
        :product_id,
        :vendedor_id,
        :session_id,
        NULL,
        NOW()
      )
      `,
      {
        replacements: {
          product_id: productId,
          vendedor_id: product[0].vendedor_id,
          session_id: sessionId,
        },
      }
    );

    res.json({ success: true, sessionId });
  } catch (error) {
    console.error("Error startProductSession:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ============================================
   ⏹ FINALIZAR SESIÓN (ANTI-REBOTE <3s)
============================================ */
export const endProductSession: RequestHandler = async (req, res) => {
  try {
    const { sessionId, duration } = req.body;

    if (!sessionId) {
      res.status(400).json({ message: "sessionId requerido" });
      return;
    }

    const durationNumber = Number(duration);

    if (!Number.isFinite(durationNumber)) {
      res.status(400).json({ message: "Duración inválida" });
      return;
    }

    if (durationNumber < 3) {
      res.json({ success: true, ignored: true });
      return;
    }

    await sequelize.query(
      `
      UPDATE product_sessions
      SET duration_seconds = :duration
      WHERE session_id = :session_id
      `,
      {
        replacements: {
          duration: durationNumber,
          session_id: sessionId,
        },
      }
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error endProductSession:", error);
    res.status(500).json({ message: "Error interno" });
  }
};
