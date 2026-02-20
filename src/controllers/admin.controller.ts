import { Request, Response, RequestHandler } from "express";
import { QueryTypes } from "sequelize";
import { sequelize } from "../config/db";
import { User } from "../models/user.model";
import Product from "../models/product.model";
import { VendedorPerfil } from "../models/VendedorPerfil";
import { Ticket } from "../models/ticket.model";
import { TicketMessage } from "../models/ticketMessage.model";

/* =====================================================
   📊 ADMIN DASHBOARD — OBSERVACIÓN (FASE DEMO)
===================================================== */
export const getAdminDashboard: RequestHandler = async (req, res) => {
  try {

    // ===============================
    // 👥 TOTAL USUARIOS
    // ===============================
    const [[usuarios]]: any = await sequelize.query(`
      SELECT COUNT(*)::int AS total
      FROM users
    `);

    // ===============================
    // 🏪 SELLERS PENDIENTES (KYC)
    // ===============================
    const [[sellersPendientes]]: any = await sequelize.query(`
      SELECT COUNT(*)::int AS pendientes
      FROM vendedor_perfil
      WHERE estado_validacion = 'pendiente'
    `);

    // ===============================
    // 📦 PRODUCTOS REALMENTE VISIBLES
    // ===============================
    const [[productosActivos]]: any = await sequelize.query(`
      SELECT COUNT(*)::int AS activos
      FROM productos p
      JOIN vendedor_perfil s 
        ON s.user_id = p.vendedor_id
      WHERE 
        p.activo = true
        AND s.estado_admin = 'activo'
        AND s.estado_validacion = 'aprobado'
    `);

    // ===============================
    // 🎫 TICKETS
    // ===============================
    const [[ticketsAbiertos]]: any = await sequelize.query(`
      SELECT COUNT(*)::int AS abiertos
      FROM tickets
      WHERE estado = 'abierto'
    `);

    const [[ticketsEnProceso]]: any = await sequelize.query(`
      SELECT COUNT(*)::int AS en_proceso
      FROM tickets
      WHERE estado = 'en_proceso'
    `);

    const [[ticketsCerrados]]: any = await sequelize.query(`
      SELECT COUNT(*)::int AS cerrados
      FROM tickets
      WHERE estado = 'cerrado'
    `);

    // ===============================
    // 📦 ÚLTIMOS PRODUCTOS VISIBLES
    // ===============================
    const [ultimosProductos]: any = await sequelize.query(`
      SELECT 
        p.id,
        p.nombre,
        p.precio,
        p.activo,
        s.nombre_comercio AS vendedor_nombre
      FROM productos p
      JOIN vendedor_perfil s 
        ON s.user_id = p.vendedor_id
      WHERE 
        p.activo = true
        AND s.estado_admin = 'activo'
        AND s.estado_validacion = 'aprobado'
      ORDER BY p.created_at DESC
      LIMIT 5
    `);

    // ===============================
    // 🏪 ÚLTIMOS SELLERS APROBADOS
    // ===============================
    const [ultimosSellers]: any = await sequelize.query(`
      SELECT 
        s.user_id,
        s.nombre_comercio,
        s.estado_validacion,
        s.estado_admin
      FROM vendedor_perfil s
      WHERE s.estado_validacion = 'aprobado'
      ORDER BY s."createdAt" DESC
      LIMIT 5
    `);

    // ===============================
    // RESPUESTA
    // ===============================
    res.json({
      success: true,
      data: {
        usuarios,
        sellers: sellersPendientes,
        productos: {
          activos: productosActivos.activos,
          inactivos: 0,
        },
        tickets: {
          abiertos: ticketsAbiertos.abiertos,
          en_proceso: ticketsEnProceso.en_proceso,
          cerrados: ticketsCerrados.cerrados,
        },
        ultimosProductos,
        ultimosSellers,
      },
    });

  } catch (error) {
    console.error("Error getAdminDashboard:", error);
    res.status(500).json({
      success: false,
      message: "Error obteniendo dashboard",
    });
  }
};

