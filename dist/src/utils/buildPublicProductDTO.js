"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPublicProductDTO = buildPublicProductDTO;
const toSafeString = (value) => {
    if (value === null || value === undefined)
        return "";
    return String(value);
};
const toSafeNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};
const toSafeUrlOrNull = (value) => {
    if (!value)
        return null;
    const str = String(value).trim();
    return str.length > 0 ? str : null;
};
const normalizeImages = (imagenes) => {
    if (!Array.isArray(imagenes))
        return [];
    return imagenes
        .map((img) => {
        if (!img)
            return null;
        if (typeof img === "string")
            return img;
        if (typeof img === "object" && img.url)
            return img.url;
        return null;
    })
        .filter((url) => typeof url === "string");
};
function buildPublicProductDTO(row) {
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
            nombre_comercio: toSafeString(row.nombre_comercio ?? row.vendedor_nombre),
            logo: toSafeUrlOrNull(row.logo ?? row.vendedor_logo_url),
        },
        rating_avg: toSafeNumber(row.rating_avg),
        rating_count: toSafeNumber(row.rating_count),
    };
}
