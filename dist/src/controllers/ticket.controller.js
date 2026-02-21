"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTicketStatus = exports.getAllTickets = exports.createTicket = void 0;
const ticket_model_1 = require("../models/ticket.model");
const user_model_1 = require("../models/user.model");
const logAdminEvent_1 = require("../utils/logAdminEvent");
const createTicket = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({
                success: false,
                message: "No autenticado",
            });
        }
        const userId = Number(req.user.id);
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
        const ticket = await ticket_model_1.Ticket.create({
            user_id: userId,
            asunto,
            mensaje,
            estado: "abierto",
        });
        await (0, logAdminEvent_1.logAdminEvent)({
            entityType: "ticket",
            entityId: ticket.id,
            action: "ticket_created",
            performedBy: userId,
            comment: "Usuario creó un ticket",
            metadata: null,
        });
        res.status(201).json({
            success: true,
            message: "Ticket creado correctamente",
            data: ticket,
        });
    }
    catch (error) {
        console.error("❌ createTicket error:", error);
        res.status(500).json({
            success: false,
            message: "Error interno",
        });
    }
};
exports.createTicket = createTicket;
const getAllTickets = async (req, res) => {
    try {
        const tickets = await ticket_model_1.Ticket.findAll({
            order: [["createdAt", "DESC"]],
            include: [{ model: user_model_1.User, attributes: ["id", "nombre", "correo"] }],
        });
        res.status(200).json(tickets);
    }
    catch (error) {
        console.error("Error obteniendo tickets:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.getAllTickets = getAllTickets;
const updateTicketStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        if (!["abierto", "en_proceso", "cerrado"].includes(estado)) {
            return res.status(400).json({ message: "Estado inválido" });
        }
        await ticket_model_1.Ticket.update({ estado }, { where: { id } });
        res.status(200).json({ message: "Estado actualizado" });
    }
    catch (error) {
        console.error("Error actualizando ticket:", error);
        res.status(500).json({ message: "Error interno" });
    }
};
exports.updateTicketStatus = updateTicketStatus;
