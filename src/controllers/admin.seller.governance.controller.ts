import { RequestHandler } from "express";
import { Op } from "sequelize";
import { VendedorPerfil } from "../models/VendedorPerfil";
import { User } from "../models/user.model";
import AdminAuditEvent from "../models/adminAuditEvent.model";
import { logAdminEvent } from "../utils/logAdminEvent";
import Product from "../models/product.model";
import { PurchaseIntention } from "../models/purchaseIntention.model";
import { sequelize } from "../config/db";
import { Ticket } from "../models/ticket.model";
import { TicketMessage } from "../models/ticketMessage.model";
import supabase from "../lib/supabase";
import { scoreFromChecklist, sanitizeChecklist } from "../services/kyc.service";

/* ======================================================
   🔹 HELPER INTERFACES & ENGINES
====================================================== */

interface RiskResult {
  score: number;
  level: "low" | "medium" | "high";
  flags: string[];
}

interface Insight {
  type: string;
  message: string;
  severity: "info" | "warning" | "critical";
}

interface Alert {
  type: string;
  message: string;
  level: "info" | "warning" | "critical";
}

function computeRiskScore(
  flags: string[],
  missingDocuments: boolean,
  totalProducts: number,
  productosActivos: number,
): RiskResult {
  let score = 0;
  if (flags.includes("duplicate_dpi"))        score += 40;
  if (flags.includes("shared_phone"))         score += 20;
  if (flags.includes("suspicious_documents")) score += 30;
  if (missingDocuments)                       score += 15;
  if (totalProducts === 0)                    score += 10;
  else if (productosActivos === 0)            score += 5;
  score = Math.min(100, score);
  const level: "low" | "medium" | "high" = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
  return { score, level, flags };
}

function computeInsights(
  seller: any,
  metrics: {
    products_total: number;
    products_active: number;
    total_views: number;
    conversion_rate: number;
    days_since_last_product: number | null;
  },
  riskFlags: string[],
  categorias: string[],
): Insight[] {
  const insights: Insight[] = [];

  if (metrics.products_active > 0 && metrics.total_views > 5 && metrics.conversion_rate < 10) {
    insights.push({
      type: "low_conversion",
      message: `Low conversion despite ${metrics.products_active} active product${metrics.products_active > 1 ? "s" : ""} — only ${metrics.conversion_rate}% buyer conversion`,
      severity: "warning",
    });
  }
  if (categorias.length > 0) {
    insights.push({
      type: "custom_category",
      message: `Custom categories detected in product listings: ${categorias.join(", ")}`,
      severity: "info",
    });
  }
  if (metrics.total_views > 10 && metrics.conversion_rate === 0) {
    insights.push({
      type: "high_engagement_no_purchase",
      message: "High buyer engagement recorded but zero conversion — review product pricing or availability",
      severity: "warning",
    });
  }
  if (metrics.days_since_last_product !== null && metrics.days_since_last_product > 30) {
    insights.push({
      type: "seller_inactive",
      message: `No new products listed in ${metrics.days_since_last_product} days — seller may be disengaging`,
      severity: "warning",
    });
  }
  if (seller.estado_validacion === "aprobado" && metrics.products_total === 0) {
    insights.push({
      type: "approved_no_products",
      message: "Seller is approved but has not listed any products yet",
      severity: "info",
    });
  }
  if (riskFlags.includes("duplicate_dpi")) {
    insights.push({
      type: "identity_conflict",
      message: "Identity conflict — DPI number matches another registered seller. Fraud investigation required.",
      severity: "critical",
    });
  }
  if (metrics.conversion_rate >= 50 && metrics.total_views >= 10 && seller.estado_validacion === "aprobado") {
    insights.push({
      type: "top_performer",
      message: `Exceptional performance — ${metrics.conversion_rate}% conversion rate with ${metrics.total_views} buyer engagements`,
      severity: "info",
    });
  }
  return insights;
}

