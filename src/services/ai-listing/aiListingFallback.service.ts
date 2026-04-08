import type ListingDraft from "../../models/ListingDraft.model";

function safeText(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export function buildFallbackListingContent(draft: ListingDraft): {
  title: string;
  description: string;
} {
  const title =
    safeText(draft.suggested_title) ||
    safeText(draft.categoria_custom) ||
    "Producto artesanal";

  const descriptionBase =
    safeText(draft.suggested_description) ||
    "Producto agregado por el vendedor";

  const measures = safeText(draft.measures_text);
  const description = measures
    ? `${descriptionBase}\n\nMedidas: ${measures}`
    : descriptionBase;

  return {
    title,
    description,
  };
}
