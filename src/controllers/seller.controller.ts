// src/controllers/seller.controller.ts
import { Request, Response, RequestHandler } from "express";
import { VendedorPerfil } from "../models/VendedorPerfil";
import type { PhoneNumber } from "../models/VendedorPerfil";
import { QueryTypes } from "sequelize";
import { User } from "../models/user.model";
import { sequelize } from "../config/db";
import supabase from "../lib/supabase";
import Product from "../models/product.model";
import { getSellerAnalyticsData } from "../services/analytics.service";
import { v4 as uuidv4 } from "uuid";
import { verifyRefreshToken } from "../lib/jwt";
import { getRefreshTokenFromRequest } from "../lib/cookies";
import { logAuditEventFromRequest } from "../services/audit.service";
import { checkKycAbuse } from "../services/abuseDetection.service";
import { KYC_RULES } from "../config/securityRules";
import { evaluateKycDefense } from "../services/activeDefense.service";
import { buildMediaProxyUrl } from "../utils/mediaProxy";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/seller/entry-point
//
// Lightweight probe used by the Next.js server component at /seller to
// determine where to redirect the seller.
//
// Authenticates via the HttpOnly refresh cookie (fj_rt) — NOT the access
// token — so it can be called directly from a Next.js server component
// without localStorage access.
//
// Returns the minimal routing fields only; no sensitive KYC documents.
// ─────────────────────────────────────────────────────────────────────────────
export const getSellerEntryData: RequestHandler = async (req, res): Promise<void> => {
  try {
    // ── Validate refresh cookie ──
    const rawToken = getRefreshTokenFromRequest(req);

    if (!rawToken) {
      res.status(401).json({ ok: false, message: "No hay sesión activa" });
      return;
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(rawToken);
    } catch {
      res.status(401).json({ ok: false, message: "Sesión expirada" });
      return;
    }

    const userId = Number(decoded.sub);

    // ── Load profile (routing fields only) ──
    const perfil = await VendedorPerfil.findOne({
      where: { user_id: userId },
      attributes: [
        "nombre_comercio",
        "descripcion",
        "banner_url",
        "telefono",
        "telefono_comercio",
        "estado_validacion",
        "estado_admin",
      ],
    });

    if (!perfil) {
      res.json({ ok: true, perfil: null });
      return;
    }

    res.json({
      ok: true,
      perfil: {
        nombre_comercio:   perfil.nombre_comercio,
        descripcion:       perfil.descripcion       ?? null,
        banner_url:        perfil.banner_url        ?? null,
        telefono:          perfil.telefono          ?? null,
        telefono_comercio: perfil.telefono_comercio ?? null,
        estado_validacion: perfil.estado_validacion,
        estado_admin:      perfil.estado_admin,
      },
    });
  } catch (error) {
    console.error("Error en getSellerEntryData:", error);
    res.status(500).json({ ok: false, message: "Error del servidor" });
  }
};

// ==============================
// Dashboard general del vendedor
// ==============================
export const getSellerDashboard: RequestHandler = async (req, res) => {
  try {
    
    const user = (req as any).user;

    if (!user || user.role !== "seller") {
      res.status(403).json({ message: "No autorizado" });
      return;
    }

    const vendedorId = user.id;

    // ============================
    // 📦 Métricas de productos
    // ============================
    const [productoStats]: any = await sequelize.query(
      `
      SELECT
        COUNT(*)::int AS total_productos,
        COUNT(*) FILTER (WHERE activo = true)::int AS activos,
        COUNT(*) FILTER (WHERE activo = false)::int AS inactivos,
        COUNT(*) FILTER (WHERE stock < 5 AND activo = true)::int AS stock_bajo
      FROM productos
      WHERE vendedor_id = :vid
      `,
      {
        replacements: { vid: vendedorId },
        type: QueryTypes.SELECT,
      }
    );

    // ============================
    // 📊 KPIs base (ventas aún no implementadas)
    // ============================
    const kpi = {
      ventasMes: 0,
      pedidosMes: 0,
      ticketPromedio: 0,
      productosActivos: productoStats.activos ?? 0,
    };

    res.json({
      kpi,

      productoStats: {
        total: productoStats.total_productos ?? 0,
        activos: productoStats.activos ?? 0,
        inactivos: productoStats.inactivos ?? 0,
        stock_bajo: productoStats.stock_bajo ?? 0,
      },

      // 🔜 placeholders conscientes (no fake data)
      ventasPorMes: [],
      topCategorias: [],
      actividad: [],
      lowStock: [],
      validaciones: [],
    });
  } catch (error) {
    console.error("Error en getSellerDashboard:", error);
    res.status(500).json({
      message: "Error al cargar el dashboard del vendedor",
    });
  }
};

export const getSellerKpis: RequestHandler = async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    // 🔹 Ventas y pedidos (placeholder realista)
    const [ventas]: any = await sequelize.query(
      `
      SELECT 
        COALESCE(SUM(total), 0) AS ventasMes,
        COUNT(*) AS pedidosMes
      FROM pedidos
      WHERE vendedor_id = :vid
      AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
      `,
      { replacements: { vid: user.id } }
    );

    const ventasMes = Number(ventas[0]?.ventasmes ?? 0);
    const pedidosMes = Number(ventas[0]?.pedidosmes ?? 0);

    res.json({
      ventasMes,
      pedidosMes,
      ticketPromedio: pedidosMes ? ventasMes / pedidosMes : 0,
      productosActivos: 0, // lo llenamos luego
    });
  } catch (e) {
    console.error("Error KPIs:", e);
    res.status(500).json({ message: "Error al obtener KPIs" });
  }
};

// ==============================
// Pedidos del vendedor (pendiente)
// ==============================
export const getSellerOrders: RequestHandler = async (_req, res) => {
  try {
    res.json({
      ok: true,
      message: "Pedidos del vendedor (pendiente de implementar)",
      data: [],
    });
  } catch (error) {
    console.error("Error en getSellerOrders:", error);
    res.status(500).json({ ok: false, message: "Error al obtener pedidos" });
  }
};