function computeAlerts(
  seller: any,
  metrics: { total_views: number; conversion_rate: number; days_since_last_product: number | null },
  riskScore: number,
  missingDocuments: boolean,
): Alert[] {
  const alerts: Alert[] = [];

  if (metrics.days_since_last_product !== null && metrics.days_since_last_product > 7) {
    alerts.push({
      type: "no_recent_activity",
      message: `No new product activity in the last ${metrics.days_since_last_product} days`,
      level: "warning",
    });
  }
  if (metrics.conversion_rate === 0 && metrics.total_views > 0) {
    alerts.push({
      type: "zero_conversion",
      message: "0% conversion rate — buyer engagements are not converting",
      level: "warning",
    });
  }
  if (seller.estado_validacion === "aprobado" && riskScore >= 60) {
    alerts.push({
      type: "approved_high_risk",
      message: "Seller is KYC-approved but risk score is high — manual review recommended",
      level: "critical",
    });
  }
  if (missingDocuments) {
    alerts.push({
      type: "missing_documents",
      message: "One or more KYC documents are missing — identity cannot be fully verified",
      level: "warning",
    });
  }
  if (seller.estado_admin === "suspendido" && seller.estado_validacion === "aprobado") {
    alerts.push({
      type: "suspended_approved",
      message: "Seller is suspended despite approved KYC — review the reason for suspension",
      level: "critical",
    });
  }
  return alerts;
}

