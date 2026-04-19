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
import { downloadKycFile, getKycSignedUrl } from "../lib/kycStorage";
import { logAuditEventFromRequest } from "../services/audit.service";
import { resolveKycIdentitySignals } from "../services/kycIdentityVerification.service";
import { runKYCAnalysis } from "../services/kyc.service";

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

type SellerJson = Record<string, any>;
let sellerProfileColumnsPromise: Promise<Set<string>> | null = null;

async function getSellerProfileColumns(): Promise<Set<string>> {
  if (!sellerProfileColumnsPromise) {
    sellerProfileColumnsPromise = sequelize
      .getQueryInterface()
      .describeTable("vendedor_perfil")
      .then((columns) => new Set(Object.keys(columns)))
      .catch((error) => {
        sellerProfileColumnsPromise = null;
        throw error;
      });
  }

  return sellerProfileColumnsPromise;
}

async function hasSellerProfileColumn(column: string): Promise<boolean> {
  const columns = await getSellerProfileColumns();
  return columns.has(column);
}

async function getSelectableSellerAttributes(): Promise<string[]> {
  const columns = await getSellerProfileColumns();
  return [...columns];
}

function pickExistingSellerColumns(
  payload: Record<string, unknown>,
  columns: Set<string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => columns.has(key))
  );
}

function extractReviewReasons(seller: SellerJson): string[] {
  const reasons = seller.kyc_evidence?.review_reasons;
  return Array.isArray(reasons) ? reasons.filter((item) => typeof item === "string") : [];
}

function extractMissingCapabilities(seller: SellerJson): string[] {
  const capabilities = seller.kyc_evidence?.missing_capabilities;
  return Array.isArray(capabilities)
    ? capabilities.filter((item) => typeof item === "string")
    : [];
}

function buildAdminKycSummary(seller: SellerJson) {
  return {
    score: seller.kyc_score ?? 0,
    riesgo: seller.kyc_riesgo ?? null,
    checklist: seller.kyc_checklist ?? {},
    provider: seller.kyc_provider ?? null,
    provider_status: seller.kyc_provider_status ?? null,
    decision_reason: seller.kyc_decision_reason ?? null,
    verified_at: seller.kyc_verified_at ?? null,
    reviewed_at: seller.kyc_revisado_en ?? null,
    reviewed_by: seller.kyc_revisado_por ?? null,
    review_reasons: extractReviewReasons(seller),
    missing_capabilities: extractMissingCapabilities(seller),
  };
}

