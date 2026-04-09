import type { CatalogContextItem } from "./conversationCommandContext.types";
import type { ConversationCommandContext } from "./conversationCommandContext.types";
import { buildErrorMessage } from "./ux/conversationUxBuilder.service";

const CONTEXT_TTL_MS = 30 * 60 * 1000;

export function resolveCatalogContextItem(
  commandContext: ConversationCommandContext | null,
  index: number
): { item: CatalogContextItem | null; reason?: "expired" | "missing" | "invalid" } {
  if (!commandContext?.lastShownProducts?.length || !commandContext.lastShownAt) {
    return { item: null, reason: "missing" };
  }

  const shownAt = Date.parse(commandContext.lastShownAt);
  if (!Number.isFinite(shownAt) || Date.now() - shownAt > CONTEXT_TTL_MS) {
    return { item: null, reason: "expired" };
  }

  const item = commandContext.lastShownProducts.find((entry) => entry.index === index) ?? null;
  if (!item) {
    return { item: null, reason: "invalid" };
  }

  return { item };
}

export function buildInvalidCatalogContextMessage(reason?: "expired" | "missing" | "invalid"): string {
  if (reason === "expired") {
    return buildErrorMessage("expired_context");
  }

  return buildErrorMessage("invalid_index");
}
