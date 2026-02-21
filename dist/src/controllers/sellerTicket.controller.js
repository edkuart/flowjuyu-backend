"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.replyToTicketSeller = exports.getMyTicketDetail = exports.getMyTickets = exports.createTicket = void 0;
const ticket_model_1 = require("../models/ticket.model");
const ticketMessage_model_1 = require("../models/ticketMessage.model");
const createTicket = async (req, res) => {
    try {
        const sellerId = Number(req.user.id);
        const { asunto, mensaje, tipo, prioridad } = req.body;
        if (!asunto || !mensaje) {
            res.status(400).json({
                message: "Asunto y mensaje son obligatorios",
            });
            return;
        }
        const ticket = await ticket_model_1.Ticket.create({
            user_id: sellerId,
            asunto,
            mensaje,
            tipo: tipo ?? "soporte",
            prioridad: prioridad ?? "media",
            estado: "abierto",
        });
        res.status(201).json({
            ok: true,
            data: ticket,
        });
        return;
    }
    catch (error) {
        console.error("createTicket error:", error);
        res.status(500).json({ message: "Error interno" });
        return;
    }
};
exports.createTicket = createTicket;
const getMyTickets = async (req, res) => {
    try {
        const sellerId = Number(req.user.id);
        const tickets = await ticket_model_1.Ticket.findAll({
            where: { user_id: sellerId },
            order: [["createdAt", "DESC"]],
        });
        res.json({ ok: true, data: tickets });
        return;
    }
    catch (error) {
        console.error("getMyTickets error:", error);
        res.status(500).json({ message: "Error interno" });
        return;
    }
};
exports.getMyTickets = getMyTickets;
const getMyTicketDetail = async (req, res) => {
    try {
        const sellerId = Number(req.user.id);
        const { id } = req.params;
        const ticket = await ticket_model_1.Ticket.findOne({
            where: {
                id: Number(id),
                user_id: sellerId,
            },
        });
        if (!ticket) {
            res.status(404).json({ message: "Ticket no encontrado" });
            return;
        }
        const messages = await ticketMessage_model_1.TicketMessage.findAll({
            where: { ticket_id: ticket.id },
            order: [["createdAt", "ASC"]],
        });
        res.json({
            ok: true,
            data: { ticket, messages },
        });
        return;
    }
    catch (error) {
        console.error("getMyTicketDetail error:", error);
        res.status(500).json({ message: "Error interno" });
        return;
    }
};
exports.getMyTicketDetail = getMyTicketDetail;
const replyToTicketSeller = async (req, res) => {
    try {
        const sellerId = Number(req.user.id);
        const { id } = req.params;
        const { mensaje } = req.body;
        if (!mensaje) {
            res.status(400).json({ message: "Mensaje requerido" });
            return;
        }
        const ticket = await ticket_model_1.Ticket.findOne({
            where: {
                id: Number(id),
                user_id: sellerId,
            },
        });
        if (!ticket) {
            res.status(404).json({ message: "Ticket no encontrado" });
            return;
        }
        await ticketMessage_model_1.TicketMessage.create({
            ticket_id: ticket.id,
            sender_id: sellerId,
            mensaje,
            es_admin: false,
        });
        await ticket.update({
            estado: "en_proceso",
        });
        res.json({ ok: true, message: "Respuesta enviada" });
        return;
    }
    catch (error) {
        console.error("replyToTicketSeller error:", error);
        res.status(500).json({ message: "Error interno" });
        return;
    }
};
exports.replyToTicketSeller = replyToTicketSeller;