/* =====================================================
   🧾 SELLERS / KYC
===================================================== */
export const getPendingSellers: RequestHandler = async (_req, res) => {
  try {
    const sellers = await VendedorPerfil.findAll({
      where: { estado_validacion: "pendiente" },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "nombre", "correo", "telefono"],
        },
      ],
      order: [["createdAt", "ASC"]],
    });

    res.json({ ok: true, data: sellers });
  } catch (error) {
    console.error("Error getPendingSellers:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const getSellerForValidation: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const seller = await VendedorPerfil.findOne({
      where: { user_id: Number(id) },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "nombre", "correo", "telefono"],
        },
      ],
    });

    if (!seller) {
      res.status(404).json({ message: "Vendedor no encontrado" });
      return;
    }

    res.json({ ok: true, data: seller });
  } catch (error) {
    console.error("Error getSellerForValidation:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const aprobarVendedor: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const perfil = await VendedorPerfil.findOne({
      where: { user_id: Number(id) },
    });

    if (!perfil) {
      res.status(404).json({ message: "Vendedor no encontrado" });
      return;
    }

    await perfil.update({
      estado_validacion: "aprobado",
      observaciones: null,
      actualizado_en: new Date(),
    });

    res.json({ ok: true, message: "Vendedor aprobado correctamente" });
  } catch (error) {
    console.error("Error aprobarVendedor:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const rechazarVendedor: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { observaciones } = req.body;

    if (!observaciones) {
      res.status(400).json({
        message: "Debes enviar observaciones al rechazar",
      });
      return;
    }

    const perfil = await VendedorPerfil.findOne({
      where: { user_id: Number(id) },
    });

    if (!perfil) {
      res.status(404).json({ message: "Vendedor no encontrado" });
      return;
    }

    await perfil.update({
      estado_validacion: "rechazado",
      observaciones,
      actualizado_en: new Date(),
    });

    res.json({ ok: true, message: "Vendedor rechazado correctamente" });
  } catch (error) {
    console.error("Error rechazarVendedor:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

/* =====================================================
   🎫 TICKETS (ADMIN)
===================================================== */
export const getAllTickets: RequestHandler = async (req, res) => {
  try {
    const { estado } = req.query;

    const where: any = {};
    if (estado) where.estado = estado;

    const tickets = await Ticket.findAll({
      where,
      order: [["createdAt", "DESC"]],
    });

    res.json({ ok: true, data: tickets });
  } catch (error) {
    console.error("getAllTickets error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const getTicketDetailAdmin: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      res.status(404).json({ message: "Ticket no encontrado" });
      return;
    }

    const messages = await TicketMessage.findAll({
      where: { ticket_id: ticket.id },
      order: [["createdAt", "ASC"]],
    });

    res.json({ ok: true, data: { ticket, messages } });
  } catch (error) {
    console.error("getTicketDetailAdmin error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const assignTicket: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user!.id;

    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      res.status(404).json({ message: "Ticket no encontrado" });
      return;
    }

    await ticket.update({
      asignado_a: Number(adminId),
      estado: "en_proceso",
    });

    res.json({ ok: true, message: "Ticket asignado" });
  } catch (error) {
    console.error("assignTicket error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const changeTicketStatus: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      res.status(404).json({ message: "Ticket no encontrado" });
      return;
    }

    await ticket.update({
      estado,
      closedAt: estado === "cerrado" ? new Date() : null,
    });

    res.json({ ok: true, message: "Estado actualizado" });
  } catch (error) {
    console.error("changeTicketStatus error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const replyToTicketAdmin: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { mensaje } = req.body;
    const adminId = req.user!.id;

    await TicketMessage.create({
      ticket_id: Number(id),
      sender_id: Number(adminId),
      mensaje,
      es_admin: true,
    });

    await Ticket.update(
      { estado: "esperando_usuario" },
      { where: { id } }
    );

    res.json({ ok: true, message: "Respuesta enviada" });
  } catch (error) {
    console.error("replyToTicketAdmin error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

export const getAllAdminProducts: RequestHandler = async (req, res) => {
  try {

    const [productos]: any = await sequelize.query(`
      SELECT 
        p.id,
        p.nombre,
        p.precio,
        p.activo,
        p.created_at,
        p.vendedor_id,

        u.correo AS vendedor_email,
        s.nombre_comercio,
        s.estado_admin,
        s.estado_validacion,

        COALESCE(pv.total_views, 0) AS total_views,

        CASE
          WHEN p.activo = false THEN 'desactivado'
          WHEN p.vendedor_id IS NULL THEN 'sin_vendedor'
          WHEN s.estado_validacion != 'aprobado' THEN 'pendiente_kyc'
          WHEN s.estado_admin != 'activo' THEN 'bloqueado_seller'
          ELSE 'visible'
        END AS estado_marketplace

      FROM productos p

      LEFT JOIN vendedor_perfil s 
        ON s.user_id = p.vendedor_id

      LEFT JOIN users u
        ON u.id = p.vendedor_id

      LEFT JOIN (
        SELECT product_id, COUNT(*)::int AS total_views
        FROM product_views
        GROUP BY product_id
      ) pv ON pv.product_id = p.id

      ORDER BY p.created_at DESC
    `);

    // =====================================================
    // 🧠 RISK ENGINE (Determinístico)
    // =====================================================

    const enrichedProducts = productos.map((producto: any) => {

      const createdAt = new Date(producto.created_at).getTime();
      const now = Date.now();
      const daysSinceCreation =
        (now - createdAt) / (1000 * 60 * 60 * 24);

      let riskScore: number = 0;
      let riskLevel: "low" | "medium" | "high" = "low";

      if (
        producto.estado_marketplace === "sin_vendedor" ||
        producto.estado_marketplace === "bloqueado_seller" ||
        producto.estado_marketplace === "desactivado" ||
        producto.activo === false ||
        (producto.estado_admin &&
          producto.estado_admin !== "activo")
      ) {
        riskScore = 90;
        riskLevel = "high";
      }

      else if (producto.total_views === 0 && daysSinceCreation > 30) {
        riskScore = 60;
        riskLevel = "medium";
      }

      else if (producto.total_views === 0 && daysSinceCreation > 14) {
        riskScore = 40;
        riskLevel = "medium";
      }

      else {
        riskScore = 0;
        riskLevel = "low";
      }

      return {
        ...producto,
        risk: {
          score: riskScore,
          level: riskLevel,
        },
      };
    });

    res.json({
      success: true,
      data: enrichedProducts,
    });

  } catch (error) {
    console.error("Error getAllAdminProducts:", error);
    res.status(500).json({
      success: false,
      message: "Error obteniendo productos admin",
    });
  }
};

export const getAdminProductDetail = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    // =====================================================
    // 1️⃣ PRODUCTO + SELLER + ESTADO MARKETPLACE
    // =====================================================

    const [product]: any = await sequelize.query(
      `
      SELECT
        p.id,
        p.nombre,
        p.descripcion,
        p.precio,
        p.activo,
        p.created_at,
        p.vendedor_id,

        s.nombre_comercio,
        s.estado_admin,
        s.estado_validacion,

        u.correo AS vendedor_email,

        CASE
          WHEN p.activo = false THEN 'desactivado'
          WHEN p.vendedor_id IS NULL THEN 'sin_vendedor'
          WHEN s.estado_validacion != 'aprobado' THEN 'pendiente_kyc'
          WHEN s.estado_admin != 'activo' THEN 'bloqueado_seller'
          ELSE 'visible'
        END AS estado_marketplace

      FROM productos p
      LEFT JOIN vendedor_perfil s
        ON s.user_id = p.vendedor_id
      LEFT JOIN users u
        ON u.id = p.vendedor_id
      WHERE p.id = :id
      `,
      {
        replacements: { id },
      }
    );

    if (!product.length) {
      res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
      return;
    }

    const producto = product[0];

    // =====================================================
    // 2️⃣ IMÁGENES
    // =====================================================

    const [imagenes]: any = await sequelize.query(
      `
      SELECT id, url
      FROM producto_imagenes
      WHERE producto_id = :id
      `,
      {
        replacements: { id },
      }
    );

    // =====================================================
    // 3️⃣ MÉTRICAS
    // =====================================================

    const [[viewsTotal]]: any = await sequelize.query(
      `
      SELECT COUNT(*)::int AS total_views
      FROM product_views
      WHERE product_id = :id
      `,
      { replacements: { id } }
    );

    const [[views7d]]: any = await sequelize.query(
      `
      SELECT COUNT(*)::int AS views_7d
      FROM product_views
      WHERE product_id = :id
      AND created_at >= NOW() - INTERVAL '7 days'
      `,
      { replacements: { id } }
    );

    const [[views30d]]: any = await sequelize.query(
      `
      SELECT COUNT(*)::int AS views_30d
      FROM product_views
      WHERE product_id = :id
      AND created_at >= NOW() - INTERVAL '30 days'
      `,
      { replacements: { id } }
    );

    const [[lastView]]: any = await sequelize.query(
      `
      SELECT MAX(created_at) AS last_view
      FROM product_views
      WHERE product_id = :id
      `,
      { replacements: { id } }
    );

    const totalViews = viewsTotal?.total_views ?? 0;
    const viewsLast7d = views7d?.views_7d ?? 0;
    const viewsLast30d = views30d?.views_30d ?? 0;
    const lastViewDate = lastView?.last_view ?? null;

    // =====================================================
    // 4️⃣ FLAGS INTELIGENTES
    // =====================================================

    const isDeadProduct =
      totalViews === 0 &&
      new Date(producto.created_at).getTime() <
        Date.now() - 14 * 24 * 60 * 60 * 1000;

    const isSuspicious =
      viewsLast30d > 1000 &&
      producto.estado_marketplace !== "visible";

    // =====================================================
    // 🧠 RISK ENGINE FINAL (Determinístico)
    // =====================================================

    let riskScore = 0
    let riskLevel: "low" | "medium" | "high" = "low"

    const createdAt = new Date(producto.created_at).getTime()
    const now = Date.now()
    const daysSinceCreation = (now - createdAt) / (1000 * 60 * 60 * 24)

    // 🔴 REGLAS CRÍTICAS (SIEMPRE HIGH)
    if (
      producto.estado_marketplace === "sin_vendedor" ||
      producto.estado_marketplace === "bloqueado_seller" ||
      producto.activo === false ||
      (producto.estado_admin && producto.estado_admin !== "activo")
    ) {
      riskScore = 90
      riskLevel = "high"
    }

    // 🟡 Producto 30+ días sin views
    else if (totalViews === 0 && daysSinceCreation > 30) {
      riskScore = 60
      riskLevel = "medium"
    }

    // 🟡 Producto 14+ días sin views
    else if (totalViews === 0 && daysSinceCreation > 14) {
      riskScore = 40
      riskLevel = "medium"
    }

    // 🟢 Producto saludable
    else {
      riskScore = 0
      riskLevel = "low"
    }

    // =====================================================
    // RESPONSE FINAL
    // =====================================================

    res.json({
      success: true,
      data: {
        ...producto,
        imagenes,
        total_views: totalViews,
        views_7d: viewsLast7d,
        views_30d: viewsLast30d,
        last_view: lastViewDate,
        flags: {
          isDeadProduct,
          isSuspicious,
        },
        risk: {
          score: riskScore,
          level: riskLevel,
        },
      },
    });
  } catch (error) {
    console.error("Error getAdminProductDetail:", error);
    res.status(500).json({
      success: false,
      message: "Error obteniendo detalle admin del producto",
    });
  }
};