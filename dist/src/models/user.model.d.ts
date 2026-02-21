import { Model, Optional } from "sequelize";
export type UserRole = "buyer" | "seller" | "admin" | "support";
interface UserAttributes {
    id: number;
    nombre: string;
    correo: string;
    password: string;
    telefono?: string;
    direccion?: string;
    rol: UserRole;
    token_version: number;
    reset_password_token?: string | null;
    reset_password_expires?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
}
interface UserCreationAttributes extends Optional<UserAttributes, "id" | "token_version"> {
}
export declare class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
    id: number;
    nombre: string;
    correo: string;
    password: string;
    rol: UserRole;
    telefono?: string;
    direccion?: string;
    token_version: number;
    reset_password_token?: string | null;
    reset_password_expires?: Date | null;
    readonly createdAt?: Date;
    readonly updatedAt?: Date;
}
export {};
