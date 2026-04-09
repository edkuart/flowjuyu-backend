import type { UxTemplateData } from "./uxConfig.types";

function stringifyTemplateValue(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "object") {
    return "";
  }

  return String(value);
}

export function renderTemplateString(
  template: string,
  data: UxTemplateData
): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) =>
    stringifyTemplateValue(data[key])
  );
}

export function renderTemplateLines(
  templates: string[] | undefined,
  data: UxTemplateData
): string[] {
  if (!templates?.length) {
    return [];
  }

  return templates
    .map((line) => renderTemplateString(line, data))
    .filter((line) => line.trim().length > 0 || line === "");
}
