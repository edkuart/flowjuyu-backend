// =============================================
// Public Product Contract (DEMO v1 - STABLE)
// =============================================

export interface PublicProductDTO {
    id: string
    nombre: string
    descripcion: string
    precio: number
    imagen_principal: string | null
    imagenes: string[]
    categoria: {
      id: number | null
      nombre: string | null
    }
    departamento: string | null
    municipio: string | null
    vendedor: {
      id: number
      nombre_comercio: string
      logo: string | null
    }
  }
  
  // =============================================
  // Normalizadores internos (NO exportados)
  // =============================================
  
  const toSafeString = (value: any): string => {
    if (value === null || value === undefined) return ""
    return String(value)
  }
  
  const toSafeNumber = (value: any): number => {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  
  const toSafeUrlOrNull = (value: any): string | null => {
    if (!value) return null
    const str = String(value).trim()
    return str.length > 0 ? str : null
  }
  
  const normalizeImages = (imagenes: any): string[] => {
    if (!Array.isArray(imagenes)) return []
  
    return imagenes
      .map((img: any) => {
        if (!img) return null
        if (typeof img === "string") return img
        if (typeof img === "object" && img.url) return img.url
        return null
      })
      .filter((url: string | null) => typeof url === "string")
  }
  
  // =============================================
  // Constructor oficial del contrato público
  // =============================================
  
  export function buildPublicProductDTO(row: any): PublicProductDTO {
    return {
        id: String(row.id),
  
      nombre: toSafeString(row.nombre),
  
      descripcion: toSafeString(row.descripcion),
  
      precio: toSafeNumber(row.precio),
  
      imagen_principal: toSafeUrlOrNull(row.imagen_principal),
  
      imagenes: normalizeImages(row.imagenes),
  
      categoria: {
        id: row.categoria_id ? Number(row.categoria_id) : null,
        nombre: row.categoria_nombre ?? row.categoria ?? null,
      },
  
      departamento: row.departamento ?? null,
  
      municipio: row.municipio ?? null,
  
      vendedor: {
        id: toSafeNumber(row.vendedor_id ?? row.vendedor_user_id),
        nombre_comercio: toSafeString(
          row.nombre_comercio ?? row.vendedor_nombre
        ),
        logo: toSafeUrlOrNull(
          row.logo ?? row.vendedor_logo_url
        ),
      },
    }
  }
  