export type CatalogContextItem = {
  index: number;
  productId: string;
  nombre: string;
  activo: boolean;
};

export type CatalogListContext = {
  items: CatalogContextItem[];
  shownAt: string;
};

export type ProductDetailContext = {
  source: "catalog_list" | "direct_reference";
  shownAt: string;
  reference?: string | null;
  matchedBy?: "seller_sku" | "internal_code" | null;
  catalogIndex?: number | null;
};

export type ConversationCommandMode =
  | "listing_create"
  | "listing_edit"
  | "navigation";

export type EditModeFieldKey =
  | "precio"
  | "stock"
  | "descripcion"
  | "categoria"
  | "clase"
  | "medidas"
  | "nombre";

export type EditModeBaseline = {
  nombre: string;
  precio: number | null;
  stock: number | null;
  descripcion: string | null;
  categoria: string | null;
  clase: string | null;
  medidas?: string | null;
};

export type ConversationCommandContext = {
  lastShownProducts?: CatalogContextItem[] | null;
  lastShownAt?: string | null;
  selectedProductId?: string | null;
  selectedProductName?: string | null;
  catalogListContext?: CatalogListContext | null;
  productDetailContext?: ProductDetailContext | null;
  focusedProductId?: string | null;
  focusedProductName?: string | null;
  mode?: ConversationCommandMode | null;
  awaitingEditSaveConfirmation?: boolean;
  changedFields?: Partial<Record<EditModeFieldKey, boolean>> | null;
  editingBaseline?: EditModeBaseline | null;
  pendingDeleteProductId?: string | null;
  pendingDeleteProductName?: string | null;
  context_created_at?: string | null;
  last_interaction_at?: string | null;
};
