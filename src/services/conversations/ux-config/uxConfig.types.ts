import type ConversationSession from "../../../models/ConversationSession.model";
import type ListingDraft from "../../../models/ListingDraft.model";
import type { ResolvedSeller } from "../../integrations/whatsapp/whatsappSellerResolver.service";
import type {
  UxMenuProductItem,
  UxProductView,
} from "../ux/conversationUxTypes";

export type UxTemplateKey =
  | "menu"
  | "profile_summary"
  | "product_list"
  | "product_detail"
  | "edit_start"
  | "delete_confirm"
  | "reset_success"
  | "error_invalid_index"
  | "error_expired_context";

export type UxTemplateValue = string | number | boolean | null | undefined;

export type UxTemplateData = Record<string, unknown> & {
  count?: number;
  session?: ConversationSession | null;
  seller?: ResolvedSeller | null;
  draft?: ListingDraft | null;
  hasActiveDraft?: boolean;
  lastCommand?: string | null;
  isEmpty?: boolean;
  hasInactive?: boolean;
  supportsActivateCommand?: boolean;
  productItems?: UxMenuProductItem[];
  product?: UxProductView | null;
};

export type UxTemplateResolver<T> = T | ((ctx: UxTemplateData) => T);

export type UxResponseMode =
  | "informative"
  | "actionable"
  | "confirmation"
  | "error";

export type UxConditionalSection = {
  lines: UxTemplateResolver<string[]>;
  showWhen?: (ctx: UxTemplateData) => boolean;
};

export type UxTemplateConfig = {
  mode?: UxResponseMode;
  title?: UxTemplateResolver<string>;
  body?: UxTemplateResolver<string[]>;
  actions?: UxTemplateResolver<Array<string | null>>;
  emptyState?: UxTemplateResolver<string[]>;
  emptyWhen?: string[];
  sections?: UxConditionalSection[];
  variants?: string[];
};
