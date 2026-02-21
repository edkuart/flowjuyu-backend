export interface PublicProductCardDTO {
    id: string;
    nombre: string;
    precio: number;
    imagen_url: string | null;
    categoria: {
        id: number | null;
        nombre: string | null;
    };
    departamento: string | null;
    municipio: string | null;
}
export declare function buildPublicProductCardDTO(row: any): PublicProductCardDTO;
