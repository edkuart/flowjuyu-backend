import { RequestHandler } from "express";
import { sequelize } from "../config/db";
import { QueryTypes } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import {
  getSellerAnalyticsData,
  SellerAnalyticsData,
} from "../services/analytics.service"
import { trackEvent } from "../services/analytics/analytics.service";

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

    const sellerId = product[0]?.vendedor_id;

    if (!sellerId) {
      return res.status(500).json({
        message: "Producto sin vendedor válido",
      });
    }

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

/* ============================================
   📲 TRACK WHATSAPP CLICK
   POST /api/analytics/whatsapp-click
   Body: { seller_id, product_id? }
============================================ */
export const trackWhatsappClick: RequestHandler = async (req, res) => {
  try {
    const { seller_id, product_id } = req.body;

    if (!seller_id) {
      res.status(400).json({ message: "seller_id requerido" });
      return;
    }

    const sessionId = req.sessionID || null;
    const ip = req.ip || null;

    await sequelize.query(
      `
      INSERT INTO whatsapp_clicks (seller_id, product_id, session_id, ip_address)
      VALUES (:seller_id, :product_id, :session_id, :ip_address)
      `,
      {
        replacements: {
          seller_id: Number(seller_id),
          product_id: product_id || null,
          session_id: sessionId,
          ip_address: ip,
        },
      }
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error trackWhatsappClick:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const trackAnalyticsEvent: RequestHandler = async (req, res) => {
  try {
    const { event, payload } = req.body ?? {};
    const sellerId =
      Number.isFinite(Number(req.body?.seller_id))
        ? Number(req.body.seller_id)
        : Number.isFinite(Number(payload?.seller_id))
          ? Number(payload.seller_id)
          : null;

    void trackEvent({
      event: String(event || ""),
      sellerId,
      payload:
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? payload
          : null,
    });
  } catch (error) {
    console.warn(
      "[analytics-events] ingest failed:",
      error instanceof Error ? error.message : error
    );
  }

  res.status(200).json({ ok: true });
};

export const getLiveViewerCount: RequestHandler = async (req, res) => {
  try {
    const sellerId = Number(req.params.sellerId);

    if (!Number.isInteger(sellerId) || sellerId <= 0) {
      res.status(400).json({ success: false, message: "sellerId inválido" });
      return;
    }

    const rows = await sequelize.query<{
      viewer_count: number;
      buyer_viewer_count: number;
      guest_viewer_count: number;
      internal_viewer_count: number;
    }>(
      `
      WITH active_viewers AS (
        SELECT
          CASE
            WHEN ae.payload->>'role' = 'buyer'
              AND NULLIF(ae.payload->>'user_id', '') IS NOT NULL
              THEN CONCAT('buyer:', ae.payload->>'user_id')
            WHEN NULLIF(ae.payload->>'user_id', '') IS NULL
              AND NULLIF(ae.payload->>'session_id', '') IS NOT NULL
              THEN CONCAT('guest:', ae.payload->>'session_id')
            WHEN ae.payload->>'role' IN ('seller', 'admin')
              AND NULLIF(ae.payload->>'user_id', '') IS NOT NULL
              THEN CONCAT('internal:', ae.payload->>'role', ':', ae.payload->>'user_id')
            ELSE NULL
          END AS viewer_key,
          CASE
            WHEN ae.payload->>'role' = 'buyer'
              AND NULLIF(ae.payload->>'user_id', '') IS NOT NULL
              THEN 'buyer'
            WHEN NULLIF(ae.payload->>'user_id', '') IS NULL
              AND NULLIF(ae.payload->>'session_id', '') IS NOT NULL
              THEN 'guest'
            WHEN ae.payload->>'role' IN ('seller', 'admin')
              AND NULLIF(ae.payload->>'user_id', '') IS NOT NULL
              THEN 'internal'
            ELSE NULL
          END AS viewer_type
        FROM analytics_events ae
        WHERE ae.seller_id = :sellerId
          AND ae.event_name IN ('live_store_view', 'live_store_heartbeat')
          AND ae.created_at >= NOW() - INTERVAL '90 seconds'
      )
      SELECT
        COUNT(DISTINCT viewer_key) FILTER (WHERE viewer_type IN ('buyer', 'guest'))::int AS viewer_count,
        COUNT(DISTINCT viewer_key) FILTER (WHERE viewer_type = 'buyer')::int AS buyer_viewer_count,
        COUNT(DISTINCT viewer_key) FILTER (WHERE viewer_type = 'guest')::int AS guest_viewer_count,
        COUNT(DISTINCT viewer_key) FILTER (WHERE viewer_type = 'internal')::int AS internal_viewer_count
      FROM active_viewers
      WHERE viewer_key IS NOT NULL
      `,
      {
        replacements: { sellerId },
        type: QueryTypes.SELECT,
      }
    );

    res.json({
      success: true,
      data: {
        viewer_count: Number(rows[0]?.viewer_count) || 0,
        buyer_viewer_count: Number(rows[0]?.buyer_viewer_count) || 0,
        guest_viewer_count: Number(rows[0]?.guest_viewer_count) || 0,
        internal_viewer_count: Number(rows[0]?.internal_viewer_count) || 0,
      },
    });
  } catch (error) {
    console.error("Error getLiveViewerCount:", error);
    res.status(500).json({ success: false, message: "Error interno" });
  }
};

export const getSellerAnalyticsOverview: RequestHandler = async (req, res) => {
  try {
    const sellerId = req.user?.id;

    if (!sellerId) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    const data = await getSellerAnalyticsData(Number(sellerId));

    console.log("LAST30 BACKEND:", data.last30Days)

    res.json({
      success: true,
      totalProductViews:    data.totalProductViews,
      totalProfileViews:    data.totalProfileViews,
      topProducts:          data.topProducts,
      last30Days:           data.last30Days,
      totalIntentions:      data.totalIntentions,
      last30Intentions:     data.last30Intentions,
      // Phase 2
      totalWhatsappClicks:  data.totalWhatsappClicks,
      last30WhatsappClicks: data.last30WhatsappClicks,
      totalReviews:         data.totalReviews,
      avgRating:            data.avgRating,
    });
  } catch (error) {
    console.error("Error getSellerAnalyticsOverview:", error);
    res.status(500).json({
      message: "Error interno del servidor",
    });
  }
};

export const getSellerLiveMetrics: RequestHandler = async (req, res) => {
  try {
    const sellerId = req.user?.id;

    if (!sellerId) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    const rows = await sequelize.query<{
      external_clicks_total: number;
      external_clicks_last_24h: number;
      product_clicks_total: number;
      whatsapp_clicks_total: number;
    }>(
      `
      SELECT
        COUNT(*) FILTER (WHERE event_name = 'live_external_click')::int AS external_clicks_total,
        COUNT(*) FILTER (
          WHERE event_name = 'live_external_click'
            AND created_at >= NOW() - INTERVAL '24 hours'
        )::int AS external_clicks_last_24h,
        COUNT(*) FILTER (WHERE event_name = 'live_product_click')::int AS product_clicks_total,
        COUNT(*) FILTER (WHERE event_name = 'live_whatsapp_click')::int AS whatsapp_clicks_total
      FROM analytics_events
      WHERE seller_id = :sellerId
      `,
      {
        replacements: { sellerId: Number(sellerId) },
        type: QueryTypes.SELECT,
      },
    );

    const metrics = rows[0] ?? {
      external_clicks_total: 0,
      external_clicks_last_24h: 0,
      product_clicks_total: 0,
      whatsapp_clicks_total: 0,
    };

    res.json({
      success: true,
      data: {
        external_clicks_total: Number(metrics.external_clicks_total ?? 0),
        external_clicks_last_24h: Number(metrics.external_clicks_last_24h ?? 0),
        product_clicks_total: Number(metrics.product_clicks_total ?? 0),
        whatsapp_clicks_total: Number(metrics.whatsapp_clicks_total ?? 0),
      },
    });
  } catch (error) {
    console.error("Error getSellerLiveMetrics:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
