"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSearchProductDTO = buildSearchProductDTO;
function buildSearchProductDTO(row) {
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
    };
}
