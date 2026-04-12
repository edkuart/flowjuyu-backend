import type { ListingDraftStatus } from "../../models/ListingDraft.model";

export type DraftPatch = Partial<{
  seller_user_id: number | null;
  images_json: object[];
  suggested_title: string | null;
  suggested_description: string | null;
  price: number | null;
  stock: number | null;
  measures_text: string | null;
  categoria_id: number | null;
  categoria_custom: string | null;
  clase_id: number | null;
  vision_suggestions_json: object | null;
  status: ListingDraftStatus;
  published_product_id: string | null;
  /**
   * Optional seller-defined inventory code.
   * Format: letters, digits, hyphens, underscores — max 100 chars.
   * Mirrors the seller_sku column in productos (partial unique per seller).
   * Set to null to clear.
   */
  seller_sku: string | null;
}>;
