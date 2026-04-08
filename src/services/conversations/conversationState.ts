export type ConversationStep =
  | "awaiting_image"
  | "awaiting_details"
  | "awaiting_measures"
  | "awaiting_price"
  | "awaiting_stock"
  | "awaiting_category"
  | "awaiting_class"
  | "preview"
  | "awaiting_confirmation"
  | "published";

export type ExpectedInputType =
  | "image"
  | "text"
  | "price"
  | "number"
  | "category";

const ALLOWED_TRANSITIONS: Record<ConversationStep, ConversationStep[]> = {
  awaiting_image: [
    "awaiting_image",
    "awaiting_details",
    "awaiting_category",
    "awaiting_class",
    "awaiting_measures",
    "awaiting_price",
    "awaiting_stock",
    "preview",
    "awaiting_confirmation",
  ],
  awaiting_details: [
    "awaiting_details",
    "awaiting_category",
    "awaiting_class",
    "awaiting_measures",
    "awaiting_price",
    "awaiting_stock",
    "preview",
    "awaiting_confirmation",
  ],
  awaiting_category: [
    "awaiting_category",
    "awaiting_class",
    "awaiting_measures",
    "awaiting_price",
    "awaiting_stock",
    "preview",
    "awaiting_confirmation",
  ],
  awaiting_class: [
    "awaiting_class",
    "awaiting_measures",
    "awaiting_price",
    "awaiting_stock",
    "preview",
    "awaiting_confirmation",
  ],
  awaiting_measures: [
    "awaiting_measures",
    "awaiting_price",
    "awaiting_stock",
    "preview",
    "awaiting_confirmation",
  ],
  awaiting_price: [
    "awaiting_price",
    "awaiting_stock",
    "preview",
    "awaiting_confirmation",
  ],
  awaiting_stock: [
    "awaiting_stock",
    "preview",
    "awaiting_confirmation",
  ],
  preview: [
    "preview",
    "awaiting_confirmation",
    "awaiting_details",
    "awaiting_category",
    "awaiting_class",
    "awaiting_measures",
    "awaiting_price",
    "awaiting_stock",
  ],
  awaiting_confirmation: [
    "awaiting_confirmation",
    "published",
    "awaiting_details",
    "awaiting_category",
    "awaiting_class",
    "awaiting_measures",
    "awaiting_price",
    "awaiting_stock",
  ],
  published: ["published"],
};

export function canTransition(
  from: ConversationStep,
  to: ConversationStep
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
