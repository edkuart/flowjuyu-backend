import { Model, Optional } from "sequelize";
interface VendedorPerfilAttrs {
    id: number;
    userId: number;
    nombre: string;
    correo: string;
    telefono?: string | null;
    direccion?: string | null;
    imagen_url?: string | null;
    nombre_comercio: string;
    telefono_comercio?: string | null;
    departamento?: string | null;
    municipio?: string | null;
    descripcion?: string | null;
    dpi: string;
    foto_dpi_frente?: string | null;
    foto_dpi_reverso?: string | null;
    selfie_con_dpi?: string | null;
    estado: "pendiente" | "aprobado" | "rechazado";
    createdAt?: Date;
    updatedAt?: Date;
}
type Creation = Optional<VendedorPerfilAttrs, "id" | "telefono" | "direccion" | "imagen_url" | "telefono_comercio" | "departamento" | "municipio" | "descripcion" | "foto_dpi_frente" | "foto_dpi_reverso" | "selfie_con_dpi" | "estado" | "createdAt" | "updatedAt">;
export declare class VendedorPerfil extends Model<VendedorPerfilAttrs, Creation> implements VendedorPerfilAttrs {
    id: number;
    userId: number;
    nombre: string;
    correo: string;
    telefono?: string | null;
    direccion?: string | null;
    imagen_url?: string | null;
    nombre_comercio: string;
    telefono_comercio?: string | null;
    departamento?: string | null;
    municipio?: string | null;
    descripcion?: string | null;
    dpi: string;
    foto_dpi_frente?: string | null;
    foto_dpi_reverso?: string | null;
    selfie_con_dpi?: string | null;
    estado: "pendiente" | "aprobado" | "rechazado";
    readonly createdAt?: Date;
    readonly updatedAt?: Date;
}
export {};
