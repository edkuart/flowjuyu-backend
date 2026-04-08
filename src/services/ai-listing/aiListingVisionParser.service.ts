import type { VisionSuggestion } from "../listing-drafts/listingDraft.service";

function cleanValue(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseListSection(section: string | undefined): string[] {
  if (!section) return [];

  return section
    .split("\n")
    .map((line) => line.replace(/^\s*-\s*/, "").trim())
    .filter(Boolean)
    .map(cleanValue)
    .slice(0, 8);
}

export function parseVisionSuggestion(text: string): VisionSuggestion {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const match = normalized.match(
    /PRODUCT_TYPE:\s*([\s\S]*?)\nSUGGESTED_CATEGORY:\s*([\s\S]*?)\nSUGGESTED_CLASS:\s*([\s\S]*?)\nVISIBLE_ATTRIBUTES:\s*([\s\S]*?)\nCONFIDENCE:\s*([\s\S]*?)\nNOTES:\s*([\s\S]*)$/i
  );

  if (!match) {
    throw new Error("Vision response did not match expected format");
  }

  const confidence = Number.parseFloat(cleanValue(match[5]));

  return {
    probableProductType: cleanValue(match[1]) || undefined,
    suggestedCategoryName: cleanValue(match[2]) || undefined,
    suggestedClassName: cleanValue(match[3]) || undefined,
    visibleAttributes: parseListSection(match[4]),
    confidence: Number.isFinite(confidence)
      ? Math.max(0, Math.min(confidence, 1))
      : undefined,
    notes: parseListSection(match[6]),
  };
}