/* ======================================================
   🔹 LISTAR TODOS LOS SELLERS
====================================================== */
export const getAllSellers: RequestHandler = async (req, res) => {
  try {
    const { estado_validacion, estado_admin } = req.query;


    const where: any = {};


    if (estado_validacion) {
      where.estado_validacion = estado_validacion;
    }


    if (estado_admin) {
      where.estado_admin = estado_admin;
    }


    const sellers = await VendedorPerfil.findAll({
      where,
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "nombre", "correo"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });


    // 🔥 ENRIQUECER CON MÉTRICAS DE PRODUCTOS
    const enriched = await Promise.all(
      sellers.map(async (seller) => {
        const totalProductos = await Product.count({
          where: { vendedor_id: seller.user_id },
        });


        const productosPublicados = await Product.count({
          where: {
            vendedor_id: seller.user_id,
            activo: true,
          },
        });


        // Producto publicado real depende del seller también
        const publicadosReales =
          seller.estado_admin === "activo" &&
          seller.estado_validacion === "aprobado"
            ? productosPublicados
            : 0;


        return {
          ...seller.toJSON(),
          total_productos: totalProductos,
          productos_publicados: publicadosReales,
        };
      })
    );


    res.json({
      ok: true,
      data: enriched,
    });
  } catch (error) {
    console.error("getAllSellers error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};


/* ======================================================
   🔹 SELLER DETAIL — Intelligence System
====================================================== */
export const getSellerDetail: RequestHandler = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) return res.status(400).json({ message: "ID inválido" });

    const seller = await VendedorPerfil.findOne({
      where: { user_id: userId },
      include: [{ model: User, as: "user", attributes: ["id", "nombre", "correo", "telefono"] }],
    });
    if (!seller) return res.status(404).json({ message: "Vendedor no encontrado" });

    const sellerData = seller.toJSON() as any;

    // ── Signed URLs (capture originals before replacing) ─────────────────────
    const originalFotoDpiFrente = seller.foto_dpi_frente;

    const generateSignedUrl = async (fullUrl: string | null | undefined) => {
      if (!fullUrl) return null;
      let cleanPath = fullUrl;
      if (fullUrl.startsWith("http")) {
        const parts = fullUrl.split("/vendedores_dpi/");
        if (parts.length === 2) cleanPath = parts[1];
      }
      const { data, error } = await supabase.storage.from("vendedores_dpi").createSignedUrl(cleanPath, 60);
      if (error) { console.error("Signed URL error:", error.message); return null; }
      return data?.signedUrl ?? null;
    };

    const [signedFrente, signedReverso, signedSelfie] = await Promise.all([
      generateSignedUrl(sellerData.foto_dpi_frente),
      generateSignedUrl(sellerData.foto_dpi_reverso),
      generateSignedUrl(sellerData.selfie_con_dpi),
    ]);
    sellerData.foto_dpi_frente  = signedFrente;
    sellerData.foto_dpi_reverso = signedReverso;
    sellerData.selfie_con_dpi   = signedSelfie;

    const missingDocuments = !seller.foto_dpi_frente || !seller.foto_dpi_reverso || !seller.selfie_con_dpi;

    // ── Parallel data fetches ─────────────────────────────────────────────────
    const [
      totalProductos,
      productosActivos,
      totalViews,
      uniqueBuyers,
      latestProduct,
      openTicketsCount,
      lastTicket,
      customProductData,
      history,
    ] = await Promise.all([
      Product.count({ where: { vendedor_id: seller.user_id } }),
      Product.count({ where: { vendedor_id: seller.user_id, activo: true } }),
      PurchaseIntention.count({ where: { seller_id: seller.user_id } }),
      PurchaseIntention.count({
        where: { seller_id: seller.user_id, user_id: { [Op.ne]: null } },
        distinct: true,
        col: "user_id",
      }),
      Product.findOne({
        where: { vendedor_id: seller.user_id },
        order: [["created_at", "DESC"]],
        attributes: ["nombre", "created_at"],
      }),
      Ticket.count({ where: { user_id: seller.user_id, estado: { [Op.ne]: "cerrado" } } }),
      Ticket.findOne({
        where: { user_id: seller.user_id },
        order: [["createdAt", "DESC"]],
        attributes: ["createdAt"],
      }),
      Product.findAll({
        where: { vendedor_id: seller.user_id },
        attributes: ["categoria_custom", "region_custom", "tela_custom", "accesorio_custom"],
      }),
      AdminAuditEvent.findAll({
        where: { entity_type: "seller", entity_id: seller.id },
        order: [["created_at", "DESC"]],
      }),
    ]);

    // ── Risk flags ────────────────────────────────────────────────────────────
    const [dupDPI, dupPhone, dupDoc] = await Promise.all([
      seller.dpi
        ? VendedorPerfil.count({ where: { dpi: seller.dpi, id: { [Op.ne]: seller.id } } })
        : Promise.resolve(0),
      sellerData.telefono
        ? VendedorPerfil.count({ where: { telefono: sellerData.telefono, id: { [Op.ne]: seller.id } } })
        : Promise.resolve(0),
      originalFotoDpiFrente
        ? VendedorPerfil.count({ where: { foto_dpi_frente: originalFotoDpiFrente, id: { [Op.ne]: seller.id } } })
        : Promise.resolve(0),
    ]);

    const riskFlagsList: string[] = [];
    if (dupDPI > 0)   riskFlagsList.push("duplicate_dpi");
    if (dupPhone > 0) riskFlagsList.push("shared_phone");
    if (dupDoc > 0)   riskFlagsList.push("suspicious_documents");

    // ── Metrics ───────────────────────────────────────────────────────────────
    const conversionRate    = totalViews > 0 ? Math.round((uniqueBuyers / totalViews) * 100) : 0;
    const engagementScore   = Math.round(Math.min(totalViews / 50, 1) * 60 + Math.min(uniqueBuyers / 20, 1) * 40);
    const daysSinceLastProduct = latestProduct
      ? Math.floor((Date.now() - new Date((latestProduct as any).created_at).getTime()) / 86400000)
      : null;

    const metrics = {
      products_total:          totalProductos,
      products_active:         productosActivos,
      total_views:             totalViews,
      conversion_rate:         conversionRate,
      engagement_score:        engagementScore,
      days_since_last_product: daysSinceLastProduct,
    };

    // ── Risk Engine ───────────────────────────────────────────────────────────
    const risk = computeRiskScore(riskFlagsList, missingDocuments, totalProductos, productosActivos);

    // ── Custom Data Intelligence ──────────────────────────────────────────────
    const categorias = [...new Set(customProductData.map((p: any) => p.categoria_custom).filter(Boolean))] as string[];
    const regiones   = [...new Set(customProductData.map((p: any) => p.region_custom).filter(Boolean))] as string[];
    const telas      = [...new Set(customProductData.map((p: any) => p.tela_custom).filter(Boolean))] as string[];

    // ── Insights & Alerts ─────────────────────────────────────────────────────
    const insights = computeInsights(sellerData, metrics, riskFlagsList, categorias);
    const alerts   = computeAlerts(sellerData, metrics, risk.score, missingDocuments);

    // ── Value Score (KYC 40% + Activity 40% + Conversion 20%) ────────────────
    const kycContrib      = (seller.kyc_score ?? 0) * 0.4;
    const activityRatio   = totalProductos > 0 ? productosActivos / totalProductos : 0;
    const activityContrib = Math.min(activityRatio * 100, 100) * 0.4;
    const valueScore      = Math.round(kycContrib + activityContrib + conversionRate * 0.2);

    // ── Timeline ──────────────────────────────────────────────────────────────
    const timeline = [
      { type: "registration", label: "Seller registered", date: sellerData.createdAt },
      ...(latestProduct
        ? [{ type: "product_activity", label: `Latest product: ${(latestProduct as any).nombre}`, date: (latestProduct as any).created_at }]
        : []),
      ...history.map((ev) => ({ type: "audit", label: ev.action, date: ev.created_at, comment: ev.comment })),
    ].sort((a, b) => new Date(b.date as string).getTime() - new Date(a.date as string).getTime());

    // ── Response ──────────────────────────────────────────────────────────────
    res.json({
      ok: true,
      data: {
        ...sellerData,
        // Structured sub-objects
        risk,
        metrics,
        insights,
        alerts,
        tickets: {
          open_count:       openTicketsCount,
          last_ticket_date: lastTicket ? (lastTicket as any).createdAt : null,
        },
        custom_data: { categorias, regiones, telas },
        missing_documents: missingDocuments,
        // Legacy flat fields (backward compat)
        risk_flags:        riskFlagsList,
        value_score:       valueScore,
        total_productos:   totalProductos,
        productos_activos: productosActivos,
        total_views:       totalViews,
        conversion_rate:   conversionRate,
        // History
        audit_log: history,
        timeline,
      },
    });

  } catch (error) {
    console.error("getSellerDetail error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ======================================================
   🔹 APPROVE SELLER (CON VALIDACIÓN KYC SCORE)
====================================================== */
export const approveSeller: RequestHandler = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const adminId = Number(req.user!.id);


    const seller = await VendedorPerfil.findOne({
      where: { user_id: userId },
    });


    if (!seller) {
      res.status(404).json({ message: "Vendedor no encontrado" });
      return;
    }


    if (!["pendiente", "en_revision"].includes(seller.estado_validacion)) {
      res.status(409).json({
        message: "El vendedor no está en estado válido para aprobación",
      });
      return;
    }


    // 🚨 VALIDACIÓN DE RIESGO KYC
    if (seller.kyc_score < 80) {
      res.status(400).json({
        message: "No se puede aprobar. Riesgo demasiado alto.",
      });
      return;
    }


    const before = {
      estado_validacion: seller.estado_validacion,
      estado_admin: seller.estado_admin,
    };


    seller.estado_validacion = "aprobado";
    seller.estado_admin = "activo";


    await seller.save();


    await logAdminEvent({
      entityType: "seller",
      entityId: seller.id, // 👈 importante: entity es el perfil
      action: "KYC_APPROVED",
      performedBy: adminId,
      metadata: {
        before,
        after: {
          estado_validacion: seller.estado_validacion,
          estado_admin: seller.estado_admin,
        },
        kyc_score: seller.kyc_score,
      },
    });


    res.json({
      ok: true,
      message: "Vendedor aprobado correctamente",
    });


  } catch (error) {
    console.error("approveSeller error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};


/* ======================================================
   🔹 REJECT SELLER
====================================================== */
export const rejectSeller: RequestHandler = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const adminId = Number(req.user!.id);
    const { comment } = req.body;


    if (!comment) {
      res.status(400).json({
        message: "Comentario obligatorio al rechazar",
      });
      return;
    }


    const seller = await VendedorPerfil.findOne({
      where: { user_id: userId },
    });


    if (!seller) {
      res.status(404).json({ message: "Vendedor no encontrado" });
      return;
    }


    if (seller.estado_validacion !== "pendiente") {
      res.status(409).json({
        message: "Solo vendedores pendientes pueden rechazarse",
      });
      return;
    }


    const before = {
      estado_validacion: seller.estado_validacion,
      estado_admin: seller.estado_admin,
    };


    seller.estado_validacion = "rechazado";
    seller.estado_admin = "inactivo";
    seller.observaciones = comment;


    await seller.save();


    await logAdminEvent({
      entityType: "seller",
      entityId: seller.id,
      action: "KYC_REJECTED",
      performedBy: adminId,
      comment,
      metadata: {
        before,
        after: {
          estado_validacion: seller.estado_validacion,
          estado_admin: seller.estado_admin,
        },
      },
    });


    res.json({ ok: true, message: "Vendedor rechazado correctamente" });
  } catch (error) {
    console.error("rejectSeller error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};


/* ======================================================
   🔹 SUSPEND SELLER
====================================================== */
export const suspendSeller: RequestHandler = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const adminId = Number(req.user!.id);


    const seller = await VendedorPerfil.findOne({
      where: { user_id: userId },
    });


    if (!seller) {
      res.status(404).json({ message: "Vendedor no encontrado" });
      return;
    }


    const before = {
      estado_admin: seller.estado_admin,
    };


    seller.estado_admin = "suspendido";
    await seller.save();


    await logAdminEvent({
      entityType: "seller",
      entityId: seller.id,
      action: "SELLER_SUSPENDED",
      performedBy: adminId,
      metadata: {
        before,
        after: {
          estado_admin: seller.estado_admin,
        },
      },
    });


    res.json({
      ok: true,
      message: "Vendedor suspendido correctamente",
    });


  } catch (error) {
    console.error("suspendSeller error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};


/* ======================================================
   🔹 REACTIVATE SELLER
====================================================== */
export const reactivateSeller: RequestHandler = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const adminId = Number(req.user!.id);


    const seller = await VendedorPerfil.findOne({
      where: { user_id: userId },
    });


    if (!seller) {
      res.status(404).json({ message: "Vendedor no encontrado" });
      return;
    }


    const before = {
      estado_admin: seller.estado_admin,
    };


    seller.estado_admin = "activo";
    await seller.save();


    await logAdminEvent({
      entityType: "seller",
      entityId: seller.id,
      action: "SELLER_REACTIVATED",
      performedBy: adminId,
      metadata: {
        before,
        after: {
          estado_admin: seller.estado_admin,
        },
      },
    });


    res.json({
      ok: true,
      message: "Vendedor reactivado correctamente",
    });


  } catch (error) {
    console.error("reactivateSeller error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const requestKycDocuments: RequestHandler = async (req, res) => {
  try {
    const userId  = Number(req.params.id);
    const adminId = Number(req.user!.id);
    const { comment } = req.body;

    if (!comment) {
      return res.status(400).json({
        message: "Debe especificar el motivo de la solicitud",
      });
    }

    const seller = await VendedorPerfil.findOne({ where: { user_id: userId } });

    if (!seller) {
      return res.status(404).json({
        message: "Vendedor no encontrado",
      });
    }

    const before = {
      estado_validacion: seller.estado_validacion,
      estado_admin: seller.estado_admin,
    };

    // 🔁 Forzar reenvío
    seller.estado_validacion = "pendiente";
    seller.estado_admin = "inactivo";

    await seller.save();

    // 🎫 Crear ticket automático tipo KYC
    const ticket = await Ticket.create({
      user_id: seller.user_id,
      asunto: "Solicitud de documentación adicional (KYC)",
      mensaje: "El equipo de Flowjuyu requiere información adicional para continuar con tu verificación.",
      tipo: "verificacion",
      prioridad: "alta",
      estado: "abierto",
    });

    // 💬 Crear mensaje inicial del admin dentro del ticket
    await TicketMessage.create({
      ticket_id: ticket.id,
      sender_id: adminId,
      mensaje: comment,
      es_admin: true,
    });

    // 🧾 Log auditoría
    await logAdminEvent({
      entityType: "seller",
      entityId: seller.id,
      action: "KYC_DOCUMENTS_REQUESTED",
      performedBy: adminId,
      comment,
      metadata: {
        before,
        after: {
          estado_validacion: seller.estado_validacion,
          estado_admin: seller.estado_admin,
        },
        ticket_id: ticket.id,
      },
    });

    res.json({
      ok: true,
      message: "Solicitud enviada correctamente al vendedor",
      ticket_id: ticket.id,
    });

  } catch (error) {
    console.error("requestKycDocuments error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ======================================================
   🔹 SAVE KYC REVIEW
====================================================== */
export const saveKycReview: RequestHandler = async (req, res) => {
  try {
    const profileId = Number(req.params.id);
    const adminId = Number(req.user!.id);

    console.log("PARAM ID:", req.params.id);

    const seller = await VendedorPerfil.findOne({
      where: { id: profileId },
    });

    if (!seller) {
      return res.status(404).json({ message: "Vendedor no encontrado" });
    }

    console.log("[KYC Review] req.body:", req.body);

    if (!req.body.kyc_checklist || typeof req.body.kyc_checklist !== "object") {
      return res.status(400).json({ message: "kyc_checklist is required" });
    }

    const checklist = sanitizeChecklist(req.body.kyc_checklist as Record<string, unknown>);
    const { score, riesgo } = scoreFromChecklist(checklist);

    const before = {
      kyc_score: seller.kyc_score,
      kyc_riesgo: seller.kyc_riesgo,
    };

    seller.kyc_checklist = checklist;
    seller.kyc_score     = score;
    seller.kyc_riesgo    = riesgo;
    seller.kyc_revisado_por = adminId;
    seller.kyc_revisado_en  = new Date();

    await seller.save();

    await logAdminEvent({
      entityType: "seller",
      entityId: seller.id,
      action: "KYC_REVIEW_UPDATED",
      performedBy: adminId,
      metadata: {
        before,
        after: { kyc_score: score, kyc_riesgo: riesgo },
      },
    });

    res.json({ ok: true, score, riesgo, checklist });

  } catch (error) {
    console.error("saveKycReview error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

// reviewSellerKYC is an alias kept for route compatibility — delegates to same logic
export const reviewSellerKYC: RequestHandler = async (req, res) => {
  try {
    const profileId = Number(req.params.id);
    const adminId   = Number(req.user!.id);

    console.log("PARAM ID:", req.params.id);

    const seller = await VendedorPerfil.findOne({ where: { id: profileId } });
    if (!seller) {
      return res.status(404).json({ message: "Vendedor no encontrado" });
    }

    console.log("[KYC Review] req.body:", req.body);

    if (!req.body.kyc_checklist || typeof req.body.kyc_checklist !== "object") {
      return res.status(400).json({ message: "kyc_checklist is required" });
    }

    const checklist = sanitizeChecklist(req.body.kyc_checklist as Record<string, unknown>);
    const { score, riesgo } = scoreFromChecklist(checklist);

    const before = { kyc_score: seller.kyc_score, kyc_riesgo: seller.kyc_riesgo };

    seller.kyc_checklist    = checklist;
    seller.kyc_score        = score;
    seller.kyc_riesgo       = riesgo;
    seller.kyc_revisado_por = adminId;
    seller.kyc_revisado_en  = new Date();

    await seller.save();

    await logAdminEvent({
      entityType: "seller",
      entityId: seller.id,
      action: "KYC_REVIEW_UPDATED",
      performedBy: adminId,
      metadata: {
        before,
        after: { kyc_score: score, kyc_riesgo: riesgo },
      },
    });

    res.json({ ok: true, score, riesgo, checklist });

  } catch (error) {
    console.error("reviewSellerKYC error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ======================================================
   🔹 FLAG SELLER MANUALLY
====================================================== */
export const flagSellerManually: RequestHandler = async (req, res) => {
  try {
    const userId  = Number(req.params.id);
    const adminId = Number(req.user!.id);
    const { reason, comment } = req.body;

    if (!reason) {
      return res.status(400).json({ message: "A reason is required to flag a seller" });
    }

    const seller = await VendedorPerfil.findOne({ where: { user_id: userId } });
    if (!seller) return res.status(404).json({ message: "Vendedor no encontrado" });

    await logAdminEvent({
      entityType: "seller",
      entityId:   seller.id,
      action:     "SELLER_FLAGGED_MANUALLY",
      performedBy: adminId,
      comment:    comment ?? reason,
      metadata:   { reason },
    });

    res.json({ ok: true, message: "Seller flagged for manual review" });
  } catch (error) {
    console.error("flagSellerManually error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ======================================================
   🔹 GET SELLER TICKETS
====================================================== */
export const getSellerTickets: RequestHandler = async (req, res) => {
  try {
    const userId = Number(req.params.id);

    const seller = await VendedorPerfil.findOne({ where: { user_id: userId } });
    if (!seller) return res.status(404).json({ message: "Vendedor no encontrado" });

    const tickets = await Ticket.findAll({
      where: { user_id: seller.user_id },
      order: [["createdAt", "DESC"]],
    });

    res.json({ ok: true, data: tickets });
  } catch (error) {
    console.error("getSellerTickets error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};
