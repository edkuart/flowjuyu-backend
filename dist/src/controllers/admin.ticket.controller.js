"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeTicket = exports.assignTicket = exports.changeTicketStatus = exports.replyToTicketAdmin = exports.getTicketDetailAdmin = exports.getAllTickets = void 0;
const ticket_model_1 = require("../models/ticket.model");
const ticketMessage_model_1 = require("../models/ticketMessage.model");
const getAllTickets = async (req, res) => {
    try {
        const { estado } = req.query;
        const where = {};
        if (estado)
            where.estado = estado;
        const tickets = await ticket_model_1.Ticket.findAll({
            where,
            order: [["createdAt", "DESC"]],
        });
        res.json({ ok: true, data: tickets });
        return;
    }
    catch (error) {
        console.error("getAllTickets error:", error);
        res.status(500).json({ message: "Error interno" });
        return;
    }
};
exports.getAllTickets = getAllTickets;
const getTicketDetailAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const ticket = await ticket_model_1.Ticket.findByPk(Number(id));
        if (!ticket) {
            res.status(404).json({ message: "Ticket no encontrado" });
            return;
        }
        const messages = await ticketMessage_model_1.TicketMessage.findAll({
            where: { ticket_id: ticket.id },
            order: [["createdAt", "ASC"]],
        });
        res.json({ ok: true, data: { ticket, messages } });
        return;
    }
    catch (error) {
        console.error("getTicketDetailAdmin error:", error);
        res.status(500).json({ message: "Error interno" });
        return;
    }
};
exports.getTicketDetailAdmin = getTicketDetailAdmin;
const replyToTicketAdmin = async (req, res) => {
    try {
        const adminId = Number(req.user.id);
        const { id } = req.params;
        const { mensaje } = req.body;
        if (!mensaje) {
            res.status(400).json({ message: "Mensaje requerido" });
            return;
        }
        await ticketMessage_model_1.TicketMessage.create({
            ticket_id: Number(id),
            sender_id: adminId,
            mensaje,
            es_admin: true,
        });
        await ticket_model_1.Ticket.update({ estado: "esperando_usuario" }, { where: { id: Number(id) } });
        res.json({ ok: true, message: "Respuesta enviada" });
        return;
    }
    catch (error) {
        console.error("replyToTicketAdmin error:", error);
        res.status(500).json({ message: "Error interno" });
        return;
    }
};
exports.replyToTicketAdmin = replyToTicketAdmin;
const changeTicketStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        await ticket_model_1.Ticket.update({
            estado,
            closedAt: estado === "cerrado" ? new Date() : null,
        }, { where: { id: Number(id) } });
        res.json({ ok: true, message: "Estado actualizado" });
        return;
    }
    catch (error) {
        console.error("changeTicketStatus error:", error);
        res.status(500).json({ message: "Error interno" });
        return;
    }
};
exports.changeTicketStatus = changeTicketStatus;
const assignTicket = async (req, res) => {
    try {
        const adminId = Number(req.user.id);
        const { id } = req.params;
        await ticket_model_1.Ticket.update({
            asignado_a: adminId,
            estado: "en_proceso",
        }, { where: { id: Number(id) } });
        res.json({ ok: true, message: "Ticket asignado" });
        return;
    }
    catch (error) {
        console.error("assignTicket error:", error);
        res.status(500).json({ message: "Error interno" });
        return;
    }
};
exports.assignTicket = assignTicket;
const closeTicket = async (req, res) => {
    try {
        const adminId = Number(req.user.id);
        const { id } = req.params;
        const ticket = await ticket_model_1.Ticket.findByPk(Number(id));
        if (!ticket) {
            res.status(404).json({ message: "Ticket no encontrado" });
            return;
        }
        if (ticket.estado === "cerrado") {
            res.status(400).json({ message: "El ticket ya está cerrado" });
            return;
        }
        const adminMessages = await ticketMessage_model_1.TicketMessage.count({
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
    }
    catch (error) {
        console.error("closeTicket error:", error);
        res.status(500).json({ message: "Error interno" });
        return;
    }
};
exports.closeTicket = closeTicket;
