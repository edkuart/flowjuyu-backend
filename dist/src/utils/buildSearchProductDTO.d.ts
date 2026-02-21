export interface SearchProductDTO {
    id: string;
    nombre: string;
    precio: number;
    imagen_url: string | null;
    categoria: string | null;
    departamento: string | null;
    municipio: string | null;
    rating_avg: number;
    rating_count: number;
}
export declare function buildSearchProductDTO(row: any): SearchProductDTO;
