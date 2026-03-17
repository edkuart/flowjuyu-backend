import { Request, Response } from "express"
import { Op } from "sequelize"

import { Ticket } from "../models/ticket.model"
import { VendedorPerfil } from "../models/VendedorPerfil"
import { PurchaseIntention } from "../models/purchaseIntention.model"

export const getSellerLeads = async (req: Request, res: Response) => {
  try {

    /* ============================
       CONTACTOS WEB (tickets)
    ============================ */

    const tickets = await Ticket.findAll({
      where: {
        [Op.or]: [
          { asunto: { [Op.like]: "[WEB]%" } },
          { asunto: { [Op.like]: "Contacto web%" } }
        ]
      },
      order: [["createdAt", "DESC"]],
      limit: 20
    })

    /* ============================
       INTENCIONES DE COMPRA
    ============================ */

    const intentions = await PurchaseIntention.findAll({
      order: [["created_at", "DESC"]],
      limit: 20
    })

    /* ============================
       NUEVOS SELLERS
    ============================ */

    const sellers = await VendedorPerfil.findAll({
      attributes: [
        "id",
        "user_id",
        "nombre_comercio",
        "estado_validacion",
        "estado_admin",
        "createdAt"
      ],
      order: [["createdAt", "DESC"]],
      limit: 20
    })

    res.json({
      success: true,
      data: {
        tickets,
        intentions,
        sellers
      }
    })

  } catch (error) {

    console.error("Error fetching leads:", error)

    res.status(500).json({
      message: "Error interno del servidor"
    })

  }
}