// ==============================
// Productos del vendedor autenticado
// ==============================
export const getSellerProducts: RequestHandler = async (req, res) => {
  try {
    const u: any = (req as any).user;

    if (!u?.id) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    const perfil = await VendedorPerfil.findOne({
      where: { user_id: u.id }
    });

    if (!perfil) {
      res.status(404).json({
        message: "Perfil vendedor no encontrado"
      });
      return;
    }

    const rows: any[] = await sequelize.query(
      `
      SELECT id, nombre, precio, stock, activo, imagen_url
      FROM productos
      WHERE vendedor_id = :vid
      ORDER BY created_at DESC
      `,
      {
        replacements: { vid: perfil.user_id }, // ⚠️ ajusta si es perfil.id
        type: QueryTypes.SELECT
      }
    );

    res.json(rows);

  } catch (e: any) {
    console.error("❌ Error en getSellerProducts:", e);
    res.status(500).json({
      message: "Error al obtener productos",
      error: e.message
    });
  }
};

// ==============================
// Obtener perfil del vendedor (autenticado o público)
// ==============================
export const getSellerProfile: RequestHandler = async (
  req,
  res
): Promise<void> => {
  try {
    const user = (req as any).user || null;
    const { id } = req.params;

    // ================================
    // Validación ID numérico
    // ================================
    if (id && isNaN(Number(id))) {
      res
        .status(400)
        .json({ ok: false, message: "El parámetro 'id' debe ser numérico" });
      return;
    }

    const targetId = id || user?.id;

    if (!targetId) {
      res
        .status(401)
        .json({ ok: false, message: "Usuario no autenticado" });
      return;
    }

    // ================================
    // Buscar perfil
    // ================================
    const perfil = await VendedorPerfil.findOne({
      where: { user_id: targetId },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "nombre", "correo", "rol"],
        },
      ],
    });

    if (!perfil) {
      res.status(404).json({ ok: false, message: "Perfil no encontrado" });
      return;
    }

    // ================================
    // Obtener rating agregado REAL
    // ================================
    const ratingRows: any[] = await sequelize.query(
      `
      SELECT 
        COUNT(r.id) AS rating_count,
        COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0) AS rating_avg
      FROM productos p
      LEFT JOIN reviews r ON r.producto_id = p.id
      WHERE p.vendedor_id = :sellerId
      `,
      {
        replacements: { sellerId: perfil.user_id },
        type: QueryTypes.SELECT,
      }
    );

    const ratingData = ratingRows[0] || {
      rating_avg: 0,
      rating_count: 0,
    };

    // ================================
    // Determinar modo público / preview
    // ================================
    const esPropietario =
      Number(user?.id) === Number(perfil.user_id);

    const forcePublic = req.query.preview === "true";

    if (!esPropietario || forcePublic) {
      res.json({
        id: perfil.id,
        nombre_comercio: perfil.nombre_comercio,
        descripcion: perfil.descripcion,
        logo: buildMediaProxyUrl(perfil.logo),
        departamento: perfil.departamento,
        municipio: perfil.municipio,
        rating_avg: Number(ratingData.rating_avg),
        rating_count: Number(ratingData.rating_count),
      });
      return;
    }

    // ================================
    // Respuesta completa para dueño
    // ================================
    res.json({
      ...perfil.toJSON(),
      rating_avg: Number(ratingData.rating_avg),
      rating_count: Number(ratingData.rating_count),
    });

  } catch (error) {
    console.error("Error en getSellerProfile:", error);
    res
      .status(500)
      .json({ ok: false, message: "Error al obtener perfil" });
  }
};

