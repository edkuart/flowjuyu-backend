import type ConversationSession from "../../models/ConversationSession.model";
import type { NormalizedInboundMessage } from "../integrations/whatsapp/whatsapp.types";
import type { ResolvedSeller } from "../integrations/whatsapp/whatsappSellerResolver.service";
import type { ConversationCommandContext } from "./conversationCommandContext.types";

export type CommandKey =
  | "menu"
  | "perfil"
  | "mis_productos"
  | "nuevo"
  | "cancelar"
  | "ver_producto"
  | "editar_producto"
  | "eliminar_producto"
  | "guardar_edicion"
  | "confirmar_guardado_edicion"
  | "confirmar_eliminacion";

export type IntentType =
  | "none"
  | "menu"
  | "perfil"
  | "mis_productos"
  | "nuevo"
  | "cancelar"
  | "reset";

export type CommandMatch = {
  matched: boolean;
  commandKey?: CommandKey;
  rawText: string;
  normalizedText: string;
  args: string[];
  numericArg?: number;
  /** Uppercased seller SKU extracted from "mis productos <SKU>" inputs. */
  skuArg?: string;
};

export type CommandRouterContext = {
  session: ConversationSession;
  seller: ResolvedSeller;
  message: NormalizedInboundMessage;
};

export type CommandRouterResult = {
  handled: boolean;
  commandKey?: CommandKey;
  responseText?: string;
  action?:
    | "start_new_listing"
    | "cancel_listing"
    | "view_catalog_product"
    | "start_product_edit"
    | "request_product_delete"
    | "save_product_edit"
    | "confirm_save_product_edit"
    | "confirm_product_delete";
  contextProductId?: string;
  contextProductName?: string;
  nextCommandContext?: ConversationCommandContext | null;
};
