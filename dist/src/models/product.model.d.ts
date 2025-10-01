import { Model, Optional } from "sequelize";
interface ProductAttributes {
    id: string;
    vendedor_id: number;
    nombre: string;
    descripcion?: string | null;
    precio: number;
    stock: number;
    categoria_id?: number | null;
    clase_id: number;
    tela_id?: number | null;
    region_id?: number | null;
    accesorio_id?: number | null;
    imagen_url?: string | null;
    activo: boolean;
    categoria_custom?: string | null;
    region_custom?: string | null;
    tela_custom?: string | null;
    accesorio_custom?: string | null;
    created_at?: Date;
    updated_at?: Date;
}
type ProductCreation = Optional<ProductAttributes, "id" | "activo" | "stock" | "descripcion" | "categoria_id" | "tela_id" | "region_id" | "accesorio_id" | "imagen_url" | "categoria_custom" | "region_custom" | "tela_custom" | "accesorio_custom" | "created_at" | "updated_at">;
declare class Product extends Model<ProductAttributes, ProductCreation> implements ProductAttributes {
    id: string;
    vendedor_id: number;
    nombre: string;
    descripcion?: string | null;
    precio: number;
    stock: number;
    categoria_id?: number | null;
    clase_id: number;
    tela_id?: number | null;
    region_id?: number | null;
    accesorio_id?: number | null;
    imagen_url?: string | null;
    activo: boolean;
    categoria_custom?: string | null;
    region_custom?: string | null;
    tela_custom?: string | null;
    accesorio_custom?: string | null;
    readonly created_at: Date;
    readonly updated_at: Date;
}
export default Product;
