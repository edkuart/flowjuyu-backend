import { sequelize } from "../config/db";
import { User } from "./user.model";
import { VendedorPerfil } from "./VendedorPerfil";
export { sequelize, User, VendedorPerfil };
export declare const models: {
    User: typeof User;
    VendedorPerfil: typeof VendedorPerfil;
};
