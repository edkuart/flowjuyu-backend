import { Request, Response } from "express"
import { Ticket } from "../models/ticket.model"
import { TicketMessage } from "../models/ticketMessage.model"

export const createContactTicket = async (
  req: Request,
  res: Response
) => {
  try {

    const { name, email, message, type } = req.body

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "Missing fields"
      })
    }

    // 👇 Usuario del sistema (usar uno existente)
    const SYSTEM_USER_ID = 79

    const ticket = await Ticket.create({
      user_id: SYSTEM_USER_ID,
      asunto: `Contacto web: ${name}`,
      mensaje: message,
      estado: "abierto",
      tipo: type || "otro",
      prioridad: "media",
      asignado_a: null
    })

    await TicketMessage.create({
      ticket_id: ticket.id,
      sender_id: SYSTEM_USER_ID,
      mensaje: `Nombre: ${name}
Email: ${email}

Mensaje:
${message}`,
      es_admin: false
    })

    return res.json({
      success: true,
      ticket_id: ticket.id
    })

  } catch (error) {

    console.error("Error creating contact ticket:", error)

    return res.status(500).json({
      success: false,
      message: "Error creating contact ticket"
    })
  }
}