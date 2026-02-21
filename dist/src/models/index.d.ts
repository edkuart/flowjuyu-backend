import { sequelize } from "../config/db";
import { User } from "./user.model";
import { VendedorPerfil } from "./VendedorPerfil";
import { Ticket } from "./ticket.model";
import { TicketMessage } from "./ticketMessage.model";
export { sequelize, User, VendedorPerfil, Ticket, TicketMessage, };
export declare const models: {
    User: typeof User;
    VendedorPerfil: typeof VendedorPerfil;
    Ticket: typeof Ticket;
    TicketMessage: typeof TicketMessage;
};
