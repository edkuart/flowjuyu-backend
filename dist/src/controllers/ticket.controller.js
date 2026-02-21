"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTicketStatus = exports.getAllTickets = exports.createTicket = void 0;
const ticket_model_1 = require("../models/ticket.model");
const user_model_1 = require("../models/user.model");
const createTicket = async (req, res) => {
    try {
        const { asunto, mensaje } = req.body;
        const user = req.user;
        if (!asunto || !mensaje) {
            return res.status(400).json({ message: "Faltan campos" });
        }
        const ticket = await ticket_model_1.Ticket.create({
            user_id: user.id,
            asunto,
            mensaje,
        });
        res.status(201).json({
            message: "Ticket creado correctamente",
            ticket,
        });
    }
    catch (error) {
        console.error("Error creando ticket:", error);
        res.status(500).json({ message: "Error interno" });
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
