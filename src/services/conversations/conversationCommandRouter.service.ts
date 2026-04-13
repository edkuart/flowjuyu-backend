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
  buildOwnedProductDetailMessageForContext,
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
  buildMissingEditTargetMessage,
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
  const focusedProductId =
    existingCommandContext?.focusedProductId ??
    existingCommandContext?.selectedProductId ??
    null;
  const focusedProductName =
    existingCommandContext?.focusedProductName ??
    existingCommandContext?.selectedProductName ??
    null;

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
          responseText: buildOwnedProductDetailMessageForContext(product, {
            actionMode: "focused",
          }),
          nextCommandContext: {
            ...existingCommandContext,
            productDetailContext: {
              source: "direct_reference",
              shownAt: new Date().toISOString(),
              reference,
              matchedBy,
              catalogIndex: null,
            },
            focusedProductId: product.id,
            focusedProductName: product.nombre,
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
          catalogListContext: {
            items: summary.items,
            shownAt: new Date().toISOString(),
          },
          lastShownProducts: summary.items,
          lastShownAt: new Date().toISOString(),
          productDetailContext: null,
          focusedProductId: null,
          focusedProductName: null,
          pendingDeleteProductId: null,
          pendingDeleteProductName: null,
        },
      };
    }

    case "ver_producto":
    case "editar_producto":
    case "eliminar_producto": {
      if (match.skuArg) {
        const reference = match.skuArg;
        const { product, matchedBy } = await getSellerProductByReference(
          context.seller.user_id,
          reference
        );

        if (!product) {
          return {
            handled: true,
            commandKey: match.commandKey,
            responseText: "No encontré un producto con esa referencia. Revisa el código e intenta de nuevo.",
          };
        }

        if (match.commandKey === "ver_producto") {
          return {
            handled: true,
            commandKey: "ver_producto",
            action: "view_catalog_product",
            contextProductId: product.id,
            contextProductName: product.nombre,
            responseText: buildOwnedProductDetailMessageForContext(product, {
              actionMode: "focused",
            }),
            nextCommandContext: {
              ...existingCommandContext,
              productDetailContext: {
                source: "direct_reference",
                shownAt: new Date().toISOString(),
                reference,
                matchedBy,
                catalogIndex: null,
              },
              focusedProductId: product.id,
              focusedProductName: product.nombre,
              selectedProductId: product.id,
              selectedProductName: product.nombre,
            },
          };
        }

        if (match.commandKey === "editar_producto") {
          return {
            handled: true,
            commandKey: "editar_producto",
            action: "start_product_edit",
            contextProductId: product.id,
            contextProductName: product.nombre,
            nextCommandContext: {
              ...existingCommandContext,
              productDetailContext: {
                source: "direct_reference",
                shownAt: new Date().toISOString(),
                reference,
                matchedBy,
                catalogIndex: null,
              },
              focusedProductId: product.id,
              focusedProductName: product.nombre,
              selectedProductId: product.id,
              selectedProductName: product.nombre,
              mode: "listing_edit",
              awaitingEditSaveConfirmation: false,
              changedFields: {},
              editingBaseline: {
                nombre: product.nombre,
                precio: Number(product.precio),
                stock: product.stock,
                descripcion: product.descripcion?.trim() || null,
                categoria: product.categoria_custom?.trim() || product.categoria_nombre?.trim() || "Sin categoría",
                clase: product.clase_nombre?.trim() || "Sin clase",
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
          contextProductId: product.id,
          contextProductName: product.nombre,
          responseText: buildDeleteConfirmMessage(product.nombre),
          nextCommandContext: {
            ...existingCommandContext,
            productDetailContext: {
              source: "direct_reference",
              shownAt: new Date().toISOString(),
              reference,
              matchedBy,
              catalogIndex: null,
            },
            focusedProductId: product.id,
            focusedProductName: product.nombre,
            selectedProductId: product.id,
            selectedProductName: product.nombre,
            pendingDeleteProductId: product.id,
            pendingDeleteProductName: product.nombre,
          },
        };
      }

      if (
        match.commandKey === "editar_producto" &&
        match.numericArg == null
      ) {
        if (!focusedProductId) {
          return {
            handled: true,
            commandKey: "editar_producto",
            responseText: buildMissingEditTargetMessage(),
          };
        }

        const ownedProduct = await getProductDetail(
          context.seller.user_id,
          focusedProductId
        );

        if (!ownedProduct) {
          return {
            handled: true,
            commandKey: "editar_producto",
            responseText: buildErrorMessage("product_access_lost"),
          };
        }

        return {
          handled: true,
          commandKey: "editar_producto",
          action: "start_product_edit",
          contextProductId: ownedProduct.id,
          contextProductName: ownedProduct.nombre,
          nextCommandContext: {
            ...existingCommandContext,
            focusedProductId: ownedProduct.id,
            focusedProductName: ownedProduct.nombre,
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
          responseText: buildOwnedProductDetailMessageForContext(ownedProduct, {
            actionMode: "catalog_index",
            index: item.index,
          }),
          nextCommandContext: {
            ...existingCommandContext,
            productDetailContext: {
              source: "catalog_list",
              shownAt: new Date().toISOString(),
              catalogIndex: item.index,
              reference: null,
              matchedBy: null,
            },
            focusedProductId: ownedProduct.id,
            focusedProductName: ownedProduct.nombre,
            selectedProductId: ownedProduct.id,
            selectedProductName: ownedProduct.nombre,
          },
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
            productDetailContext: {
              source: "catalog_list",
              shownAt: new Date().toISOString(),
              catalogIndex: item.index,
              reference: null,
              matchedBy: null,
            },
            focusedProductId: ownedProduct.id,
            focusedProductName: ownedProduct.nombre,
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
          productDetailContext: {
            source: "catalog_list",
            shownAt: new Date().toISOString(),
            catalogIndex: item.index,
            reference: null,
            matchedBy: null,
          },
          focusedProductId: ownedProduct.id,
          focusedProductName: ownedProduct.nombre,
          selectedProductId: ownedProduct.id,
          selectedProductName: ownedProduct.nombre,
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
