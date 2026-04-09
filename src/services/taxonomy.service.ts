export type TaxonomyResolvableProduct = {
  categoria_id?: number | null;
  categoria_custom?: string | null;
  categoria_nombre?: string | null;
  clase_id?: number | null;
  clase_nombre?: string | null;
};

export type NormalizedCustomValue = {
  display: string | null;
  normalized: string | null;
};

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toDisplayCase(value: string): string {
  if (!value) return value;

  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function normalizeCustomValue(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const collapsed = collapseWhitespace(String(value));
  if (!collapsed) {
    return null;
  }

  return toDisplayCase(collapsed);
}

export function normalizeCustomValueWithMeta(
  value: string | null | undefined
): NormalizedCustomValue {
  const display = normalizeCustomValue(value);

  return {
    display,
    normalized: display ? display.toLocaleLowerCase("es-GT") : null,
  };
}

export function resolveCategoria(
  product: TaxonomyResolvableProduct
): string | null {
  const custom = normalizeCustomValue(product.categoria_custom);
  if (custom) {
    return custom;
  }

  const relational = normalizeCustomValue(product.categoria_nombre);
  if (relational) {
    return relational;
  }

  return null;
}

export function resolveClase(
  product: TaxonomyResolvableProduct
): string | null {
  const relational = normalizeCustomValue(product.clase_nombre);
  if (relational) {
    return relational;
  }

  return null;
}

export function getCategoriaLabel(
  product: TaxonomyResolvableProduct
): string {
  return resolveCategoria(product) ?? "Sin categoría";
}

export function getClaseLabel(
  product: TaxonomyResolvableProduct
): string {
  return resolveClase(product) ?? "Sin clase";
}

export function normalizeCategoriaAssignment(input: {
  categoria_id?: number | null;
  categoria_custom?: string | null;
}): {
  categoria_id: number | null;
  categoria_custom: string | null;
} {
  const categoriaCustom = normalizeCustomValue(input.categoria_custom);

  if (categoriaCustom) {
    return {
      categoria_id: null,
      categoria_custom: categoriaCustom,
    };
  }

  return {
    categoria_id:
      input.categoria_id != null && Number.isFinite(Number(input.categoria_id))
        ? Number(input.categoria_id)
        : null,
    categoria_custom: null,
  };
}