// ==============================
// Actualizar perfil del vendedor
// ==============================
export const updateSellerProfile: RequestHandler = async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      res.status(401).json({ ok: false, message: "No autorizado" });
    return;

    }

    const perfil = await VendedorPerfil.findOne({ where: { user_id: user.id } });
    if (!perfil) {
      res.status(404).json({ ok: false, message: "Perfil no encontrado" });
      return;
    }

    let logoUrl = perfil.logo;

    // 🧹 Eliminar logo explícitamente (primer archivo lo hacía)
    if (req.body.logo === null || req.body.logo === "null") {
      if (perfil.logo) {
        const prevFile = perfil.logo.split("/").pop();
        if (prevFile) {
          await supabase.storage.from("logos_comercios")
          .remove([`vendedores/${prevFile}`]);
        }
      }
      logoUrl = null;
    }

    // 🖼 Subir nuevo logo
    if (req.file) {
      if (perfil.logo) {
        const prevFile = perfil.logo.split("/").pop();
        if (prevFile) {
          await supabase.storage.from("logos_comercios").remove([`vendedores/${prevFile}`]);
        }
      }

      const ext = req.file.originalname.split(".").pop();
      const fileName = `vendedores/${uuidv4()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("logos_comercios")
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage
        .from("logos_comercios")
        .getPublicUrl(fileName);

      logoUrl = publicUrl.publicUrl;
    }

    // Parse header_style (arrives as a JSON string from multipart FormData).
    // Always falls back to the existing value on any parsing or validation failure.
    const VALID_MODES = new Set(["gradient", "image", "image+overlay"]);
    const VALID_GRADIENT_VARIANTS = new Set(["default", "suave", "calido", "oscuro"]);
    let headerStyle: any = perfil.header_style ?? null;

    if (req.body.header_style !== undefined) {
      try {
        const raw =
          typeof req.body.header_style === "string"
            ? JSON.parse(req.body.header_style)
            : req.body.header_style;

        // Validate known fields individually — preserve unknown-but-safe fields
        // like gradient_variant rather than rebuilding from scratch
        if (raw && typeof raw === "object") {
          headerStyle = {
            mode: VALID_MODES.has(raw.mode) ? raw.mode : "gradient",
            overlay_color:
              typeof raw.overlay_color === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.overlay_color)
                ? raw.overlay_color
                : "#0f2e22",
            overlay_opacity:
              typeof raw.overlay_opacity === "number" &&
              raw.overlay_opacity >= 0 &&
              raw.overlay_opacity <= 1
                ? raw.overlay_opacity
                : 0.7,
            // Preserve gradient_variant — only store recognised values
            ...(typeof raw.gradient_variant === "string" && VALID_GRADIENT_VARIANTS.has(raw.gradient_variant)
              ? { gradient_variant: raw.gradient_variant }
              : {}),
          };
        } else {
          // Unexpected shape — keep existing
        }
      } catch {
        // Invalid JSON — keep existing value; do not crash the request
      }
    }

    // Parse and validate a PhoneNumber object from a multipart string field.
    // Returns the existing value if input is absent, null if explicitly cleared,
    // or the validated PhoneNumber if the input is valid.
    const parsePhone = (
      raw: string | undefined,
      existing: PhoneNumber | null | undefined,
    ): PhoneNumber | null => {
      if (raw === undefined) return existing ?? null;
      if (raw === "" || raw === "null") return null;
      try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        const cc  = parsed?.country_code;
        const num = parsed?.number;
        if (
          typeof cc === "string" && /^\d{1,4}$/.test(cc) &&
          typeof num === "string" && /^\d{4,15}$/.test(num)
        ) {
          return { country_code: cc, number: num };
        }
      } catch { /* invalid JSON — fall through to return null */ }
      return existing ?? null;
    };

    // Normalize social URLs:
    //   - undefined (field not sent) → keep existing value via ??
    //   - "" (user cleared field)    → null
    //   - "instagram.com/..."        → "https://instagram.com/..."
    const normalizeSocial = (
      raw: string | undefined,
      existing: string | null | undefined,
    ): string | null => {
      if (raw === undefined) return existing ?? null;
      const trimmed = raw.trim();
      if (!trimmed) return null;
      return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    };

    const fieldsToUpdate = {
      nombre_comercio:   req.body.nombre_comercio   ?? perfil.nombre_comercio,
      descripcion:       req.body.descripcion       ?? perfil.descripcion,
      telefono_comercio: parsePhone(req.body.telefono_comercio, perfil.telefono_comercio),
      direccion:         req.body.direccion         ?? perfil.direccion,
      departamento:      req.body.departamento      ?? perfil.departamento,
      municipio:         req.body.municipio         ?? perfil.municipio,
      whatsapp_numero:   parsePhone(req.body.whatsapp_numero, perfil.whatsapp_numero),
      mensaje_destacado: req.body.mensaje_destacado ?? perfil.mensaje_destacado,
      instagram:    normalizeSocial(req.body.instagram, perfil.instagram),
      facebook:     normalizeSocial(req.body.facebook,  perfil.facebook),
      tiktok:       normalizeSocial(req.body.tiktok,    perfil.tiktok),
      header_style: headerStyle,
      logo:         logoUrl,
      updatedAt:    new Date(),
    };

    await VendedorPerfil.update(fieldsToUpdate, { where: { user_id: user.id } });

    // ── Onboarding state: advance SELLER_REGISTERED → PROFILE_STARTED ────────
    // Only advances if both required fields are present AND state hasn't
    // moved past PROFILE_STARTED yet (guards against overwriting later states).
    const finalNombreComercio = fieldsToUpdate.nombre_comercio;
    const finalDepartamento   = fieldsToUpdate.departamento;
    if (finalNombreComercio && finalDepartamento) {
      await VendedorPerfil.update(
        { onboarding_state: 'PROFILE_STARTED' },
        {
          where: {
            user_id:          user.id,
            onboarding_state: 'SELLER_REGISTERED',
          },
        }
      );
    }

    const updatedPerfil = await VendedorPerfil.findOne({ where: { user_id: user.id } });

    void logAuditEventFromRequest(req, {
      actor_user_id: user.id,
      actor_role:    user.role ?? "seller",
      action:        "seller.profile.update.success",
      entity_type:   "seller",
      entity_id:     String(user.id),
      status:        "success",
      severity:      "low",
      metadata:      { logo_changed: !!req.file, fields: Object.keys(fieldsToUpdate) },
    });

    res.json({
      ok: true,
      message: "Perfil actualizado correctamente",
      perfil: updatedPerfil,
    });
  } catch (error: any) {
    console.error("❌ Error en updateSellerProfile:", error);
    res.status(500).json({
      ok: false,
      message: "Error al actualizar perfil",
      error: error.message,
    });
  }
};

// ==============================
// Validación de comercio
// ==============================
export const validateSellerBusiness: RequestHandler = async (req, res) => {
  const requestId =
    (req.headers["x-request-id"] as string | undefined) ?? uuidv4();

  const logError = (
    stage: string,
    error: any,
    context: Record<string, unknown> = {}
  ) => {
    console.error("[validateSellerBusiness]", {
      requestId,
      stage,
      userId: (req as any)?.user?.id,
      message: error?.message,
      name: error?.name,
      statusCode: error?.statusCode,
      error,
      ...context,
    });
  };

  try {
    const user = (req as any).user;

    if (!user?.id) {
      res.status(401).json({ message: "No autenticado", requestId });
      return;
    }

    const abuseCheck = await checkKycAbuse({
      userId: user.id,
      ip:     req.ip ?? req.socket?.remoteAddress ?? "unknown",
    });

    if (abuseCheck.blocked) {
      void logAuditEventFromRequest(req, {
        actor_user_id: user.id,
        actor_role:    user.role ?? "seller",
        action:        "seller.kyc.upload.blocked",
        entity_type:   "seller",
        entity_id:     String(user.id),
        status:        "blocked",
        severity:      "critical",
        metadata: {
          reason:        abuseCheck.reason,
          threshold:     KYC_RULES.maxAttempts,
          windowMinutes: KYC_RULES.windowMinutes,
          retryAfter:    abuseCheck.retryAfter,
        },
      });
      res.setHeader("Retry-After", String(abuseCheck.retryAfter ?? KYC_RULES.blockDurationMinutes * 60));
      res.status(429).json({
        ok:      false,
        code:    "ABUSE_PROTECTION_TRIGGERED",
        message: "Too many attempts. Please try again later.",
      });
      return;
    }

    const defense = await evaluateKycDefense({
      userId: user.id,
      ip:     req.ip ?? req.socket?.remoteAddress ?? "unknown",
    });

    if (defense.decision === "cooldown") {
      void logAuditEventFromRequest(req, {
        actor_user_id: user.id,
        actor_role:    user.role ?? "seller",
        action:        "defense.kyc.cooldown_applied",
        entity_type:   "seller",
        entity_id:     String(user.id),
        status:        "blocked",
        severity:      "high",
        metadata: {
          reason:             defense.reason,
          retryAfter:         defense.retryAfter,
          restrictionCreated: defense.restrictionCreated ?? false,
        },
      });
      if (defense.retryAfter) {
        res.setHeader("Retry-After", String(defense.retryAfter));
      }
      res.status(429).json({
        ok:      false,
        code:    "ACTIVE_DEFENSE_TRIGGERED",
        message: "Action temporarily restricted. Please try again later.",
      });
      return;
    }

    if (defense.decision === "manual_review") {
      void logAuditEventFromRequest(req, {
        actor_user_id: user.id,
        actor_role:    user.role ?? "seller",
        action:        "defense.kyc.manual_review_required",
        entity_type:   "seller",
        entity_id:     String(user.id),
        status:        "blocked",
        severity:      "critical",
        metadata: {
          reason:             defense.reason,
          retryAfter:         defense.retryAfter,
          restrictionCreated: defense.restrictionCreated ?? false,
        },
      });
      res.status(403).json({
        ok:      false,
        code:    "MANUAL_REVIEW_REQUIRED",
        message: "This action requires manual review before continuing.",
      });
      return;
    }

    if (defense.decision === "deny") {
      void logAuditEventFromRequest(req, {
        actor_user_id: user.id,
        actor_role:    user.role ?? "seller",
        action:        "defense.kyc.block_applied",
        entity_type:   "seller",
        entity_id:     String(user.id),
        status:        "blocked",
        severity:      "critical",
        metadata: {
          reason:             defense.reason,
          retryAfter:         defense.retryAfter,
          restrictionCreated: defense.restrictionCreated ?? false,
        },
      });
      if (defense.retryAfter) {
        res.setHeader("Retry-After", String(defense.retryAfter));
      }
      res.status(403).json({
        ok:      false,
        code:    "ACTIVE_DEFENSE_TRIGGERED",
        message: "Action temporarily restricted. Please try again later.",
      });
      return;
    }

    const perfil = await VendedorPerfil.findOne({
      where: { user_id: user.id },
    });

    if (!perfil) {
      res.status(404).json({ message: "Perfil no encontrado", requestId });
      return;
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!files || Object.keys(files).length === 0) {
      res
        .status(400)
        .json({ message: "Debes subir al menos un documento", requestId });
      return;
    }

    const updateFields: any = {};

    const uploadToSupabase = async (file: Express.Multer.File, folder: string) => {
      if (!file?.buffer?.length) {
        throw new Error("Archivo inválido: buffer vacío");
      }

      const extFromMime = file.mimetype
        ?.split("/")?.[1]
        ?.replace("jpeg", "jpg");
      const extFromOriginalName = file.originalname?.split(".").pop();
      const ext = extFromOriginalName || extFromMime || "jpg";

      const fileName = `${folder}/${uuidv4()}.${ext}`;

      const { error } = await supabase.storage
        .from("vendedores_dpi")
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        logError("supabase_upload", error, {
          folder,
          fileName,
          mimetype: file.mimetype,
          size: file.size,
        });
        throw new Error(
          `Supabase upload failed for ${folder}: ${error.message}`
        );
      }

      const { data } = supabase.storage
        .from("vendedores_dpi")
        .getPublicUrl(fileName);

      if (!data?.publicUrl) {
        throw new Error(`No se pudo generar publicUrl para ${fileName}`);
      }

      return fileName;
    };

    if (files.foto_dpi_frente?.[0]) {
      updateFields.foto_dpi_frente = await uploadToSupabase(
        files.foto_dpi_frente[0],
        "dpi_frente"
      );
    }

    if (files.foto_dpi_reverso?.[0]) {
      updateFields.foto_dpi_reverso = await uploadToSupabase(
        files.foto_dpi_reverso[0],
        "dpi_reverso"
      );
    }

    if (files.selfie_con_dpi?.[0]) {
      updateFields.selfie_con_dpi = await uploadToSupabase(
        files.selfie_con_dpi[0],
        "selfie"
      );
    }

    // ✅ Guard: evita “success” si no llegó ningún doc válido
    const hasDocs = Object.keys(updateFields).some(
      (k) => k.startsWith("foto_") || k.startsWith("selfie")
    );
    if (!hasDocs) {
      res
        .status(400)
        .json({ message: "No se recibieron documentos válidos", requestId });
      return;
    }

    updateFields.estado_validacion = "en_revision";
    updateFields.observaciones = null;
    updateFields.actualizado_en = new Date();

    await VendedorPerfil.update(updateFields, {
      where: { user_id: user.id },
    });

    void logAuditEventFromRequest(req, {
      actor_user_id: user.id,
      actor_role:    user.role ?? "seller",
      action:        "seller.kyc.revalidate.success",
      entity_type:   "seller",
      entity_id:     String(user.id),
      status:        "success",
      severity:      "medium",
      metadata:      { docs_submitted: Object.keys(updateFields).filter(k => k.startsWith("foto_") || k.startsWith("selfie")) },
    });

    res.json({
      ok: true,
      message: "Documentos enviados correctamente. Están en revisión.",
      requestId,
    });
  } catch (error: any) {
    logError("controller", error);

    void logAuditEventFromRequest(req, {
      actor_user_id: (req as any).user?.id ?? null,
      actor_role:    (req as any).user?.role ?? "seller",
      action:        "seller.kyc.upload.failed",
      entity_type:   "seller",
      entity_id:     (req as any).user?.id ? String((req as any).user.id) : null,
      status:        "failed",
      severity:      "high",
      metadata:      { reason: error?.message },
    });

    const status =
      typeof error?.message === "string" &&
      error.message.includes("Supabase upload failed")
        ? 502
        : 500;

    res.status(status).json({
      message:
        status === 502
          ? "Error al subir documentos al storage"
          : "Error al enviar documentos",
      requestId,
      error: error.message,
    });
  }
};

// ==============================
// Listado público de vendedores
// ==============================
export const getSellers: RequestHandler = async (_req, res): Promise<void> => {
  try {
    const [rows]: any = await sequelize.query(`
      SELECT 
        user_id AS id,
        COALESCE(nombre_comercio, nombre, 'Tienda sin nombre') AS nombre,
        logo AS logo_url,
        descripcion,
        departamento,
        municipio,
        "createdAt"
      FROM vendedor_perfil
      WHERE estado_admin = 'activo'
      AND estado_validacion = 'aprobado'
      ORDER BY "createdAt" DESC
      LIMIT 10
    `);

    res.json(
      (rows ?? []).map((row: any) => ({
        ...row,
        logo_url: buildMediaProxyUrl(row.logo_url),
      }))
    );
  } catch (error: any) {
    console.error("Error al obtener tiendas:", error);
    res.status(500).json({ message: "Error al obtener tiendas", error: error.message });
  }
};

export const getTopSellers = async (req: Request, res: Response) => {
  try {
    // Reviews belong to products, not directly to sellers.
    // Chain: vendedor_perfil → productos (vendedor_id) → reviews (product_id)
    const sellers = await sequelize.query(
      `
      SELECT
        vp.user_id     AS vendedor_id,
        vp.nombre_comercio,
        vp.logo,
        vp.banner_url,
        vp.departamento,
        vp.municipio,
        COUNT(r.id)    AS total_reviews,
        COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0) AS rating_avg,
        (
          (COUNT(r.id)::float / (COUNT(r.id) + 5)) * COALESCE(AVG(r.rating), 0)
          +
          (5.0 / (COUNT(r.id) + 5)) * 3.5
        ) AS weighted_score
      FROM vendedor_perfil vp
      LEFT JOIN productos p ON p.vendedor_id = vp.user_id
      LEFT JOIN reviews r ON r.producto_id = p.id
      WHERE vp.estado_validacion = 'aprobado'
        AND vp.estado_admin      = 'activo'
      GROUP BY vp.user_id, vp.nombre_comercio, vp.logo, vp.banner_url, vp.departamento, vp.municipio
      ORDER BY weighted_score DESC NULLS LAST
      LIMIT 10
      `,
      { type: QueryTypes.SELECT }
    );

    const normalized = (sellers as any[]).map((s) => ({
      id: Number(s.vendedor_id),
      nombre_comercio: s.nombre_comercio ?? null,
      logo_url: buildMediaProxyUrl(s.logo ?? null),
      banner_url: buildMediaProxyUrl(s.banner_url ?? null),
      departamento: s.departamento ?? null,
      municipio: s.municipio ?? null,
      total_reviews: Number(s.total_reviews),
      rating_avg: Number(Number(s.rating_avg).toFixed(2)),
      weighted_score: Number(Number(s.weighted_score).toFixed(3)),
    }));

    res.json({ data: normalized });

  } catch (error) {
    console.error("[getTopSellers] ERROR:", (error as any)?.message);
    console.error("[getTopSellers] SQL:", (error as any)?.parent?.message);
    console.error("[getTopSellers] STACK:", (error as any)?.stack);
    res.json({ data: [] });
  }
};

// ==============================
// Vista pública completa de tienda
// ==============================
export const getPublicSellerStore: RequestHandler = async (req, res) => {
  try {
    const sellerId = Number(req.params.id);

    if (!Number.isInteger(sellerId) || sellerId <= 0) {
      res.status(400).json({ message: "Invalid seller ID" });
      return;
    }

    const seller: any[] = await sequelize.query(
      `
      SELECT
        vp.user_id             AS id,
        vp.nombre_comercio,
        vp.descripcion,
        vp.logo,
        vp.departamento,
        vp.municipio,
        vp.plan,
        vp.plan_activo,
        vp.whatsapp_numero,
        vp.telefono_comercio,
        vp.banner_url,
        vp.identidad_tags,
        vp.productos_destacados,
        vp.mensaje_destacado,
        vp.estado_validacion,
        vp.instagram,
        vp.facebook,
        vp.tiktok,
        vp.header_style,
        vp."createdAt"
      FROM vendedor_perfil vp
      WHERE vp.user_id = :id
      `,
      {
        replacements: { id: sellerId },
        type: QueryTypes.SELECT,
      }
    );


    if (!seller.length) {
      res.status(404).json({ message: "Vendedor no encontrado" });
      return;
    }

    const sellerData = seller[0];

    const products: any[] = await sequelize.query(
      `
      SELECT
        p.id,
        p.nombre,
        p.precio,
        p.imagen_url,
        p.internal_code,
        p.created_at
      FROM productos p
      WHERE p.vendedor_id = :id
        AND p.activo = true
      ORDER BY p.created_at DESC
      `,
      {
        replacements: { id: sellerId },
        type: QueryTypes.SELECT,
      }
    );


    res.json({
      seller: {
        id:                   sellerData.id,
        nombre_comercio:      sellerData.nombre_comercio,
        descripcion:          sellerData.descripcion,
        logo:                 buildMediaProxyUrl(sellerData.logo),
        departamento:         sellerData.departamento,
        municipio:            sellerData.municipio,
        plan:                 sellerData.plan,
        plan_activo:          sellerData.plan_activo,
        whatsapp:             sellerData.whatsapp_numero || sellerData.telefono_comercio || null,
        banner_url:           buildMediaProxyUrl(sellerData.banner_url),
        identidad_tags:       sellerData.identidad_tags       ?? [],
        productos_destacados: sellerData.productos_destacados ?? [],
        mensaje_destacado:    sellerData.mensaje_destacado    ?? null,
        estado_validacion:    sellerData.estado_validacion    ?? null,
        instagram:            sellerData.instagram            ?? null,
        facebook:             sellerData.facebook             ?? null,
        tiktok:               sellerData.tiktok               ?? null,
        header_style:         sellerData.header_style         ?? null,
        // Handle both Sequelize camelCase and raw snake_case column names
        created_at:           sellerData.createdAt            ?? sellerData.created_at ?? null,
      },
      products: (products ?? []).map((product: any) => ({
        ...product,
        imagen_url: buildMediaProxyUrl(product.imagen_url),
      })),
    });

  } catch (error) {
    console.error("[getPublicSellerStore] Error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const getSellerAccountStatus: RequestHandler = async (req, res) => {
  try {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ ok: false, message: "No autenticado" })
      return
    }

    const [rows]: any = await sequelize.query(
      `
      SELECT
        estado_validacion,
        estado_admin,
        observaciones,
        actualizado_en,
        foto_dpi_frente,
        foto_dpi_reverso,
        selfie_con_dpi
      FROM vendedor_perfil
      WHERE user_id = :user_id
      `,
      {
        replacements: { user_id: userId },
      }
    )

    if (!rows.length) {
      res.status(404).json({ ok: false, message: "Perfil no encontrado" })
      return
    }

    const perfil = rows[0]

    const puedeOperar =
      perfil.estado_admin === "activo" &&
      perfil.estado_validacion === "aprobado";

    res.json({
      ok: true,
      data: {
        estado_validacion: perfil.estado_validacion,
        estado_admin: perfil.estado_admin,
        ultima_revision: perfil.actualizado_en,
        observaciones_generales: perfil.observaciones,

        documentos: {
          dpi_frente: { subido: !!perfil.foto_dpi_frente },
          dpi_reverso: { subido: !!perfil.foto_dpi_reverso },
          selfie_con_dpi: { subido: !!perfil.selfie_con_dpi },
        },

        puede_publicar: puedeOperar,
        visible_publicamente: puedeOperar,
        puede_operar: puedeOperar,
      },
    });

  } catch (error) {
    console.error("Error getSellerAccountStatus:", error)
    res.status(500).json({ ok: false, message: "Error interno del servidor" })
  }
}

export const getSellerAnalytics: RequestHandler = async (req, res) => {
  try {
    const user: any = (req as any).user;

    if (!user?.id) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const sellerId = user.id;

    const data = await getSellerAnalyticsData(Number(sellerId));

    const conversionRatio =
      data.totalProductViews > 0
        ? Number(
            (data.totalIntentions / data.totalProductViews).toFixed(4)
          )
        : 0;

        console.log("🚨 LOCAL ANALYTICS CONTROLLER EJECUTÁNDOSE");
        console.log("🚨 LAST30 LOCAL:", data.last30Days);

    res.json({
      success: true,

      totalProductViews: data.totalProductViews,
      totalProfileViews: data.totalProfileViews,

      totalIntentions: data.totalIntentions,
      conversionRatio,

      topProducts: data.topProducts,
      topIntentedProducts: data.topIntentionProducts,

      last30Days: data.last30Days,

      // Phase 2
      totalWhatsappClicks:  data.totalWhatsappClicks,
      last30WhatsappClicks: data.last30WhatsappClicks,
      totalReviews:         data.totalReviews,
      avgRating:            data.avgRating,
    });

  } catch (error) {
    console.error("Error getSellerAnalytics:", error);
    res.status(500).json({
      message: "Error interno del servidor",
    });
  }
};

export const getSellerAnalyticsDaily: RequestHandler = async (req, res) => {
  try {
    const user: any = (req as any).user;

    if (!user?.id) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    const sellerId = Number(user.id);
    if (!Number.isFinite(sellerId)) {
      res.status(400).json({ message: "sellerId inválido" });
      return;
    }

    const days = 30;

    const productDaily: any[] = await sequelize.query(
      `
      WITH date_range AS (
        SELECT (CURRENT_DATE - (gs || ' days')::interval)::date AS day
        FROM generate_series(:daysMinus1, 0, -1) gs
      )
      SELECT
        dr.day::text AS date,
        COALESCE(pv.cnt, 0)::int AS product_views
      FROM date_range dr
      LEFT JOIN (
        SELECT view_date AS day, COUNT(*)::int AS cnt
        FROM product_views
        WHERE seller_id = :sellerId
          AND view_date >= (CURRENT_DATE - (:daysMinus1 || ' days')::interval)::date
        GROUP BY view_date
      ) pv ON pv.day = dr.day
      ORDER BY dr.day ASC
      `,
      {
        replacements: {
          sellerId,
          daysMinus1: days - 1,
        },
        type: QueryTypes.SELECT,
      }
    );

    let profileDaily: any[] = [];
    try {
      profileDaily = await sequelize.query(
        `
        WITH date_range AS (
          SELECT (CURRENT_DATE - (gs || ' days')::interval)::date AS day
          FROM generate_series(:daysMinus1, 0, -1) gs
        )
        SELECT
          dr.day::text AS date,
          COALESCE(sv.cnt, 0)::int AS profile_views
        FROM date_range dr
        LEFT JOIN (
          SELECT view_date AS day, COUNT(*)::int AS cnt
          FROM seller_views
          WHERE seller_id = :sellerId
            AND view_date >= (CURRENT_DATE - (:daysMinus1 || ' days')::interval)::date
          GROUP BY view_date
        ) sv ON sv.day = dr.day
        ORDER BY dr.day ASC
        `,
        {
          replacements: {
            sellerId,
            daysMinus1: days - 1,
          },
          type: QueryTypes.SELECT,
        }
      );
    } catch {
      profileDaily = productDaily.map((r) => ({
        date: r.date,
        profile_views: 0,
      }));
    }

    const merged = productDaily.map((p) => {
      const s = profileDaily.find((x) => x.date === p.date);
      return {
        date: p.date,
        product_views: p.product_views ?? 0,
        profile_views: s?.profile_views ?? 0,
      };
    });

    res.json({
      success: true,
      days,
      data: merged,
    });
  } catch (error) {
    console.error("Error getSellerAnalyticsDaily:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ===========================
// 📊 Product analytics per product (QR vs web vs total)
// GET /api/seller/analytics/products
// ===========================
export const getSellerProductAnalytics: RequestHandler = async (req, res) => {
  try {
    const user: any = (req as any).user;

    if (!user?.id) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    const sellerId = user.id;

    const rows: any[] = await sequelize.query(
      `SELECT
        p.id           AS product_id,
        p.nombre,
        p.internal_code,
        COUNT(pv.id)::int                                              AS views_total,
        COUNT(*) FILTER (WHERE pv.source = 'code')::int               AS views_qr,
        COUNT(*) FILTER (WHERE pv.source = 'web')::int                AS views_web
      FROM productos p
      LEFT JOIN product_views pv ON pv.product_id = p.id
      WHERE p.vendedor_id = :sellerId
      GROUP BY p.id, p.nombre, p.internal_code
      ORDER BY views_total DESC`,
      {
        replacements: { sellerId },
        type: QueryTypes.SELECT,
      }
    ) as any[];

    res.json({ success: true, data: rows ?? [] });
  } catch (error) {
    console.error("Error getSellerProductAnalytics:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ===========================
// 📈 Growth: last 7 days vs previous 7 days
// GET /api/seller/analytics/growth
// ===========================
export const getSellerGrowthAnalytics: RequestHandler = async (req, res) => {
  try {
    const user: any = (req as any).user;

    if (!user?.id) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    const sellerId = user.id;

    // Single-pass conditional aggregation — no extra joins
    const [row]: any = await sequelize.query(
      `SELECT
        COUNT(*) FILTER (
          WHERE pv.viewed_at >= CURRENT_DATE - INTERVAL '7 days'
        )::int AS views_last7,

        COUNT(*) FILTER (
          WHERE pv.viewed_at >= CURRENT_DATE - INTERVAL '14 days'
            AND pv.viewed_at  < CURRENT_DATE - INTERVAL '7 days'
        )::int AS views_prev7,

        COUNT(*) FILTER (
          WHERE pv.source = 'code'
            AND pv.viewed_at >= CURRENT_DATE - INTERVAL '7 days'
        )::int AS qr_last7,

        COUNT(*) FILTER (
          WHERE pv.source = 'code'
            AND pv.viewed_at >= CURRENT_DATE - INTERVAL '14 days'
            AND pv.viewed_at  < CURRENT_DATE - INTERVAL '7 days'
        )::int AS qr_prev7

      FROM product_views pv
      JOIN productos p ON p.id = pv.product_id
      WHERE p.vendedor_id = :sellerId
        AND pv.viewed_at >= CURRENT_DATE - INTERVAL '14 days'`,
      { replacements: { sellerId }, type: QueryTypes.SELECT }
    );

    const views_last7: number = row?.views_last7 ?? 0;
    const views_prev7: number = row?.views_prev7 ?? 0;
    const qr_last7:    number = row?.qr_last7    ?? 0;
    const qr_prev7:    number = row?.qr_prev7    ?? 0;

    function changePct(cur: number, prev: number): number {
      if (prev > 0) return Math.round(((cur - prev) / prev) * 100);
      if (cur  > 0) return 100;
      return 0;
    }

    res.json({
      success: true,
      views_last7,
      views_prev7,
      qr_last7,
      qr_prev7,
      views_change_percent: changePct(views_last7, views_prev7),
      qr_change_percent:    changePct(qr_last7,    qr_prev7),
    });
  } catch (error) {
    console.error("Error getSellerGrowthAnalytics:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ===========================
// 💡 Automatic seller insights
// GET /api/seller/analytics/insights
// ===========================

type InsightSeverity = "positive" | "warning" | "neutral"

interface Insight {
  type:     string
  severity: InsightSeverity
  title:    string
  message:  string
}

export const getSellerInsightsAnalytics: RequestHandler = async (req, res) => {
  try {
    const user: any = (req as any).user;

    if (!user?.id) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    const sellerId = user.id;

    // Reuse the same per-product query as getSellerProductAnalytics
    const rows: any[] = await sequelize.query(
      `SELECT
        p.id           AS product_id,
        p.nombre,
        COUNT(pv.id)::int                                    AS views_total,
        COUNT(*) FILTER (WHERE pv.source = 'code')::int     AS views_qr,
        COUNT(*) FILTER (WHERE pv.source = 'web')::int      AS views_web
      FROM productos p
      LEFT JOIN product_views pv ON pv.product_id = p.id
      WHERE p.vendedor_id = :sellerId
      GROUP BY p.id, p.nombre
      ORDER BY views_total DESC`,
      { replacements: { sellerId }, type: QueryTypes.SELECT }
    ) as any[];

    const insights: Insight[] = [];

    if (rows.length === 0) {
      insights.push({
        type:     "no_products",
        severity: "neutral",
        title:    "Aún no tienes productos",
        message:  "Crea tu primer producto para comenzar a recibir visitas.",
      });
      res.json({ success: true, insights });
      return;
    }

    const totalViews  = rows.reduce((s, r) => s + (r.views_total as number), 0);
    const totalQr     = rows.reduce((s, r) => s + (r.views_qr    as number), 0);
    const zeroCount   = rows.filter(r => (r.views_total as number) === 0).length;
    const activeCount = rows.length - zeroCount;
    const topProduct  = rows[0];

    // ── 1. No traffic at all ──────────────────────────────────────────────────
    if (totalViews === 0) {
      insights.push({
        type:     "no_views",
        severity: "warning",
        title:    "Tus productos aún no tienen visitas",
        message:  "Comparte los enlaces de tus productos o genera sus QR para atraer tus primeras visitas.",
      });
      res.json({ success: true, insights });
      return;
    }

    // ── 2. Top product share ──────────────────────────────────────────────────
    const topSharePct = Math.round((topProduct.views_total / totalViews) * 100);

    if (topSharePct >= 70 && rows.length > 1) {
      insights.push({
        type:     "traffic_concentrated",
        severity: "warning",
        title:    "El tráfico está muy concentrado",
        message:  `"${topProduct.nombre}" concentra el ${topSharePct}% de tus visitas. Considera compartir los demás productos.`,
      });
    } else if (topSharePct >= 40) {
      insights.push({
        type:     "top_product",
        severity: "positive",
        title:    "Tu producto más fuerte está liderando",
        message:  `"${topProduct.nombre}" concentra el ${topSharePct}% de tus visitas.`,
      });
    } else {
      insights.push({
        type:     "balanced_traffic",
        severity: "positive",
        title:    "Tráfico bien distribuido",
        message:  `Tus ${activeCount} producto${activeCount !== 1 ? "s" : ""} activo${activeCount !== 1 ? "s" : ""} reciben visitas de forma equilibrada.`,
      });
    }

    // ── 3. Products with zero views ───────────────────────────────────────────
    if (zeroCount === 1) {
      const zeroProduct = rows.find(r => r.views_total === 0);
      insights.push({
        type:     "zero_views",
        severity: "warning",
        title:    "Un producto no recibe visitas",
        message:  `"${zeroProduct?.nombre}" aún no tiene visitas. Comparte su enlace o QR.`,
      });
    } else if (zeroCount > 1) {
      insights.push({
        type:     "zero_views",
        severity: "warning",
        title:    "Tienes productos sin visitas",
        message:  `${zeroCount} producto${zeroCount !== 1 ? "s" : ""} aún no reciben visitas. Comparte sus enlaces o códigos QR.`,
      });
    }

    // ── 4. QR traffic share ───────────────────────────────────────────────────
    const qrSharePct = totalViews > 0 ? Math.round((totalQr / totalViews) * 100) : 0;

    if (qrSharePct >= 30) {
      insights.push({
        type:     "strong_qr_traffic",
        severity: "positive",
        title:    "Tu QR está funcionando",
        message:  `El ${qrSharePct}% de tus visitas llegan vía código QR. Sigue compartiéndolo.`,
      });
    } else if (totalQr === 0 && totalViews >= 10) {
      insights.push({
        type:     "no_qr_traffic",
        severity: "neutral",
        title:    "Sin tráfico vía QR todavía",
        message:  "Comparte el QR de tus productos en ferias, redes sociales o tienda física para abrir este canal.",
      });
    }

    // ── 5. All products have views (positive reinforcement) ───────────────────
    if (zeroCount === 0 && rows.length >= 3) {
      insights.push({
        type:     "full_catalogue_active",
        severity: "positive",
        title:    "Todo tu catálogo tiene visitas",
        message:  `Los ${rows.length} productos de tu catálogo han recibido al menos una visita.`,
      });
    }

    // ── 6. Single product — encourage expansion ───────────────────────────────
    if (rows.length === 1) {
      insights.push({
        type:     "single_product",
        severity: "neutral",
        title:    "Amplía tu catálogo",
        message:  "Tienes un solo producto. Agregar más aumenta las posibilidades de que los compradores encuentren tu tienda.",
      });
    }

    res.json({ success: true, insights });
  } catch (error) {
    console.error("Error getSellerInsightsAnalytics:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const updateSellerCustomization: RequestHandler = async (req, res) => {
  try {
    const user: any = (req as any).user
    if (!user?.id) {
      res.status(401).json({ message: "No autorizado" })
      return
    }

    const perfil = await VendedorPerfil.findOne({ where: { user_id: user.id } })
    if (!perfil) {
      res.status(404).json({ message: "Perfil no encontrado" })
      return
    }

    const { identidad_tags, productos_destacados, banner_url, mensaje_destacado } = req.body

    // ✅ Validaciones ANTES de guardar
    if (identidad_tags && identidad_tags.length > 4) {
      res.status(400).json({ message: "Máximo 4 etiquetas permitidas" })
      return
    }

    if (productos_destacados && productos_destacados.length > 3) {
      res.status(400).json({ message: "Máximo 3 productos destacados" })
      return
    }

    // ✅ Un solo update (incluye mensaje_destacado)
    await perfil.update({
      identidad_tags: identidad_tags ?? perfil.identidad_tags,
      productos_destacados: productos_destacados ?? perfil.productos_destacados,
      banner_url: banner_url ?? perfil.banner_url,
      mensaje_destacado: mensaje_destacado ?? perfil.mensaje_destacado,
      actualizado_en: new Date(),
    })

    res.json({ ok: true, message: "Personalización actualizada" })
  } catch (error: any) {
    console.error("Error updateSellerCustomization:", error)
    res.status(500).json({ message: "Error interno", error: error.message })
  }
}

export const updateSellerBanner: RequestHandler = async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ message: "No se envió archivo" });
      return;
    }

    const user = (req as any).user;
    if (!user?.id) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    const perfil = await VendedorPerfil.findOne({
      where: { user_id: user.id },
    });

    if (!perfil) {
      res.status(404).json({ message: "Perfil no encontrado" });
      return;
    }

    // 🔥 1. Eliminar banner anterior si existe
    if (perfil.banner_url) {
      const prevFile = perfil.banner_url.split("/").pop();
      if (prevFile) {
        await supabase.storage
          .from("banners_comercios")
          .remove([`vendedores/${prevFile}`]);
      }
    }

    // 🔥 2. Subir nuevo banner
    const ext = req.file.originalname.split(".").pop();
    const fileName = `vendedores/${uuidv4()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("banners_comercios")
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage
      .from("banners_comercios")
      .getPublicUrl(fileName);

    const publicUrl = data.publicUrl;

    await perfil.update({
      banner_url: publicUrl,
      actualizado_en: new Date(),
    });

    res.json({
      ok: true,
      banner_url: publicUrl,
    });

  } catch (error: any) {
    console.error("Error updateSellerBanner:", error);
    res.status(500).json({
      message: "Error subiendo banner",
      error: error.message,
    });
  }
};

