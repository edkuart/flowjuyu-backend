"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.models = exports.TicketMessage = exports.Ticket = exports.VendedorPerfil = exports.User = exports.sequelize = void 0;
const db_1 = require("../config/db");
Object.defineProperty(exports, "sequelize", { enumerable: true, get: function () { return db_1.sequelize; } });
const user_model_1 = require("./user.model");
Object.defineProperty(exports, "User", { enumerable: true, get: function () { return user_model_1.User; } });
const VendedorPerfil_1 = require("./VendedorPerfil");
Object.defineProperty(exports, "VendedorPerfil", { enumerable: true, get: function () { return VendedorPerfil_1.VendedorPerfil; } });
const ticket_model_1 = require("./ticket.model");
Object.defineProperty(exports, "Ticket", { enumerable: true, get: function () { return ticket_model_1.Ticket; } });
const ticketMessage_model_1 = require("./ticketMessage.model");
Object.defineProperty(exports, "TicketMessage", { enumerable: true, get: function () { return ticketMessage_model_1.TicketMessage; } });
function setupAssociations() {
    if (!user_model_1.User.associations.perfil) {
        user_model_1.User.hasOne(VendedorPerfil_1.VendedorPerfil, {
            foreignKey: "user_id",
            as: "perfil",
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
    }
    if (!VendedorPerfil_1.VendedorPerfil.associations.user) {
        VendedorPerfil_1.VendedorPerfil.belongsTo(user_model_1.User, {
            foreignKey: "user_id",
            as: "user",
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
        });
    }
    if (!ticket_model_1.Ticket.associations.messages) {
        ticket_model_1.Ticket.hasMany(ticketMessage_model_1.TicketMessage, {
            foreignKey: "ticket_id",
            as: "messages",
            onDelete: "CASCADE",
        });
    }
    if (!ticketMessage_model_1.TicketMessage.associations.ticket) {
        ticketMessage_model_1.TicketMessage.belongsTo(ticket_model_1.Ticket, {
            foreignKey: "ticket_id",
            as: "ticket",
            onDelete: "CASCADE",
        });
    }
    if (!user_model_1.User.associations.tickets) {
        user_model_1.User.hasMany(ticket_model_1.Ticket, {
            foreignKey: "user_id",
            as: "tickets",
            onDelete: "CASCADE",
        });
    }
    if (!ticket_model_1.Ticket.associations.user) {
        ticket_model_1.Ticket.belongsTo(user_model_1.User, {
            foreignKey: "user_id",
            as: "user",
        });
    }
}
setupAssociations();
exports.models = {
    User: user_model_1.User,
    VendedorPerfil: VendedorPerfil_1.VendedorPerfil,
    Ticket: ticket_model_1.Ticket,
    TicketMessage: ticketMessage_model_1.TicketMessage,
};
