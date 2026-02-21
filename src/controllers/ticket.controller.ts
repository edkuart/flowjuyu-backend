import { Request, Response, RequestHandler } from "express";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { logAdminEvent } from "../utils/logAdminEvent";

// Crear ticket (comprador/vendedor)
export const createTicket: RequestHandler = async (req, res) => {
  try {
    // =====================================================
    // 🔐 VALIDACIÓN DE AUTENTICACIÓN
    // =====================================================
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: "No autenticado",
      });
    }

    const userId = Number(req.user.id);

    // =====================================================
    // 📦 VALIDACIÓN DE INPUT
    // =====================================================
    const asunto = req.body.asunto?.toString().trim();
    const mensaje = req.body.mensaje?.toString().trim();

    if (!asunto || !mensaje) {
      return res.status(400).json({
        success: false,
        message: "Asunto y mensaje son obligatorios",
      });
    }

    if (asunto.length > 150) {
      return res.status(400).json({
        success: false,
        message: "El asunto es demasiado largo",
      });
    }

    // =====================================================
    // 🎫 CREACIÓN DE TICKET
    // =====================================================
    const ticket = await Ticket.create({
      user_id: userId,
      asunto,
      mensaje,
      estado: "abierto", // preparado para gobernanza futura
    });

    // =====================================================
    // 📊 EVENTO ANALÍTICO (opcional pero recomendado)
    // =====================================================
    await logAdminEvent({
      entityType: "ticket",
      entityId: ticket.id,
      action: "ticket_created",
      performedBy: userId,
      comment: "Usuario creó un ticket",
      metadata: null,
    });

    // =====================================================
    // 📦 RESPUESTA CONSISTENTE
    // =====================================================
    res.status(201).json({
      success: true,
      message: "Ticket creado correctamente",
      data: ticket,
    });

  } catch (error) {
    console.error("❌ createTicket error:", error);

    res.status(500).json({
      success: false,
      message: "Error interno",
    });
  }
};

// Listar tickets (solo soporte o admin)
export const getAllTickets = async (req: Request, res: Response) => {
  try {
    const tickets = await Ticket.findAll({
      order: [["createdAt", "DESC"]],
      include: [{ model: User, attributes: ["id", "nombre", "correo"] }],
    });

    res.status(200).json(tickets);
  } catch (error) {
    console.error("Error obteniendo tickets:", error);
    res.status(500).json({ message: "Error interno" });
  }
};

// Cambiar estado del ticket
export const updateTicketStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!["abierto", "en_proceso", "cerrado"].includes(estado)) {
      return res.status(400).json({ message: "Estado inválido" });
    }

    await Ticket.update({ estado }, { where: { id } });

    res.status(200).json({ message: "Estado actualizado" });
  } catch (error) {
    console.error("Error actualizando ticket:", error);
    res.status(500).json({ message: "Error interno" });
  }
};