function buildAdminIdentityVerification(seller: SellerJson) {
  const evidence = seller.kyc_evidence ?? {};
  return {
    provider: seller.kyc_provider ?? null,
    provider_status: seller.kyc_provider_status ?? null,
    decision_reason: seller.kyc_decision_reason ?? null,
    verified_at: seller.kyc_verified_at ?? null,
    submitted_name: evidence.submitted_name ?? seller.nombre ?? null,
    submitted_dpi: evidence.submitted_dpi ?? seller.dpi ?? null,
    normalized_submitted_name: evidence.normalized_submitted_name ?? null,
    normalized_submitted_dpi: evidence.normalized_submitted_dpi ?? null,
    extracted_document: evidence.extracted_document ?? null,
    extracted_name_match: evidence.extracted_name_match ?? null,
    extracted_dpi_match: evidence.extracted_dpi_match ?? null,
    face_match: evidence.face_match ?? null,
    face_match_score: evidence.face_match_score ?? null,
    review_reasons: extractReviewReasons(seller),
    missing_capabilities: extractMissingCapabilities(seller),
    diagnostics: Array.isArray(evidence.provider_diagnostics)
      ? evidence.provider_diagnostics.filter((item: unknown) => typeof item === "string")
      : [],
    duplicate_dpi_count: evidence.duplicate_dpi_count ?? null,
    document_assessment: evidence.document_assessment ?? null,
    documents: {
      dpi_frente: {
        uploaded: Boolean(seller.foto_dpi_frente),
        storage_key: seller.foto_dpi_frente ?? null,
      },
      dpi_reverso: {
        uploaded: Boolean(seller.foto_dpi_reverso),
        storage_key: seller.foto_dpi_reverso ?? null,
      },
      selfie_con_dpi: {
        uploaded: Boolean(seller.selfie_con_dpi),
        storage_key: seller.selfie_con_dpi ?? null,
      },
    },
  };
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
  if (flags.includes("document_not_dpi"))     score += 45;
  if (flags.includes("document_type_unconfirmed")) score += 20;
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
  if (riskFlags.includes("document_not_dpi")) {
    insights.push({
      type: "document_not_dpi",
      message: "Uploaded KYC images do not appear to be a valid DPI document. Immediate identity review required.",
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
  if (seller.kyc_evidence?.review_reasons?.includes?.("document_not_dpi")) {
    alerts.push({
      type: "document_not_dpi",
      message: "Automatic verification indicates the uploaded images likely are not a DPI.",
      level: "critical",
    });
  } else if (seller.kyc_evidence?.review_reasons?.includes?.("document_type_not_confirmed")) {
    alerts.push({
      type: "document_type_unconfirmed",
      message: "Automatic verification could not confirm that the uploaded images are a DPI document.",
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
    const { estado_validacion, estado_admin, kyc_provider_status, q } = req.query;
    const [sellerAttributes, supportsProviderStatus] = await Promise.all([
      getSelectableSellerAttributes(),
      hasSellerProfileColumn("kyc_provider_status"),
    ]);


    const where: any = {};


    if (estado_validacion) {
      where.estado_validacion = estado_validacion;
    }


    if (estado_admin) {
      where.estado_admin = estado_admin;
    }

    if (kyc_provider_status && supportsProviderStatus) {
      where.kyc_provider_status = kyc_provider_status;
    }

    if (q && String(q).trim()) {
      const term = `%${String(q).trim()}%`;
      where[Op.or] = [
        { nombre: { [Op.iLike]: term } },
        { nombre_comercio: { [Op.iLike]: term } },
        { email: { [Op.iLike]: term } },
        { dpi: { [Op.iLike]: term } },
      ];
    }


    const sellers = await VendedorPerfil.findAll({
      attributes: sellerAttributes,
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
          kyc_summary: buildAdminKycSummary(seller.toJSON() as SellerJson),
          identity_verification: {
            provider: seller.kyc_provider ?? null,
            provider_status: seller.kyc_provider_status ?? null,
            decision_reason: seller.kyc_decision_reason ?? null,
            review_reasons: extractReviewReasons(seller.toJSON() as SellerJson),
          },
          documents_status: {
            dpi_frente_uploaded: Boolean(seller.foto_dpi_frente),
            dpi_reverso_uploaded: Boolean(seller.foto_dpi_reverso),
            selfie_uploaded: Boolean(seller.selfie_con_dpi),
          },
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
    const sellerAttributes = await getSelectableSellerAttributes();

    const seller = await VendedorPerfil.findOne({
      attributes: sellerAttributes,
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
    if (sellerData.kyc_evidence?.review_reasons?.includes?.("document_not_dpi")) {
      riskFlagsList.push("document_not_dpi");
    } else if (sellerData.kyc_evidence?.review_reasons?.includes?.("document_type_not_confirmed")) {
      riskFlagsList.push("document_type_unconfirmed");
    }

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
      ...(seller.kyc_verified_at
        ? [{ type: "kyc_verified", label: "Automated identity verification reached verified state", date: seller.kyc_verified_at }]
        : []),
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
        kyc_summary: buildAdminKycSummary(sellerData as SellerJson),
        identity_verification: buildAdminIdentityVerification(sellerData as SellerJson),
        kyc_debug: {
          review_reasons: extractReviewReasons(sellerData as SellerJson),
          missing_capabilities: extractMissingCapabilities(sellerData as SellerJson),
          diagnostics: Array.isArray(sellerData.kyc_evidence?.provider_diagnostics)
            ? sellerData.kyc_evidence.provider_diagnostics.filter((item: unknown) => typeof item === "string")
            : [],
          document_assessment: sellerData.kyc_evidence?.document_assessment ?? null,
          extracted_document: sellerData.kyc_evidence?.extracted_document ?? null,
        },
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
    const [
      supportsProviderStatus,
      supportsDecisionReason,
      supportsVerifiedAt,
    ] = await Promise.all([
      hasSellerProfileColumn("kyc_provider_status"),
      hasSellerProfileColumn("kyc_decision_reason"),
      hasSellerProfileColumn("kyc_verified_at"),
    ]);


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

    if (seller.kyc_evidence?.review_reasons?.includes?.("document_not_dpi")) {
      res.status(400).json({
        message: "No se puede aprobar. La automatizacion detecto que las imagenes no parecen un DPI.",
      });
      return;
    }


    const before = {
      estado_validacion: seller.estado_validacion,
      estado_admin: seller.estado_admin,
    };


    seller.estado_validacion = "aprobado";
    seller.estado_admin = "activo";
    if (supportsProviderStatus) seller.kyc_provider_status = "verified";
    if (supportsDecisionReason) seller.kyc_decision_reason = "approved_by_admin";
    if (supportsVerifiedAt) seller.kyc_verified_at = seller.kyc_verified_at ?? new Date();


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

    void logAuditEventFromRequest(req, {
      actor_user_id:  adminId,
      actor_role:     "admin",
      action:         "admin.seller.approve.success",
      entity_type:    "seller",
      entity_id:      String(seller.user_id),
      target_user_id: seller.user_id,
      status:         "success",
      severity:       "high",
      metadata:       { kyc_score: seller.kyc_score, before },
    });

    res.json({
      ok: true,
      message: "Vendedor aprobado correctamente",
    });

    // ── WhatsApp: notificar al seller que fue aprobado (fire-and-forget) ──────
    // Runs after response is sent so the admin UI is never delayed.
    setImmediate(async () => {
      try {
        const { sendKycApproved } = await import('../services/whatsappOnboarding.service');
        await sendKycApproved(seller.id, seller.user_id, seller.nombre);
      } catch (err) {
        console.error('[onboarding] sendKycApproved failed', err);
      }
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
    const [supportsProviderStatus, supportsDecisionReason] = await Promise.all([
      hasSellerProfileColumn("kyc_provider_status"),
      hasSellerProfileColumn("kyc_decision_reason"),
    ]);


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
    if (supportsProviderStatus) seller.kyc_provider_status = "failed";
    if (supportsDecisionReason) seller.kyc_decision_reason = "rejected_by_admin";


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

    void logAuditEventFromRequest(req, {
      actor_user_id:  adminId,
      actor_role:     "admin",
      action:         "admin.seller.reject.success",
      entity_type:    "seller",
      entity_id:      String(seller.user_id),
      target_user_id: seller.user_id,
      status:         "success",
      severity:       "high",
      metadata:       { before },
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

    void logAuditEventFromRequest(req, {
      actor_user_id:  adminId,
      actor_role:     "admin",
      action:         "admin.seller.suspend.success",
      entity_type:    "seller",
      entity_id:      String(seller.user_id),
      target_user_id: seller.user_id,
      status:         "success",
      severity:       "critical",
      metadata:       { before },
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

    if (seller.estado_admin === "eliminado") {
      res.status(403).json({
        message: "Este vendedor ha sido eliminado y no puede ser reactivado",
      });
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


/* ======================================================
   🔹 ELIMINATE SELLER
   Logical deletion — sets estado_admin = 'eliminado',
   deactivates all products. Irreversible via normal flow.
====================================================== */
export const eliminateSeller: RequestHandler = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const userId  = Number(req.params.id);
    const adminId = Number(req.user!.id);
    const { reason } = req.body;

    if (!reason || String(reason).trim() === "") {
      await t.rollback();
      res.status(400).json({
        message: "Debe especificar el motivo de la eliminación",
      });
      return;
    }

    const seller = await VendedorPerfil.findOne({
      where: { user_id: userId },
      transaction: t,
    });

    if (!seller) {
      await t.rollback();
      res.status(404).json({ message: "Vendedor no encontrado" });
      return;
    }

    // Idempotent — already eliminated, return success without re-running
    if (seller.estado_admin === "eliminado") {
      await t.rollback();
      res.json({
        ok: true,
        message: "El vendedor ya estaba eliminado",
      });
      return;
    }

    const before = {
      estado_admin:      seller.estado_admin,
      estado_validacion: seller.estado_validacion,
    };

    // 1. Mark seller as eliminated
    seller.estado_admin = "eliminado";
    await seller.save({ transaction: t });

    // 2. Deactivate all products atomically in the same transaction
    await sequelize.query(
      `UPDATE productos SET activo = false WHERE vendedor_id = :userId`,
      {
        replacements: { userId },
        transaction:  t,
      }
    );

    await t.commit();

    // 3. Admin audit trail
    await logAdminEvent({
      entityType: "seller",
      entityId:   seller.id,
      action:     "SELLER_ELIMINATED",
      performedBy: adminId,
      comment:    String(reason).trim(),
      metadata: {
        before,
        after: { estado_admin: "eliminado" },
        reason: String(reason).trim(),
      },
    });

    // 4. Comprehensive audit event
    void logAuditEventFromRequest(req, {
      actor_user_id:  adminId,
      actor_role:     "admin",
      action:         "admin.seller.eliminate.success",
      entity_type:    "seller",
      entity_id:      String(seller.user_id),
      target_user_id: seller.user_id,
      status:         "success",
      severity:       "critical",
      metadata:       { before, reason: String(reason).trim() },
    });

    res.json({
      ok:      true,
      message: "Vendedor eliminado correctamente",
    });

  } catch (error) {
    await t.rollback();
    console.error("eliminateSeller error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const requestKycDocuments: RequestHandler = async (req, res) => {
  try {
    const userId  = Number(req.params.id);
    const adminId = Number(req.user!.id);
    const { comment } = req.body;
    const [supportsProviderStatus, supportsDecisionReason] = await Promise.all([
      hasSellerProfileColumn("kyc_provider_status"),
      hasSellerProfileColumn("kyc_decision_reason"),
    ]);

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
    if (supportsProviderStatus) seller.kyc_provider_status = "pending_manual_review";
    if (supportsDecisionReason) seller.kyc_decision_reason = "additional_documents_requested_by_admin";

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
    const [
      supportsProviderStatus,
      supportsDecisionReason,
      supportsVerifiedAt,
    ] = await Promise.all([
      hasSellerProfileColumn("kyc_provider_status"),
      hasSellerProfileColumn("kyc_decision_reason"),
      hasSellerProfileColumn("kyc_verified_at"),
    ]);

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
    if (supportsProviderStatus) {
      seller.kyc_provider_status = score >= 80 ? "verified" : "pending_manual_review";
    }
    if (supportsDecisionReason) {
      seller.kyc_decision_reason = "kyc_review_updated_by_admin";
    }
    if (supportsVerifiedAt) {
      seller.kyc_verified_at = score >= 80 ? (seller.kyc_verified_at ?? new Date()) : null;
    }

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

/* ======================================================
   🔑 GET SELLER KYC SIGNED URLS
   GET /api/admin/sellers/:id/kyc-urls
   Returns time-limited signed URLs for all KYC documents.
   Handles both legacy rows (full public URL) and new rows (path key).
====================================================== */

/**
 * Resolves a stored KYC field value to a viewable URL.
 *
 * Legacy rows stored the full Supabase public URL.
 * New rows store only the storage path key (e.g. "dpi_frente/uuid.jpg").
 *
 * - Full URL → returned as-is (still accessible while bucket is public)
 * - Path key → signed URL valid for 1 hour
 * - null/undefined → null (document was not uploaded)
 */
function extractKycStoragePath(stored: string): string | null {
  const trimmed = stored.trim();
  if (!trimmed) return null;

  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return trimmed.includes("/") ? trimmed : null;
  }

  const marker = "/vendedores_dpi/";
  const markerIndex = trimmed.indexOf(marker);
  if (markerIndex === -1) return null;

  const pathPart = trimmed.slice(markerIndex + marker.length).split("?")[0].trim();
  if (!pathPart || !pathPart.includes("/")) return null;

  return pathPart;
}

async function resolveKycUrl(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return null;

  try {
    const storagePath = extractKycStoragePath(stored);
    if (!storagePath) return null;
    return await getKycSignedUrl(storagePath);
  } catch (error) {
    console.error("resolveKycUrl error:", error);
    return null;
  }
}

export const getSellerKycUrls: RequestHandler = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      res.status(400).json({ ok: false, message: "ID inválido" });
      return;
    }

    const seller = await VendedorPerfil.findOne({
      where: { user_id: userId },
      attributes: ["id", "user_id", "foto_dpi_frente", "foto_dpi_reverso", "selfie_con_dpi"],
    });

    if (!seller) {
      res.status(404).json({ ok: false, message: "Vendedor no encontrado" });
      return;
    }

    const [fotoFrente, fotoReverso, selfie] = await Promise.all([
      resolveKycUrl(seller.foto_dpi_frente),
      resolveKycUrl(seller.foto_dpi_reverso),
      resolveKycUrl(seller.selfie_con_dpi),
    ]);

    void logAuditEventFromRequest(req, {
      actor_user_id:  req.user!.id,
      actor_role:     "admin",
      action:         "admin.kyc.view.success",
      entity_type:    "seller",
      entity_id:      String(seller.user_id),
      target_user_id: seller.user_id,
      status:         "success",
      severity:       "high",
      metadata:       {
        docs_available: {
          foto_dpi_frente:  !!fotoFrente,
          foto_dpi_reverso: !!fotoReverso,
          selfie_con_dpi:   !!selfie,
        },
      },
    });

    res.json({
      ok: true,
      data: {
        seller_user_id:  seller.user_id,
        foto_dpi_frente: fotoFrente,
        foto_dpi_reverso: fotoReverso,
        selfie_con_dpi:  selfie,
      },
    });
  } catch (error) {
    console.error("getSellerKycUrls error:", error);
    res.status(500).json({ ok: false, message: "Error interno al generar URLs" });
  }
};

export const rerunSellerKycAutomation: RequestHandler = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const adminId = Number(req.user!.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      res.status(400).json({ ok: false, message: "ID inválido" });
      return;
    }

    const [sellerAttributes, sellerColumns] = await Promise.all([
      getSelectableSellerAttributes(),
      getSellerProfileColumns(),
    ]);

    const seller = await VendedorPerfil.findOne({
      attributes: sellerAttributes,
      where: { user_id: userId },
    });

    if (!seller) {
      res.status(404).json({ ok: false, message: "Vendedor no encontrado" });
      return;
    }

    const files = await Promise.all([
      seller.foto_dpi_frente ? downloadKycFile(seller.foto_dpi_frente).catch(() => null) : Promise.resolve(null),
      seller.foto_dpi_reverso ? downloadKycFile(seller.foto_dpi_reverso).catch(() => null) : Promise.resolve(null),
      seller.selfie_con_dpi ? downloadKycFile(seller.selfie_con_dpi).catch(() => null) : Promise.resolve(null),
    ]);

    const [frontFile, backFile, selfieFile] = files;

    const identitySignals = await resolveKycIdentitySignals({
      sellerName: seller.nombre,
      dpi: seller.dpi ?? "",
      fotoFrente: frontFile
        ? { buffer: frontFile.buffer, mimeType: frontFile.mimeType ?? "image/jpeg" }
        : null,
      fotoReverso: backFile
        ? { buffer: backFile.buffer, mimeType: backFile.mimeType ?? "image/jpeg" }
        : null,
      selfie: selfieFile
        ? { buffer: selfieFile.buffer, mimeType: selfieFile.mimeType ?? "image/jpeg" }
        : null,
    });

    const duplicateDpiCount = seller.dpi
      ? await VendedorPerfil.count({ where: { dpi: seller.dpi, id: { [Op.ne]: seller.id } } })
      : 0;

    const kyc = runKYCAnalysis({
      sellerName: seller.nombre,
      dpi: seller.dpi ?? "",
      fotoFrente: seller.foto_dpi_frente ?? null,
      fotoReverso: seller.foto_dpi_reverso ?? null,
      selfie: seller.selfie_con_dpi ?? null,
      duplicateDpiCount,
      providerName: identitySignals.provider,
      providerStatus: identitySignals.providerStatus,
      extractedDocument: identitySignals.extractedDocument,
      documentAssessment: identitySignals.documentAssessment,
      faceMatch: identitySignals.faceMatch,
      faceMatchScore: identitySignals.faceMatchScore,
    });

    const automaticObservation =
      kyc.decision.reason === "document_not_dpi"
        ? "Deteccion automatica: las imagenes cargadas no parecen corresponder a un DPI valido."
        : kyc.evidence.review_reasons.includes("document_not_dpi")
          ? "Alerta automatica: las imagenes cargadas no parecen corresponder claramente a un DPI."
          : null;

    const before = {
      estado_validacion: seller.estado_validacion,
      estado_admin: seller.estado_admin,
      kyc_score: seller.kyc_score,
      kyc_riesgo: seller.kyc_riesgo,
    };

    const updates = pickExistingSellerColumns(
      {
        estado_validacion: kyc.decision.estadoValidacion,
        estado_admin: kyc.decision.estadoAdmin,
        observaciones: automaticObservation,
        actualizado_en: new Date(),
        kyc_score: kyc.score,
        kyc_riesgo: kyc.riesgo,
        kyc_checklist: kyc.checklist,
        kyc_provider: kyc.evidence.provider,
        kyc_provider_status: kyc.evidence.provider_status,
        kyc_decision_reason: kyc.decision.reason,
        kyc_evidence: {
          ...kyc.evidence,
          provider_diagnostics: identitySignals.diagnostics,
        },
        kyc_verified_at: kyc.decision.autoApproved ? new Date() : null,
      },
      sellerColumns,
    );

    await seller.update(updates);

    await logAdminEvent({
      entityType: "seller",
      entityId: seller.id,
      action: "KYC_AUTOMATION_RERUN",
      performedBy: adminId,
      comment: automaticObservation ?? undefined,
      metadata: {
        before,
        after: {
          estado_validacion: seller.estado_validacion,
          estado_admin: seller.estado_admin,
          kyc_score: seller.kyc_score,
          kyc_riesgo: seller.kyc_riesgo,
          kyc_decision_reason: (seller as any).kyc_decision_reason ?? null,
        },
        review_reasons: kyc.evidence.review_reasons,
        diagnostics: identitySignals.diagnostics,
      },
    });

    res.json({
      ok: true,
      message: "KYC automatico re-ejecutado correctamente",
      data: {
        estado_validacion: seller.estado_validacion,
        estado_admin: seller.estado_admin,
        kyc_score: seller.kyc_score,
        kyc_riesgo: seller.kyc_riesgo,
        review_reasons: kyc.evidence.review_reasons,
        diagnostics: identitySignals.diagnostics,
      },
    });
  } catch (error) {
    console.error("rerunSellerKycAutomation error:", error);
    res.status(500).json({ ok: false, message: "Error interno al re-ejecutar KYC" });
  }
};
