import type { ConversationCommandContext } from "./conversationCommandContext.types";

const PRODUCT_LIST_TTL_MS = 30 * 60 * 1000;
const EDIT_MODE_TTL_MS = 15 * 60 * 1000;
const PENDING_DELETE_TTL_MS = 10 * 60 * 1000;

export type ExpirationResult = {
  expiredProductList?: boolean;
  expiredEditMode?: boolean;
  expiredPendingDelete?: boolean;
  updatedContext: ConversationCommandContext | null;
};

function hasMeaningfulContext(context: ConversationCommandContext): boolean {
  return Boolean(
    (context.catalogListContext?.items && context.catalogListContext.items.length > 0) ||
    (context.lastShownProducts && context.lastShownProducts.length > 0) ||
    context.focusedProductId ||
    context.selectedProductId ||
    context.pendingDeleteProductId ||
    context.mode ||
    context.productDetailContext
  );
}

function parseTimestamp(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function evaluateAndExpireContext(
  context: ConversationCommandContext | null,
  now: Date
): ExpirationResult {
  if (!context) {
    return {
      updatedContext: null,
    };
  }

  const nowMs = now.getTime();
  const baselineMs =
    parseTimestamp(context.last_interaction_at) ??
    parseTimestamp(context.context_created_at) ??
    parseTimestamp(context.lastShownAt) ??
    nowMs;

  const updatedContext: ConversationCommandContext = {
    ...context,
  };

  let expiredProductList = false;
  let expiredEditMode = false;
  let expiredPendingDelete = false;

  if (
    updatedContext.catalogListContext?.items?.length &&
    nowMs - baselineMs > PRODUCT_LIST_TTL_MS
  ) {
    updatedContext.catalogListContext = null;
    expiredProductList = true;
  }

  if (
    updatedContext.lastShownProducts?.length &&
    nowMs - baselineMs > PRODUCT_LIST_TTL_MS
  ) {
    updatedContext.lastShownProducts = null;
    updatedContext.lastShownAt = null;
    expiredProductList = true;
  }

  if (
    updatedContext.mode === "listing_edit" &&
    nowMs - baselineMs > EDIT_MODE_TTL_MS
  ) {
    updatedContext.mode = null;
    updatedContext.focusedProductId = null;
    updatedContext.focusedProductName = null;
    updatedContext.selectedProductId = null;
    updatedContext.selectedProductName = null;
    updatedContext.awaitingEditSaveConfirmation = false;
    expiredEditMode = true;
  }

  if (
    updatedContext.productDetailContext &&
    nowMs - baselineMs > PRODUCT_LIST_TTL_MS
  ) {
    updatedContext.productDetailContext = null;
  }

  if (
    updatedContext.pendingDeleteProductId &&
    nowMs - baselineMs > PENDING_DELETE_TTL_MS
  ) {
    updatedContext.pendingDeleteProductId = null;
    updatedContext.pendingDeleteProductName = null;
    expiredPendingDelete = true;
  }

  if (!hasMeaningfulContext(updatedContext)) {
    return {
      expiredProductList,
      expiredEditMode,
      expiredPendingDelete,
      updatedContext: null,
    };
  }

  if (!updatedContext.context_created_at) {
    updatedContext.context_created_at = now.toISOString();
  }
  updatedContext.last_interaction_at = now.toISOString();

  return {
    expiredProductList,
    expiredEditMode,
    expiredPendingDelete,
    updatedContext,
  };
}
