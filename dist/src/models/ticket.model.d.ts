import { Model, Optional } from "sequelize";
export type TicketEstado = "abierto" | "en_proceso" | "esperando_usuario" | "cerrado";
export type TicketTipo = "soporte" | "verificacion" | "incidencia" | "otro";
export type TicketPrioridad = "baja" | "media" | "alta";
interface TicketAttributes {
    id: number;
    user_id: number;
    asunto: string;
    mensaje: string;
    estado: TicketEstado;
    tipo: TicketTipo;
    prioridad: TicketPrioridad;
    asignado_a?: number | null;
    closedAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
}
type TicketCreationAttributes = Optional<TicketAttributes, "id" | "estado" | "tipo" | "prioridad" | "asignado_a" | "closedAt" | "createdAt" | "updatedAt">;
export declare class Ticket extends Model<TicketAttributes, TicketCreationAttributes> implements TicketAttributes {
    id: number;
    user_id: number;
    asunto: string;
    mensaje: string;
    estado: TicketEstado;
    tipo: TicketTipo;
    prioridad: TicketPrioridad;
    asignado_a?: number | null;
    closedAt?: Date | null;
    readonly createdAt?: Date;
    readonly updatedAt?: Date;
}
export {};
