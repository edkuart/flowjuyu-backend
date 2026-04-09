import type ListingDraft from "../../models/ListingDraft.model";
import type { DraftPatch } from "../listing-drafts/listingDraft.types";
import {
  getProductCategoryById,
  getProductClassById,
} from "../listing-drafts/productCatalog.service";
import type {
  EditModeBaseline,
  EditModeFieldKey,
} from "./conversationCommandContext.types";
import type { UxEditSummaryChange } from "./ux/conversationUxTypes";

type EditComparableState = {
  nombre: string;
  precio: number | null;
  stock: number | null;
  descripcion: string | null;
  categoria: string | null;
  clase: string | null;
  medidas: string | null;
};

type EffectiveEditPatchResult = {
  patch: DraftPatch;
  updatedFields: string[];
  redundantMessages: string[];
};

function normalizeTextValue(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  return normalized ? normalized : null;
}

function normalizeNumberValue(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function money(value: number | null): string {
  return value != null ? `Q${value.toFixed(2)}` : "Pendiente";
}

async function getDraftCategoryLabel(draft: ListingDraft): Promise<string | null> {
  const custom = normalizeTextValue(draft.categoria_custom);
  if (custom) return custom;

  if (draft.categoria_id) {
    const category = await getProductCategoryById(draft.categoria_id).catch(() => null);
    const nombre = normalizeTextValue(category?.nombre);
    if (nombre) return nombre;
  }

  return null;
}

async function getDraftClassLabel(draft: ListingDraft): Promise<string | null> {
  if (draft.clase_id) {
    const productClass = await getProductClassById(draft.clase_id).catch(() => null);
    const nombre = normalizeTextValue(productClass?.nombre);
    if (nombre) return nombre;
  }

  return null;
}

async function resolveCategoryPatchLabel(patch: DraftPatch): Promise<string | null> {
  const custom = normalizeTextValue(
    typeof patch.categoria_custom === "string" ? patch.categoria_custom : null
  );
  if (custom) return custom;

  if (patch.categoria_id != null) {
    const category = await getProductCategoryById(Number(patch.categoria_id)).catch(() => null);
    return normalizeTextValue(category?.nombre);
  }

  return null;
}

async function resolveClassPatchLabel(patch: DraftPatch): Promise<string | null> {
  if (patch.clase_id != null) {
    const productClass = await getProductClassById(Number(patch.clase_id)).catch(() => null);
    return normalizeTextValue(productClass?.nombre);
  }

  return null;
}

export async function getEditComparableState(
  draft: ListingDraft
): Promise<EditComparableState> {
  return {
    nombre: normalizeTextValue(draft.suggested_title) || "Producto artesanal",
    precio: normalizeNumberValue(draft.price),
    stock: normalizeNumberValue(draft.stock),
    descripcion: normalizeTextValue(draft.suggested_description),
    categoria: await getDraftCategoryLabel(draft),
    clase: await getDraftClassLabel(draft),
    medidas: normalizeTextValue(draft.measures_text),
  };
}

export async function hasRealChanges(
  draft: ListingDraft,
  baseline: EditModeBaseline | null | undefined
): Promise<boolean> {
  if (!baseline) return false;

  const current = await getEditComparableState(draft);

  return (
    current.nombre !== normalizeTextValue(baseline.nombre) ||
    current.precio !== normalizeNumberValue(baseline.precio) ||
    current.stock !== normalizeNumberValue(baseline.stock) ||
    current.descripcion !== normalizeTextValue(baseline.descripcion) ||
    current.categoria !== normalizeTextValue(baseline.categoria) ||
    current.clase !== normalizeTextValue(baseline.clase) ||
    current.medidas !== normalizeTextValue(baseline.medidas)
  );
}

export async function getChangedFieldFlags(
  draft: ListingDraft,
  baseline: EditModeBaseline | null | undefined
): Promise<Partial<Record<EditModeFieldKey, boolean>>> {
  if (!baseline) return {};

  const current = await getEditComparableState(draft);

  return {
    nombre: current.nombre !== normalizeTextValue(baseline.nombre),
    precio: current.precio !== normalizeNumberValue(baseline.precio),
    stock: current.stock !== normalizeNumberValue(baseline.stock),
    descripcion: current.descripcion !== normalizeTextValue(baseline.descripcion),
    categoria: current.categoria !== normalizeTextValue(baseline.categoria),
    clase: current.clase !== normalizeTextValue(baseline.clase),
    medidas: current.medidas !== normalizeTextValue(baseline.medidas),
  };
}

export async function buildEditSummaryChanges(
  draft: ListingDraft,
  baseline: EditModeBaseline | null | undefined
): Promise<UxEditSummaryChange[]> {
  if (!baseline) return [];

  const current = await getEditComparableState(draft);
  const changes: UxEditSummaryChange[] = [];

  if (current.nombre !== normalizeTextValue(baseline.nombre)) {
    changes.push({
      field: "Nombre",
      before: normalizeTextValue(baseline.nombre) || "Sin nombre",
      after: current.nombre || "Sin nombre",
    });
  }

  if (current.precio !== normalizeNumberValue(baseline.precio)) {
    changes.push({
      field: "Precio",
      before: money(normalizeNumberValue(baseline.precio)),
      after: money(current.precio),
    });
  }

  if (current.stock !== normalizeNumberValue(baseline.stock)) {
    changes.push({
      field: "Stock",
      before:
        normalizeNumberValue(baseline.stock) != null
          ? String(normalizeNumberValue(baseline.stock))
          : "Pendiente",
      after: current.stock != null ? String(current.stock) : "Pendiente",
    });
  }

  if (current.descripcion !== normalizeTextValue(baseline.descripcion)) {
    changes.push({
      field: "Descripción",
      before: normalizeTextValue(baseline.descripcion) ? "Texto anterior" : "Sin descripción",
      after: current.descripcion ? "Descripción actualizada" : "Sin descripción",
    });
  }

  if (current.categoria !== normalizeTextValue(baseline.categoria)) {
    changes.push({
      field: "Categoría",
      before: normalizeTextValue(baseline.categoria) || "Sin categoría",
      after: current.categoria || "Sin categoría",
    });
  }

  if (current.clase !== normalizeTextValue(baseline.clase)) {
    changes.push({
      field: "Clase",
      before: normalizeTextValue(baseline.clase) || "Sin clase",
      after: current.clase || "Sin clase",
    });
  }

  if (current.medidas !== normalizeTextValue(baseline.medidas)) {
    changes.push({
      field: "Medidas",
      before: normalizeTextValue(baseline.medidas) || "Pendiente",
      after: current.medidas || "Pendiente",
    });
  }

  return changes;
}

export async function filterEffectiveEditPatch(
  draft: ListingDraft,
  patch: DraftPatch,
  updatedFields: string[]
): Promise<EffectiveEditPatchResult> {
  const nextPatch: DraftPatch = {};
  const keptFields: string[] = [];
  const redundantMessages: string[] = [];

  for (const field of updatedFields) {
    switch (field) {
      case "price": {
        const current = normalizeNumberValue(draft.price);
        const next = normalizeNumberValue(patch.price as number | null | undefined);
        if (current === next) {
          redundantMessages.push(`⚠️ El precio ya es ${money(current)}`);
          break;
        }
        nextPatch.price = patch.price;
        keptFields.push(field);
        break;
      }
      case "stock": {
        const current = normalizeNumberValue(draft.stock);
        const next = normalizeNumberValue(patch.stock as number | null | undefined);
        if (current === next) {
          redundantMessages.push(
            `⚠️ El stock ya es ${current != null ? String(current) : "Pendiente"}`
          );
          break;
        }
        nextPatch.stock = patch.stock;
        keptFields.push(field);
        break;
      }
      case "suggested_description": {
        const current = normalizeTextValue(draft.suggested_description);
        const next = normalizeTextValue(
          patch.suggested_description as string | null | undefined
        );
        if (current === next) {
          redundantMessages.push("⚠️ La descripción ya está actualizada");
          break;
        }
        nextPatch.suggested_description = patch.suggested_description;
        keptFields.push(field);
        break;
      }
      case "categoria_id":
      case "categoria_custom": {
        const current = await getDraftCategoryLabel(draft);
        const next = await resolveCategoryPatchLabel(patch);
        if (current === next) {
          redundantMessages.push(`⚠️ La categoría ya es ${next || "Sin categoría"}`);
          break;
        }
        nextPatch.categoria_id = patch.categoria_id;
        nextPatch.categoria_custom = patch.categoria_custom;
        if (!keptFields.includes("categoria_id") && !keptFields.includes("categoria_custom")) {
          keptFields.push(field);
        }
        break;
      }
      case "clase_id": {
        const current = await getDraftClassLabel(draft);
        const next = await resolveClassPatchLabel(patch);
        if (current === next) {
          redundantMessages.push(`⚠️ La clase ya es ${next || "Sin clase"}`);
          break;
        }
        nextPatch.clase_id = patch.clase_id;
        keptFields.push(field);
        break;
      }
      case "measures_text": {
        const current = normalizeTextValue(draft.measures_text);
        const next = normalizeTextValue(patch.measures_text as string | null | undefined);
        if (current === next) {
          redundantMessages.push(`⚠️ Las medidas ya son ${next || "Pendiente"}`);
          break;
        }
        nextPatch.measures_text = patch.measures_text;
        keptFields.push(field);
        break;
      }
      case "suggested_title": {
        const current = normalizeTextValue(draft.suggested_title);
        const next = normalizeTextValue(patch.suggested_title as string | null | undefined);
        if (current === next) {
          redundantMessages.push(`⚠️ El nombre ya es ${next || "Producto artesanal"}`);
          break;
        }
        nextPatch.suggested_title = patch.suggested_title;
        keptFields.push(field);
        break;
      }
      default: {
        keptFields.push(field);
        break;
      }
    }
  }

  return {
    patch: nextPatch,
    updatedFields: keptFields,
    redundantMessages,
  };
}
