export interface PublicProductDTO {
    id: string;
    nombre: string;
    descripcion: string;
    precio: number;
    imagen_principal: string | null;
    imagenes: string[];
    categoria: {
        id: number | null;
        nombre: string | null;
    };
    departamento: string | null;
    municipio: string | null;
    vendedor: {
        id: number;
        nombre_comercio: string;
        logo: string | null;
    };
    rating_avg: number;
    rating_count: number;
}
export declare function buildPublicProductDTO(row: any): PublicProductDTO;
