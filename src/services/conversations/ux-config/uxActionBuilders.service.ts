import { UX_COMMANDS, UX_LIST_LIMIT } from "../ux/conversationUxTemplates";
import type {
  UxMenuProductItem,
  UxProductView,
} from "../ux/conversationUxTypes";
import type { UxTemplateData } from "./uxConfig.types";

export function buildProductActions(
  products: UxMenuProductItem[],
  options?: {
    includeActivateCommand?: boolean;
  }
): Array<string | null> {
  const includeActivateCommand = Boolean(options?.includeActivateCommand);

  return products
    .slice(0, UX_LIST_LIMIT)
    .flatMap((product) => {
      if (product.activo === false) {
        return [
          `ver ${product.index}`,
          includeActivateCommand ? `activar ${product.index}` : `editar ${product.index}`,
        ];
      }

      return [
        `ver ${product.index}`,
        `editar ${product.index}`,
        `eliminar ${product.index}`,
      ];
    })
    .concat([UX_COMMANDS.newListing, UX_COMMANDS.menu]);
}

export function buildDetailActions(
  product: UxProductView | null | undefined,
  options?: {
    index?: number | null;
    includeActivateCommand?: boolean;
  }
): Array<string | null> {
  const index = options?.index ?? 1;

  if (!product) {
    return [UX_COMMANDS.products];
  }

  if (product.estado === "inactivo") {
    return [
      `ver ${index}`,
      options?.includeActivateCommand ? `activar ${index}` : `editar ${index}`,
      UX_COMMANDS.products,
    ];
  }

  return [`editar ${index}`, `eliminar ${index}`, UX_COMMANDS.products];
}

export function buildEditActions(ctx: UxTemplateData): Array<string | null> {
  if (ctx.hasActiveDraft) {
    return [UX_COMMANDS.save, UX_COMMANDS.cancel];
  }

  return [UX_COMMANDS.cancel];
}
