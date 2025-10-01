import { Model, Optional } from "sequelize";
interface VendedorAttributes {
    id: number;
    nombreComercio: string;
    direccion: string;
    nit: string;
    logoUrl: string;
}
interface VendedorCreationAttributes extends Optional<VendedorAttributes, "id"> {
}
export declare class Vendedor extends Model<VendedorAttributes, VendedorCreationAttributes> implements VendedorAttributes {
    id: number;
    nombreComercio: string;
    direccion: string;
    nit: string;
    logoUrl: string;
}
export {};
