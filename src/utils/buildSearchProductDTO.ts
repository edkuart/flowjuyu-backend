export interface SearchProductDTO {
    id: string
    nombre: string
    precio: number
    imagen_url: string | null
    categoria: string | null
    departamento: string | null
    municipio: string | null
    rating_avg: number
    rating_count: number
  }
  
  export function buildSearchProductDTO(row: any): SearchProductDTO {
    return {
      id: String(row.id),
      nombre: row.nombre ?? "",
      precio: Number(row.precio) || 0,
      imagen_url: row.imagen_url ?? null,
      categoria: row.categoria_nombre ?? null,
      departamento: row.departamento ?? null,
      municipio: row.municipio ?? null,
      rating_avg: Number(row.rating_avg) || 0,
      rating_count: Number(row.rating_count) || 0,
    }
  }
  