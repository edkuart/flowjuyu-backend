export type ConversationUxErrorType =
  | "invalid_index"
  | "expired_context"
  | "no_active_edit"
  | "no_pending_delete"
  | "save_failed"
  | "delete_failed"
  | "edit_prepare_failed"
  | "product_access_lost"
  | "invalid_link_code"
  | "expired_link_code"
  | "phone_already_linked"
  | "seller_already_linked_other_phone"
  | "unlinked_phone"
  | "audio_not_understood"
  | "unexpected_input"
  | "generic";

export type UxMenuProductItem = {
  index: number;
  nombre: string;
  precio?: number | null;
  activo?: boolean | null;
};

export type UxProfileSummary = {
  nombreComercio: string;
  sellerName: string;
  phoneDisplay: string | null;
  totalProducts: number;
  activeProducts: number;
};

export type UxProductView = {
  nombre: string;
  precio: number | null;
  stock: number | null;
  estado: "activo" | "inactivo";
  categoria: string | null;
  clase: string | null;
  descripcion: string | null;
};

export type UxEditSummaryChange = {
  field: string;
  before: string;
  after: string;
};

export type UxEditFeedback = {
  field: string;
  value: string;
};

export type UxEditModeField = {
  label: string;
};
