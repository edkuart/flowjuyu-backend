import { RequestHandler } from "express";
import { Op } from "sequelize";
import { Ticket } from "../models/ticket.model";
import { TicketMessage } from "../models/ticketMessage.model";
import { VendedorPerfil } from "../models/VendedorPerfil";

/* ======================================================
   🔹 HEALTH ENGINE
====================================================== */

interface TicketHealth {
  urgency: "low" | "medium" | "high";
  status: "healthy" | "warning" | "critical";
  time_open_hours: number;
  time_since_last_reply: number | null;
}

function computeTicketHealth(
  ticket: { estado: string; prioridad: string; asignado_a: number | null; createdAt: Date | string },
  lastAdminMessageAt: Date | null = null,
): TicketHealth {
  const now               = Date.now();
  const time_open_hours   = (now - new Date(ticket.createdAt).getTime()) / 3600000;
  const time_since_last_reply = lastAdminMessageAt
    ? (now - lastAdminMessageAt.getTime()) / 3600000
    : null;

  let urgency: TicketHealth["urgency"] = "low";
  let status:  TicketHealth["status"]  = "healthy";

  if (["abierto", "en_proceso"].includes(ticket.estado)) {
    if (time_open_hours > 48) { status = "critical"; urgency = "high"; }
    else if (time_open_hours > 24) { status = "warning"; urgency = "medium"; }
  }

  if (ticket.prioridad === "alta" && !ticket.asignado_a) {
    status = "critical"; urgency = "high";
  }

  if (ticket.estado === "esperando_usuario" && time_since_last_reply !== null && time_since_last_reply > 48) {
    if (status !== "critical") status = "warning";
    if (urgency === "low") urgency = "medium";
  }

  return {
    urgency,
    status,
    time_open_hours:       Math.round(time_open_hours * 10) / 10,
    time_since_last_reply: time_since_last_reply !== null ? Math.round(time_since_last_reply * 10) / 10 : null,
  };
}

/* ======================================================
   🔹 ALERT ENGINE
====================================================== */

interface TicketAlert {
  type: string;
  message: string;
  level: "warning" | "critical";
}

function computeTicketAlerts(
  ticket: { estado: string; prioridad: string; asignado_a: number | null; createdAt: Date | string },
  lastAdminMessageAt: Date | null,
): TicketAlert[] {
  const alerts: TicketAlert[] = [];
  const now       = Date.now();
  const hoursOpen = (now - new Date(ticket.createdAt).getTime()) / 3600000;

  // Open > 24h with no admin reply
  if (["abierto", "en_proceso"].includes(ticket.estado) && !lastAdminMessageAt && hoursOpen > 24) {
    alerts.push({
      type:    "no_admin_response",
      message: `Open for ${Math.floor(hoursOpen)}h with no admin response`,
      level:   "critical",
    });
  }

  // High priority & unassigned
  if (ticket.prioridad === "alta" && !ticket.asignado_a) {
    alerts.push({
      type:    "unassigned_high_priority",
      message: "High priority ticket is not assigned to any admin",
      level:   "warning",
    });
  }

  // Waiting for user > 48h
  if (ticket.estado === "esperando_usuario" && lastAdminMessageAt) {
    const hoursWaiting = (now - lastAdminMessageAt.getTime()) / 3600000;
    if (hoursWaiting > 48) {
      alerts.push({
        type:    "user_not_responding",
        message: `Waiting for user response for ${Math.floor(hoursWaiting)}h`,
        level:   "warning",
      });
    }
  }

  return alerts;
}

