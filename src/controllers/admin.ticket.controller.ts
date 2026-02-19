import { RequestHandler } from "express";
import { Ticket } from "../models/ticket.model";
import { TicketMessage } from "../models/ticketMessage.model";

/* ======================================================
   📋 LISTAR TODOS LOS TICKETS
====================================================== */
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
    return;
  } catch (error) {
    console.error("getAllTickets error:", error);
    res.status(500).json({ message: "Error interno" });
    return;
  }
};

/* ======================================================
   🔍 DETALLE TICKET (ADMIN)
====================================================== */
export const getTicketDetailAdmin: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await Ticket.findByPk(Number(id));
    if (!ticket) {
      res.status(404).json({ message: "Ticket no encontrado" });
      return;
    }

    const messages = await TicketMessage.findAll({
      where: { ticket_id: ticket.id },
      order: [["createdAt", "ASC"]],
    });

    res.json({ ok: true, data: { ticket, messages } });
    return;
  } catch (error) {
    console.error("getTicketDetailAdmin error:", error);
    res.status(500).json({ message: "Error interno" });
    return;
  }
};

/* ======================================================
   💬 RESPONDER TICKET (ADMIN)
====================================================== */
export const replyToTicketAdmin: RequestHandler = async (req, res) => {
  try {
    const adminId = Number(req.user!.id);
    const { id } = req.params;
    const { mensaje } = req.body;

    if (!mensaje) {
      res.status(400).json({ message: "Mensaje requerido" });
      return;
    }

    await TicketMessage.create({
      ticket_id: Number(id),
      sender_id: adminId,
      mensaje,
      es_admin: true,
    });

    await Ticket.update(
      { estado: "esperando_usuario" },
      { where: { id: Number(id) } }
    );

    res.json({ ok: true, message: "Respuesta enviada" });
    return;
  } catch (error) {
    console.error("replyToTicketAdmin error:", error);
    res.status(500).json({ message: "Error interno" });
    return;
  }
};

/* ======================================================
   🔄 CAMBIAR ESTADO
====================================================== */
export const changeTicketStatus: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    await Ticket.update(
      {
        estado,
        closedAt: estado === "cerrado" ? new Date() : null,
      },
      { where: { id: Number(id) } }
    );

    res.json({ ok: true, message: "Estado actualizado" });
    return;
  } catch (error) {
    console.error("changeTicketStatus error:", error);
    res.status(500).json({ message: "Error interno" });
    return;
  }
};

/* ======================================================
   🧑‍💼 ASIGNAR TICKET
====================================================== */
export const assignTicket: RequestHandler = async (req, res) => {
  try {
    const adminId = Number(req.user!.id);
    const { id } = req.params;

    await Ticket.update(
      {
        asignado_a: adminId,
        estado: "en_proceso",
      },
      { where: { id: Number(id) } }
    );

    res.json({ ok: true, message: "Ticket asignado" });
    return;
  } catch (error) {
    console.error("assignTicket error:", error);
    res.status(500).json({ message: "Error interno" });
    return;
  }
};

/* ======================================================
   🔒 CERRAR TICKET (ADMIN)
====================================================== */
export const closeTicket: RequestHandler = async (req, res) => {
  try {
    const adminId = Number(req.user!.id);
    const { id } = req.params;

    const ticket = await Ticket.findByPk(Number(id));
    if (!ticket) {
      res.status(404).json({ message: "Ticket no encontrado" });
      return;
    }

    // ⛔ No cerrar dos veces
    if (ticket.estado === "cerrado") {
      res.status(400).json({ message: "El ticket ya está cerrado" });
      return;
    }

    // ⛔ Debe existir al menos un mensaje del admin
    const adminMessages = await TicketMessage.count({
      where: {
        ticket_id: ticket.id,
        es_admin: true,
      },
    });

    if (adminMessages === 0) {
      res.status(400).json({
        message: "No puedes cerrar un ticket sin haber respondido",
      });
      return;
    }

    await ticket.update({
      estado: "cerrado",
      closedAt: new Date(),
      asignado_a: adminId,
    });

    res.json({
      ok: true,
      message: "Ticket cerrado correctamente",
    });
    return;
  } catch (error) {
    console.error("closeTicket error:", error);
    res.status(500).json({ message: "Error interno" });
    return;
  }
};
