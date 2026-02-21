"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPublicProductCardDTO = buildPublicProductCardDTO;
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
function buildPublicProductCardDTO(row) {
    const categoriaId = row.categoria_id ?? null;
    const categoriaNombre = row.categoria_nombre ??
        row.categoria ??
        row.categoria_custom ??
        null;
    return {
        id: String(row.id),
        nombre: String(row.nombre ?? ""),
        precio: toSafeNumber(row.precio),
        imagen_url: toSafeUrlOrNull(row.imagen_url ?? row.imagen_principal ?? null),
        categoria: {
            id: categoriaId,
            nombre: categoriaNombre,
        },
        departamento: row.departamento ?? null,
        municipio: row.municipio ?? null,
    };
}