/* ======================================================
   📋 LIST ALL TICKETS
====================================================== */
export const getAllTickets: RequestHandler = async (req, res) => {
  try {
    const { estado, user_id } = req.query;

    const where: any = {};
    if (estado)   where.estado   = estado;
    if (user_id)  where.user_id  = Number(user_id);

    const tickets = await Ticket.findAll({
      where,
      order: [["createdAt", "DESC"]],
    });

    // Batch fetch sellers — avoids N+1
    const userIds = [...new Set(tickets.map((t) => t.user_id))];
    const sellers = userIds.length > 0
      ? await VendedorPerfil.findAll({
          where: { user_id: { [Op.in]: userIds } },
          attributes: ["id", "user_id", "nombre_comercio", "telefono_comercio"],
        })
      : [];
    const sellerMap = new Map(sellers.map((s) => [s.user_id, s]));

    const shaped = tickets.map((t) => {
      const s = sellerMap.get(t.user_id);
      return {
        ...t.toJSON(),
        seller: s
          ? { id: s.id, user_id: s.user_id, nombre_comercio: s.nombre_comercio, telefono_comercio: s.telefono_comercio ?? null }
          : null,
        ticket_health: computeTicketHealth(t.toJSON() as any),
      };
    });

    res.json({ ok: true, data: shaped });
  } catch (error) {
    console.error("getAllTickets error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ======================================================
   🔍 TICKET DETAIL (ADMIN)
====================================================== */
export const getTicketDetailAdmin: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await Ticket.findByPk(Number(id));
    if (!ticket) {
      res.status(404).json({ message: "Ticket no encontrado" });
      return;
    }

    const [messages, seller] = await Promise.all([
      TicketMessage.findAll({
        where: { ticket_id: ticket.id },
        order: [["createdAt", "ASC"]],
      }),
      VendedorPerfil.findOne({
        where: { user_id: ticket.user_id },
        attributes: [
          "id", "user_id", "nombre_comercio", "telefono_comercio",
          "estado_validacion", "kyc_score", "kyc_riesgo",
        ],
      }),
    ]);

    const lastAdminMsg     = [...messages].reverse().find((m) => m.es_admin);
    const lastAdminMsgAt   = lastAdminMsg ? new Date(lastAdminMsg.createdAt) : null;
    const alerts           = computeTicketAlerts(ticket.toJSON() as any, lastAdminMsgAt);
    const ticket_health    = computeTicketHealth(ticket.toJSON() as any, lastAdminMsgAt);

    res.json({
      ok: true,
      data: {
        ticket,
        seller: seller ? seller.toJSON() : null,
        messages,
        alerts,
        ticket_health,
      },
    });
  } catch (error) {
    console.error("getTicketDetailAdmin error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ======================================================
   💬 REPLY (ADMIN) — auto-assign if unassigned
====================================================== */
export const replyToTicketAdmin: RequestHandler = async (req, res) => {
  try {
    const adminId     = Number(req.user!.id);
    const { id }      = req.params;
    const { mensaje } = req.body;

    if (!mensaje) {
      res.status(400).json({ message: "Mensaje requerido" });
      return;
    }

    const ticket = await Ticket.findByPk(Number(id));
    if (!ticket) {
      res.status(404).json({ message: "Ticket no encontrado" });
      return;
    }

    await TicketMessage.create({
      ticket_id: ticket.id,
      sender_id: adminId,
      mensaje,
      es_admin:  true,
    });

    // Auto-assign + set to esperando_usuario
    const updates: any = { estado: "esperando_usuario" };
    if (!ticket.asignado_a) updates.asignado_a = adminId;
    await ticket.update(updates);

    res.json({ ok: true, message: "Respuesta enviada" });
  } catch (error) {
    console.error("replyToTicketAdmin error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ======================================================
   🔄 CHANGE STATUS
====================================================== */
export const changeTicketStatus: RequestHandler = async (req, res) => {
  try {
    const { id }     = req.params;
    const { estado } = req.body;

    const validStates = ["abierto", "en_proceso", "esperando_usuario", "cerrado"];
    if (!validStates.includes(estado)) {
      res.status(400).json({ message: "Estado inválido" });
      return;
    }

    await Ticket.update(
      { estado, closedAt: estado === "cerrado" ? new Date() : null },
      { where: { id: Number(id) } },
    );

    res.json({ ok: true, message: "Estado actualizado" });
  } catch (error) {
    console.error("changeTicketStatus error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ======================================================
   ⚡ MARK IN PROGRESS
====================================================== */
export const markInProgress: RequestHandler = async (req, res) => {
  try {
    const adminId = Number(req.user!.id);
    const { id }  = req.params;

    await Ticket.update(
      { estado: "en_proceso", asignado_a: adminId },
      { where: { id: Number(id) } },
    );

    res.json({ ok: true, message: "Ticket en proceso" });
  } catch (error) {
    console.error("markInProgress error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ======================================================
   ⏳ MARK WAITING USER
====================================================== */
export const markWaitingUser: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    await Ticket.update(
      { estado: "esperando_usuario" },
      { where: { id: Number(id) } },
    );

    res.json({ ok: true, message: "Esperando usuario" });
  } catch (error) {
    console.error("markWaitingUser error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ======================================================
   🧑‍💼 ASSIGN TICKET
====================================================== */
export const assignTicket: RequestHandler = async (req, res) => {
  try {
    const adminId = Number(req.user!.id);
    const { id }  = req.params;

    await Ticket.update(
      { asignado_a: adminId, estado: "en_proceso" },
      { where: { id: Number(id) } },
    );

    res.json({ ok: true, message: "Ticket asignado" });
  } catch (error) {
    console.error("assignTicket error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ======================================================
   🔒 CLOSE TICKET
====================================================== */
export const closeTicket: RequestHandler = async (req, res) => {
  try {
    const adminId = Number(req.user!.id);
    const { id }  = req.params;

    const ticket = await Ticket.findByPk(Number(id));
    if (!ticket) {
      res.status(404).json({ message: "Ticket no encontrado" });
      return;
    }

    if (ticket.estado === "cerrado") {
      res.status(400).json({ message: "El ticket ya está cerrado" });
      return;
    }

    const adminMessages = await TicketMessage.count({
      where: { ticket_id: ticket.id, es_admin: true },
    });
    if (adminMessages === 0) {
      res.status(400).json({ message: "No puedes cerrar un ticket sin haber respondido" });
      return;
    }

    await ticket.update({ estado: "cerrado", closedAt: new Date(), asignado_a: adminId });

    res.json({ ok: true, message: "Ticket cerrado correctamente" });
  } catch (error) {
    console.error("closeTicket error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

/* ======================================================
   🧠 AI REPLY SUGGESTION (placeholder — ready for Claude API)
====================================================== */
export const generateReplySuggestion: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const [ticket, messages] = await Promise.all([
      Ticket.findByPk(Number(id)),
      TicketMessage.findAll({
        where: { ticket_id: Number(id) },
        order: [["createdAt", "ASC"]],
      }),
    ]);

    if (!ticket) {
      res.status(404).json({ message: "Ticket no encontrado" });
      return;
    }

    // TODO: replace with Claude API call using ticket + messages context
    const templates: Record<string, string> = {
      verificacion: "Thank you for your KYC inquiry. Our team is reviewing your documents and will respond within 24 hours. Please ensure all required documents are uploaded in your profile.",
      soporte:      "Thank you for contacting Flowjuyu Support. We have received your request and our team is working to resolve it. We'll follow up shortly.",
      incidencia:   "We apologize for the inconvenience. This issue has been escalated to our technical team. We will provide an update within 24 hours.",
      otro:         "Thank you for reaching out. We are reviewing your message and will respond as soon as possible.",
    };

    const suggestion = templates[ticket.tipo] ?? templates.soporte;

    res.json({ ok: true, data: { suggestion, ticket_id: ticket.id } });
  } catch (error) {
    console.error("generateReplySuggestion error:", error);
    res.status(500).json({ message: "Error interno" });
  }
};