export const deleteSellerBanner: RequestHandler = async (req, res) => {
  try {
    const user = (req as any).user;

    if (!user?.id) {
      res.status(401).json({ message: "No autenticado" });
      return;
    }

    const perfil = await VendedorPerfil.findOne({
      where: { user_id: user.id },
    });

    if (!perfil) {
      res.status(404).json({ message: "Perfil no encontrado" });
      return;
    }

    if (perfil.banner_url) {
      const prevFile = perfil.banner_url.split("/").pop();

      if (prevFile) {
        await supabase.storage
          .from("banners_comercios")
          .remove([`vendedores/${prevFile}`]);
      }
    }

    await perfil.update({
      banner_url: null,
      actualizado_en: new Date(),
    });

    res.json({ ok: true });

  } catch (error: any) {
    console.error("Error deleteSellerBanner:", error);
    res.status(500).json({
      message: "Error eliminando banner",
      error: error.message,
    });
  }
};

// ==============================
// POST /api/seller/activate
// Convert a buyer into a seller (1-click, no KYC required at this step).
// Idempotent: returns current state if the user is already a seller.
// ==============================

export const activateSeller: RequestHandler = async (req, res) => {
  try {
    const reqUser = (req as any).user as { id: number; role: string } | undefined;

    if (!reqUser) {
      res.status(401).json({ ok: false, message: "No autenticado" });
      return;
    }

    const user = await User.findByPk(reqUser.id);

    if (!user) {
      res.status(404).json({ ok: false, message: "Usuario no encontrado" });
      return;
    }

    // ── Already a seller — idempotent path ──────────────────────────────────
    if (user.rol === "seller") {
      // Ensure VendedorPerfil exists (defensive — handles edge cases)
      const existing = await VendedorPerfil.findOne({ where: { user_id: user.id } });
      if (!existing) {
        await VendedorPerfil.create({
          user_id:           user.id,
          nombre:            user.nombre,
          email:             user.correo,
          nombre_comercio:   user.nombre,
          estado_validacion: "pendiente",
          estado_admin:      "inactivo",
          plan:              "free",
          plan_activo:       false,
        });
      }
      res.status(200).json({
        ok:             true,
        already_seller: true,
        user: {
          id:    user.id,
          name:  user.nombre,
          email: user.correo,
          role:  user.rol,
        },
      });
      return;
    }

    // ── Promote buyer → seller ──────────────────────────────────────────────
    let newPerfilId: number | null = null;

    await sequelize.transaction(async (t) => {
      await user.update({ rol: "seller" }, { transaction: t });
      const newPerfil = await VendedorPerfil.create(
        {
          user_id:           user.id,
          nombre:            user.nombre,
          email:             user.correo,
          nombre_comercio:   user.nombre, // placeholder — editable in dashboard
          estado_validacion: "pendiente",
          estado_admin:      "inactivo",
          plan:              "free",
          plan_activo:       false,
        },
        { transaction: t },
      );
      newPerfilId = newPerfil.id;
    });

    await user.reload();

    // Emit seller_created after the transaction commits so listeners
    // see the committed row. Fire-and-forget via setImmediate inside emitEvent.
    if (newPerfilId !== null) {
      const { emitEvent } = await import("../lib/onboardingEvents");
      emitEvent("seller_created", {
        userId:           user.id,
        vendedorPerfilId: newPerfilId,
      });
    }

    res.status(200).json({
      ok:   true,
      user: {
        id:    user.id,
        name:  user.nombre,
        email: user.correo,
        role:  user.rol,
      },
    });
  } catch (error: any) {
    console.error("Error en activateSeller:", error);
    res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};
