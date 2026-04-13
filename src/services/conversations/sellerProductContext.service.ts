import type { CatalogContextItem } from "./conversationCommandContext.types";
import type { ConversationCommandContext } from "./conversationCommandContext.types";
import { buildErrorMessage } from "./ux/conversationUxBuilder.service";

const CONTEXT_TTL_MS = 30 * 60 * 1000;

function getCatalogItems(commandContext: ConversationCommandContext | null): CatalogContextItem[] {
  if (commandContext?.catalogListContext?.items?.length) {
    return commandContext.catalogListContext.items;
  }

  return commandContext?.lastShownProducts ?? [];
}

function getCatalogShownAt(commandContext: ConversationCommandContext | null): string | null {
  return commandContext?.catalogListContext?.shownAt ?? commandContext?.lastShownAt ?? null;
}

export function resolveCatalogContextItem(
  commandContext: ConversationCommandContext | null,
  index: number
): { item: CatalogContextItem | null; reason?: "expired" | "missing" | "invalid" } {
  const items = getCatalogItems(commandContext);
  const shownAtValue = getCatalogShownAt(commandContext);

  if (!items.length || !shownAtValue) {
    return { item: null, reason: "missing" };
  }

  const shownAt = Date.parse(shownAtValue);
  if (!Number.isFinite(shownAt) || Date.now() - shownAt > CONTEXT_TTL_MS) {
    return { item: null, reason: "expired" };
  }

  const item = items.find((entry) => entry.index === index) ?? null;
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
