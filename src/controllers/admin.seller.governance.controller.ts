import { RequestHandler } from "express";
import { VendedorPerfil } from "../models/VendedorPerfil";
import { User } from "../models/user.model";
import AdminAuditEvent from "../models/adminAuditEvent.model";
import { logAdminEvent } from "../utils/logAdminEvent";
import Product from "../models/product.model";
import { sequelize } from "../config/db";
import { Ticket } from "../models/ticket.model";
import { TicketMessage } from "../models/ticketMessage.model";
import supabase from "../lib/supabase";

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
   🔹 SELLER DETAIL (CON HISTORIAL + KYC PRIVADO)
====================================================== */
export const getSellerDetail: RequestHandler = async (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isFinite(userId)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const seller = await VendedorPerfil.findOne({
      where: { user_id: userId },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "nombre", "correo", "telefono"],
        },
      ],
    });

    if (!seller) {
      return res.status(404).json({ message: "Vendedor no encontrado" });
    }

    const history = await AdminAuditEvent.findAll({
      where: {
        entity_type: "seller",
        entity_id: seller.id,
      },
      order: [["created_at", "DESC"]],
    });

    const sellerData = seller.toJSON();

    // =====================================================
    // 🔐 GENERAR SIGNED URLS PARA DOCUMENTOS KYC
    // =====================================================

    const generateSignedUrl = async (
      fullUrl: string | null | undefined
    ) => {
      if (!fullUrl) return null;

      let cleanPath = fullUrl;

      // 🔥 Si viene como URL completa, extraemos solo el path interno
      if (fullUrl.startsWith("http")) {
        const parts = fullUrl.split("/vendedores_dpi/");
        if (parts.length === 2) {
          cleanPath = parts[1];
        }
      }

      console.log("CLEAN PATH:", cleanPath);

      const { data, error } = await supabase.storage
        .from("vendedores_dpi")
        .createSignedUrl(cleanPath, 60);

      if (error) {
        console.error("Signed URL error:", error.message);
        return null;
      }

      return data?.signedUrl ?? null;
    };

    console.log("RAW PATHS FROM DB:", {
  frente: sellerData.foto_dpi_frente,
  reverso: sellerData.foto_dpi_reverso,
  selfie: sellerData.selfie_con_dpi,
});

    sellerData.foto_dpi_frente = await generateSignedUrl(
      sellerData.foto_dpi_frente
    );

    sellerData.foto_dpi_reverso = await generateSignedUrl(
      sellerData.foto_dpi_reverso
    );

    sellerData.selfie_con_dpi = await generateSignedUrl(
      sellerData.selfie_con_dpi
    );

    // 🔥 DEBUG AQUÍ
console.log("SIGNED URL RESULT:", {
  frente: sellerData.foto_dpi_frente,
  reverso: sellerData.foto_dpi_reverso,
  selfie: sellerData.selfie_con_dpi,
});

    // =====================================================
    // RESPONSE FINAL
    // =====================================================

    res.json({
      ok: true,
      data: {
        ...sellerData,
        audit_log: history,
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


    if (seller.estado_validacion !== "pendiente") {
      res.status(409).json({
        message: "Solo vendedores pendientes pueden aprobarse",
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
    const sellerProfileId = Number(req.params.id);
    const adminId = Number(req.user!.id);
    const { comment } = req.body;

    if (!comment) {
      return res.status(400).json({
        message: "Debe especificar el motivo de la solicitud",
      });
    }

    const seller = await VendedorPerfil.findByPk(sellerProfileId);

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
    const userId = Number(req.params.id);
    const adminId = Number(req.user!.id);

    const seller = await VendedorPerfil.findOne({
      where: { user_id: userId },
    });

    if (!seller) {
      return res.status(404).json({ message: "Vendedor no encontrado" });
    }

    const checklist = req.body;

    const totalChecks = Object.values(checklist).filter(Boolean).length;
    const score = Math.round((totalChecks / 5) * 100);

    let riesgo: "bajo" | "medio" | "alto" = "alto";
    if (score >= 80) riesgo = "bajo";
    else if (score >= 50) riesgo = "medio";

    const before = {
      kyc_score: seller.kyc_score,
      kyc_riesgo: seller.kyc_riesgo,
    };

    seller.kyc_checklist = checklist;
    seller.kyc_score = score;
    seller.kyc_riesgo = riesgo;
    seller.kyc_revisado_por = adminId;
    seller.kyc_revisado_en = new Date();

    await seller.save();

    // 🔥 AUDIT LOG
    await logAdminEvent({
      entityType: "seller",
      entityId: seller.id,
      action: "KYC_REVIEW_UPDATED",
      performedBy: adminId,
      metadata: {
        before,
        after: {
          kyc_score: score,
          kyc_riesgo: riesgo,
        },
      },
    });

    res.json({
      ok: true,
      message: "Revisión KYC guardada correctamente",
    });

  } catch (error) {
    console.error("saveKycReview error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

console.log("REVIEW KYC VERSION 2026 ACTIVE");
export const reviewSellerKYC: RequestHandler = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const adminId = Number(req.user!.id);

    const seller = await VendedorPerfil.findOne({
      where: { user_id: userId },
    });

    if (!seller) {
      return res.status(404).json({ message: "Vendedor no encontrado" });
    }

    const checklist = req.body;

    const totalChecks = Object.values(checklist).filter(Boolean).length;
    const score = Math.round((totalChecks / 5) * 100);

    let riesgo: "bajo" | "medio" | "alto" = "alto";
    if (score >= 80) riesgo = "bajo";
    else if (score >= 50) riesgo = "medio";

    const before = {
      kyc_score: seller.kyc_score,
      kyc_riesgo: seller.kyc_riesgo,
    };

    seller.kyc_checklist = checklist;
    seller.kyc_score = score;
    seller.kyc_riesgo = riesgo;
    seller.kyc_revisado_por = adminId;
    seller.kyc_revisado_en = new Date();

    await seller.save();

    console.log("CREANDO AUDIT CON ID:", seller.id);

    // 🔥 AUDIT LOG
    await logAdminEvent({
      entityType: "seller",
      entityId: seller.id,
      action: "KYC_REVIEW_UPDATED",
      performedBy: adminId,
      metadata: {
        before,
        after: {
          kyc_score: score,
          kyc_riesgo: riesgo,
        },
      },
    });

    res.json({
      ok: true,
      message: "REVISION 2026 NUEVA VERSION ACTIVA",
    });

  } catch (error) {
    console.error("reviewSellerKYC error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};