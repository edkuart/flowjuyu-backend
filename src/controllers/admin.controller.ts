import { RequestHandler } from "express";
import { User } from "../models/user.model";
import Product from "../models/product.model";
import { VendedorPerfil } from "../models/VendedorPerfil";
import { Ticket } from "../models/ticket.model";
import { TicketMessage } from "../models/ticketMessage.model";

/* =====================================================
   📊 ADMIN DASHBOARD (TOLERANTE)
===================================================== */
export const getAdminDashboard: RequestHandler = async (_req, res) => {
  try {
    // ======================
    // 👥 Usuarios
    // ======================
    const totalUsuarios = await User.count();

    // ======================
    // 🧾 Sellers / KYC
    // ======================
    const sellersPendientes = await VendedorPerfil.count({
      where: { estado_validacion: "pendiente" },
    });

    // ======================
    // 📦 Productos
    // ======================
    const productosActivos = await Product.count({
      where: { activo: true },
    });

    const productosInactivos = await Product.count({
      where: { activo: false },
    });

    // ======================
    // 🎫 Tickets (TOLERANTE)
    // ======================
    let ticketsAbiertos = 0;
    let ticketsEnProceso = 0;
    let ticketsCerrados = 0;

    try {
      ticketsAbiertos = await Ticket.count({
        where: { estado: "abierto" },
      });

      ticketsEnProceso = await Ticket.count({
        where: { estado: "en_proceso" },
      });

      ticketsCerrados = await Ticket.count({
        where: { estado: "cerrado" },
      });
    } catch (error) {
      console.warn("⚠️ Tickets aún no listos. Usando valores por defecto.");
    }

    res.json({
      ok: true,
      data: {
        usuarios: {
          total: totalUsuarios,
        },
        sellers: {
          pendientes: sellersPendientes,
        },
        productos: {
          activos: productosActivos,
          inactivos: productosInactivos,
        },
        tickets: {
          abiertos: ticketsAbiertos,
          en_proceso: ticketsEnProceso,
          cerrados: ticketsCerrados,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error en getAdminDashboard:", error);
    res.status(500).json({ message: "Error interno" });
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
