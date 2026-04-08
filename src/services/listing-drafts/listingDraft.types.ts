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
}>;
