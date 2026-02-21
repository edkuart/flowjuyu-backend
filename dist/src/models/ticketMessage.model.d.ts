import { Model, Optional } from "sequelize";
interface TicketMessageAttributes {
    id: number;
    ticket_id: number;
    sender_id: number;
    mensaje: string;
    es_admin: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}
type CreationAttributes = Optional<TicketMessageAttributes, "id">;
export declare class TicketMessage extends Model<TicketMessageAttributes, CreationAttributes> implements TicketMessageAttributes {
    id: number;
    ticket_id: number;
    sender_id: number;
    mensaje: string;
    es_admin: boolean;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}
export {};
