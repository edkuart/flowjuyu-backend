import { uxRegistry } from "./uxConfig.registry";
import { renderTemplateLines } from "./uxTemplateRenderer.service";
import type {
  UxConditionalSection,
  UxResponseMode,
  UxTemplateConfig,
  UxTemplateData,
  UxTemplateKey,
  UxTemplateResolver,
} from "./uxConfig.types";

function lines(parts: Array<string | null | undefined | false>): string {
  return parts.filter((part) => part !== false && part != null).join("\n");
}

function resolveTemplateValue<T>(
  value: UxTemplateResolver<T> | undefined,
  data: UxTemplateData
): T | undefined {
  if (typeof value === "function") {
    return (value as (ctx: UxTemplateData) => T)(data);
  }

  return value;
}

function shouldUseEmptyState(data: UxTemplateData, emptyWhen?: string[]): boolean {
  if (!emptyWhen?.length) {
    return false;
  }

  return emptyWhen.some((key) => {
    const value = data[key];
    return value === true || value === "true" || value === 1 || value === "1";
  });
}

function getActionHeader(mode: UxResponseMode): string {
  if (mode === "confirmation") {
    return "Confirma con:";
  }

  if (mode === "error") {
    return "Puedes corregir con:";
  }

  if (mode === "informative") {
    return "Puedes seguir con:";
  }

  return "Puedes escribir:";
}

function getActionLimit(mode: UxResponseMode): number {
  if (mode === "confirmation") return 3;
  if (mode === "error") return 3;
  if (mode === "informative") return 3;
  return 5;
}

function buildActionBlock(
  actions: Array<string | null>,
  mode: UxResponseMode
): string[] {
  const filtered = actions.filter(
    (action): action is string => Boolean(action && action.trim().length > 0)
  );
  if (!filtered.length) {
    return [];
  }

  return [
    getActionHeader(mode),
    ...filtered.slice(0, getActionLimit(mode)).map((action) => `👉 ${action}`),
  ];
}

function shouldRenderActions(
  mode: UxResponseMode,
  actions: Array<string | null>
): boolean {
  if (!actions.length) {
    return false;
  }

  return (
    mode === "actionable" ||
    mode === "confirmation" ||
    mode === "error" ||
    mode === "informative"
  );
}

function renderConditionalSections(
  sections: UxConditionalSection[] | undefined,
  data: UxTemplateData
): string[] {
  if (!sections?.length) {
    return [];
  }

  return sections.flatMap((section) => {
    if (section.showWhen && !section.showWhen(data)) {
      return [];
    }

    const templates = resolveTemplateValue(section.lines, data) ?? [];
    return renderTemplateLines(templates, data);
  });
}

function pickVariant(config: UxTemplateConfig, data: UxTemplateData): string | null {
  if (!config.variants?.length) {
    return null;
  }

  const seedSource = String(
    data.lastCommand ??
      data.count ??
      data.session?.id ??
      data.seller?.user_id ??
      config.variants[0]
  );
  const seed = Array.from(seedSource).reduce(
    (acc, char) => acc + char.charCodeAt(0),
    0
  );

  return config.variants[seed % config.variants.length] ?? config.variants[0];
}

export function buildUxResponse(
  templateKey: UxTemplateKey,
  data: UxTemplateData = {}
): string {
  const config = uxRegistry[templateKey];
  const mode = config.mode ?? "actionable";
  const variant = pickVariant(config, data);
  const renderData: UxTemplateData = variant
    ? {
        ...data,
        variant,
      }
    : data;
  const isEmpty = shouldUseEmptyState(data, config.emptyWhen);
  const titleTemplate = resolveTemplateValue(config.title, renderData);
  const bodyTemplates = isEmpty
    ? resolveTemplateValue(config.emptyState, renderData)
    : resolveTemplateValue(config.body, renderData);
  const actionTemplates = isEmpty
    ? []
    : resolveTemplateValue(config.actions, renderData) ?? [];
  const sectionLines = isEmpty
    ? []
    : renderConditionalSections(config.sections, renderData);

  const title = titleTemplate
    ? renderTemplateLines([titleTemplate], renderData)[0]
    : "";
  const body = renderTemplateLines(bodyTemplates, renderData);
  const renderedActionTemplates = actionTemplates.map((action) =>
    action == null ? null : renderTemplateLines([action], renderData)[0]
  );
  const actions =
    isEmpty || !shouldRenderActions(mode, renderedActionTemplates)
      ? []
      : buildActionBlock(renderedActionTemplates, mode);

  return lines([
    title,
    title && (body.length || sectionLines.length || actions.length) ? "" : "",
    ...body,
    body.length && (sectionLines.length || actions.length) ? "" : "",
    ...sectionLines,
    sectionLines.length && actions.length ? "" : "",
    ...actions,
  ]);
}
