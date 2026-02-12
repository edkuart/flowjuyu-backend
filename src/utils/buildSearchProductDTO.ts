export interface SearchProductDTO {
    id: string;
    nombre: string;
    precio: number;
    imagen_url: string | null;
    categoria: string | null;
    departamento: string | null;
    municipio: string | null;
  }
  
  export function buildSearchProductDTO(row: any): SearchProductDTO {
    return {
      id: String(row.id),
      nombre: String(row.nombre ?? ""),
      precio: Number(row.precio ?? 0),
      imagen_url: row.imagen_url ?? null,
      categoria: row.categoria_nombre ?? null,
      departamento: row.departamento ?? null,
      municipio: row.municipio ?? null,
    };
  }  