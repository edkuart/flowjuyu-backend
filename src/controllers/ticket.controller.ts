import { Request, Response } from "express";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";

// Crear ticket (comprador/vendedor)
export const createTicket = async (req: Request, res: Response) => {
  try {
    const { asunto, mensaje } = req.body;
    const user = req.user;

    if (!asunto || !mensaje) {
      return res.status(400).json({ message: "Faltan campos" });
    }

    const ticket = await Ticket.create({
      user_id: user.id,
      asunto,
      mensaje,
    });

    res.status(201).json({
      message: "Ticket creado correctamente",
      ticket,
    });
  } catch (error) {
    console.error("Error creando ticket:", error);
    res.status(500).json({ message: "Error interno" });
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
