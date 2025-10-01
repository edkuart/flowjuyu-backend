import { Model, Optional } from "sequelize";
interface UserAttributes {
    id: number;
    nombre: string;
    correo: string;
    password: string;
    telefono?: string;
    direccion?: string;
    rol: "comprador" | "vendedor" | "admin";
    createdAt?: Date;
    updatedAt?: Date;
}
interface UserCreationAttributes extends Optional<UserAttributes, "id"> {
}
export declare class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
    id: number;
    nombre: string;
    correo: string;
    password: string;
    rol: "comprador" | "vendedor" | "admin";
    telefono?: string;
    direccion?: string;
    readonly createdAt?: Date;
    readonly updatedAt?: Date;
}
export {};
