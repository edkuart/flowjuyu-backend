import { buildCommandMenuResponse } from "./conversationMenuResponseBuilder.service";
import { matchConversationCommand } from "./conversationCommandMatcher.service";
import type {
  CommandRouterContext,
  CommandRouterResult,
} from "./commandRouter.types";
import { getCommandContext } from "./conversationSession.service";
import { buildSellerProfileSummary } from "./sellerProfileSummary.service";
import { getSellerCatalogSummaryData } from "./sellerCatalogSummary.service";
import {
  buildOwnedProductDetailMessage,
  getProductDetail,
  getSellerProductByReference,
} from "./sellerProductEdit.service";
import {
  buildInvalidCatalogContextMessage,
  resolveCatalogContextItem,
} from "./sellerProductContext.service";
import {
  buildCancelMessage,
  buildDeleteConfirmMessage,
  buildErrorMessage,
  buildNewListingMessage,
  buildNoPendingEditConfirmationMessage,
} from "./ux/conversationUxBuilder.service";

export async function routeConversationCommand(
  context: CommandRouterContext
): Promise<CommandRouterResult> {
  if (context.message.type !== "text") {
    return { handled: false };
  }

  const match = matchConversationCommand(context.message.text ?? "");
  if (!match.matched || !match.commandKey) {
    return { handled: false };
  }

  console.log(
    `[conversation][command] matched session=${context.session.id} seller=${context.seller.user_id} command=${match.commandKey}${match.skuArg ? ` sku="${match.skuArg}"` : ""} text="${match.normalizedText}"`
  );

  const existingCommandContext = getCommandContext(context.session);

  switch (match.commandKey) {
    case "menu":
      return {
        handled: true,
        commandKey: "menu",
        responseText: buildCommandMenuResponse(),
      };

    case "perfil":
      return {
        handled: true,
        commandKey: "perfil",
        responseText: await buildSellerProfileSummary(context.seller.user_id),
      };

    case "mis_productos": {
      // Direct product references resolve against seller_sku first, then internal_code.
      if (match.skuArg) {
        const reference = match.skuArg;
        const { product, matchedBy } = await getSellerProductByReference(
          context.seller.user_id,
          reference
        );

        if (product && matchedBy) {
          console.log(
            `[conversation][command] resolved_reference session=${context.session.id} seller=${context.seller.user_id} reference="${reference}" matchedBy=${matchedBy} product=${product.id}`
          );
        }

        if (!product) {
          return {
            handled: true,
            commandKey: "mis_productos",
            responseText: "No encontré un producto con esa referencia. Revisa el código e intenta de nuevo.",
          };
        }

        return {
          handled: true,
          commandKey: "mis_productos",
          responseText: buildOwnedProductDetailMessage(product),
          nextCommandContext: {
            ...existingCommandContext,
            selectedProductId: product.id,
            selectedProductName: product.nombre,
          },
        };
      }

      // "mis productos" — return full catalog listing
      const summary = await getSellerCatalogSummaryData(context.seller.user_id);
      return {
        handled: true,
        commandKey: "mis_productos",
        responseText: summary.responseText,
        nextCommandContext: {
          ...existingCommandContext,
          lastShownProducts: summary.items,
          lastShownAt: new Date().toISOString(),
          pendingDeleteProductId: null,
          pendingDeleteProductName: null,
        },
      };
    }

    case "ver_producto":
    case "editar_producto":
    case "eliminar_producto": {
      const { item, reason } = resolveCatalogContextItem(
        existingCommandContext,
        match.numericArg ?? -1
      );

      if (!item) {
        return {
          handled: true,
          commandKey: match.commandKey,
          responseText: buildInvalidCatalogContextMessage(reason),
        };
      }

      const ownedProduct = await getProductDetail(
        context.seller.user_id,
        item.productId
      );

      if (!ownedProduct) {
        return {
          handled: true,
          commandKey: match.commandKey,
          responseText: buildErrorMessage("product_access_lost"),
        };
      }

      if (match.commandKey === "ver_producto") {
        return {
          handled: true,
          commandKey: "ver_producto",
          action: "view_catalog_product",
          contextProductId: ownedProduct.id,
          contextProductName: ownedProduct.nombre,
          responseText: buildOwnedProductDetailMessage(ownedProduct),
        };
      }

      if (match.commandKey === "editar_producto") {
        return {
          handled: true,
          commandKey: "editar_producto",
          action: "start_product_edit",
          contextProductId: ownedProduct.id,
          contextProductName: ownedProduct.nombre,
          nextCommandContext: {
            ...existingCommandContext,
            selectedProductId: ownedProduct.id,
            selectedProductName: ownedProduct.nombre,
            mode: "listing_edit",
            awaitingEditSaveConfirmation: false,
            changedFields: {},
            editingBaseline: {
              nombre: ownedProduct.nombre,
              precio: Number(ownedProduct.precio),
              stock: ownedProduct.stock,
              descripcion: ownedProduct.descripcion?.trim() || null,
              categoria: ownedProduct.categoria_custom?.trim() || ownedProduct.categoria_nombre?.trim() || "Sin categoría",
              clase: ownedProduct.clase_nombre?.trim() || "Sin clase",
            },
            pendingDeleteProductId: null,
            pendingDeleteProductName: null,
          },
        };
      }

      return {
        handled: true,
        commandKey: "eliminar_producto",
        action: "request_product_delete",
        contextProductId: ownedProduct.id,
        contextProductName: ownedProduct.nombre,
        responseText: buildDeleteConfirmMessage(ownedProduct.nombre),
        nextCommandContext: {
          ...existingCommandContext,
          pendingDeleteProductId: ownedProduct.id,
          pendingDeleteProductName: ownedProduct.nombre,
        },
      };
    }

    case "nuevo": {
      // Guard: "publicar" and "publicar producto" are also caught by isPublishCommand()
      // in handleTextInput. When the session is at awaiting_confirmation, the user
      // intends to PUBLISH the current draft — not start a new listing. Let the
      // step handler take it instead of resetting the draft here.
      const publishAmbiguousTerms = new Set(["publicar", "publicar producto"]);
      if (
        context.session.current_step === "awaiting_confirmation" &&
        publishAmbiguousTerms.has(match.normalizedText)
      ) {
        return { handled: false };
      }

      return {
        handled: true,
        commandKey: "nuevo",
        action: "start_new_listing",
        responseText: buildNewListingMessage(),
      };
    }

    case "cancelar":
      return {
        handled: true,
        commandKey: "cancelar",
        action: "cancel_listing",
        responseText: buildCancelMessage(true),
      };

    case "guardar_edicion":
      if (
        existingCommandContext?.mode !== "listing_edit" ||
        !existingCommandContext.selectedProductId
      ) {
        return {
          handled: true,
          commandKey: "guardar_edicion",
          responseText: buildErrorMessage("no_active_edit"),
        };
      }

      return {
        handled: true,
        commandKey: "guardar_edicion",
        action: "save_product_edit",
        contextProductId: existingCommandContext.selectedProductId,
        contextProductName: existingCommandContext.selectedProductName ?? undefined,
      };

    case "confirmar_guardado_edicion":
      if (
        existingCommandContext?.mode !== "listing_edit" ||
        !existingCommandContext.selectedProductId
      ) {
        return { handled: false };
      }

      if (!existingCommandContext.awaitingEditSaveConfirmation) {
        return {
          handled: true,
          commandKey: "confirmar_guardado_edicion",
          responseText: buildNoPendingEditConfirmationMessage(),
        };
      }

      return {
        handled: true,
        commandKey: "confirmar_guardado_edicion",
        action: "confirm_save_product_edit",
        contextProductId: existingCommandContext.selectedProductId,
        contextProductName: existingCommandContext.selectedProductName ?? undefined,
      };

    case "confirmar_eliminacion":
      if (!existingCommandContext?.pendingDeleteProductId) {
        return {
          handled: true,
          commandKey: "confirmar_eliminacion",
          responseText: buildErrorMessage("no_pending_delete"),
        };
      }

      return {
        handled: true,
        commandKey: "confirmar_eliminacion",
        action: "confirm_product_delete",
        contextProductId: existingCommandContext.pendingDeleteProductId,
        contextProductName: existingCommandContext.pendingDeleteProductName ?? undefined,
      };

    default:
      return { handled: false };
  }
}
