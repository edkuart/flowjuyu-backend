import { buildMenuMessage } from "./ux/conversationUxBuilder.service";

export function buildCommandMenuResponse(): string {
  return buildMenuMessage();
}
