import type {
  CommandKey,
  CommandMatch,
  IntentType,
} from "./commandRouter.types";

export function normalizeConversationCommandText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const EXACT_COMMANDS: Record<string, CommandKey> = {
  menu: "menu",
  ayuda: "menu",
  help: "menu",
  opciones: "menu",
  perfil: "perfil",
  "mi perfil": "perfil",
  "mis productos": "mis_productos",
  productos: "mis_productos",
  "nuevo producto": "nuevo",
  nuevo: "nuevo",
  cancelar: "cancelar",
  cancel: "cancelar",
  guardar: "guardar_edicion",
  "guardar cambios": "guardar_edicion",
  confirmar: "confirmar_guardado_edicion",
  "confirmar eliminar": "confirmar_eliminacion",
  "eliminar confirmar": "confirmar_eliminacion",
};

function matchNaturalLanguageCommand(normalizedText: string): CommandKey | null {
  if (
    normalizedText.includes("cuantos productos tengo") ||
    normalizedText.includes("quiero ver mis productos") ||
    normalizedText.includes("ver mis productos") ||
    normalizedText.includes("mostrar mis productos") ||
    normalizedText.includes("ensename mis productos") ||
    normalizedText.includes("quiero saber mis productos") ||
    normalizedText.includes("quiero informacion de mis productos") ||
    normalizedText.includes("quiero informacion sobre mis productos") ||
    normalizedText.includes("informacion de mis productos") ||
    normalizedText.includes("total de productos que tengo")
  ) {
    return "mis_productos";
  }

  if (
    normalizedText.includes("quiero ver mi perfil") ||
    normalizedText.includes("ver mi perfil") ||
    normalizedText.includes("mostrar mi perfil") ||
    normalizedText.includes("ver perfil")
  ) {
    return "perfil";
  }

  if (
    normalizedText.includes("quiero ver el menu") ||
    normalizedText.includes("ir al menu") ||
    normalizedText.includes("mostrar menu") ||
    normalizedText.includes("mostrar ayuda") ||
    normalizedText.includes("necesito ayuda")
  ) {
    return "menu";
  }

  return null;
}

function tokenize(normalizedText: string): string[] {
  return normalizedText.split(" ").filter(Boolean);
}

function hasAnyToken(tokens: string[], candidates: string[]): boolean {
  return candidates.some((candidate) => tokens.includes(candidate));
}

function hasAllTokens(tokens: string[], candidates: string[]): boolean {
  return candidates.every((candidate) => tokens.includes(candidate));
}

function detectProductsIntent(tokens: string[], normalizedText: string): boolean {
  const mentionsProductDomain =
    hasAnyToken(tokens, ["producto", "productos", "catalogo", "catalogo"]) ||
    normalizedText.includes("mis productos");

  const asksForKnowledge =
    hasAnyToken(tokens, [
      "cuantos",
      "cuanto",
      "total",
      "saber",
      "ver",
      "mostrar",
      "informacion",
      "informacion",
      "listar",
      "lista",
      "ensename",
      "quiero",
      "necesito",
      "tengo",
    ]) || normalizedText.includes("quiero ver");

  return mentionsProductDomain && asksForKnowledge;
}

function detectProfileIntent(tokens: string[], normalizedText: string): boolean {
  const mentionsProfileDomain =
    hasAnyToken(tokens, ["perfil", "cuenta", "negocio", "comercio", "tienda"]) ||
    normalizedText.includes("mi perfil");

  const asksForKnowledge =
    hasAnyToken(tokens, [
      "ver",
      "mostrar",
      "saber",
      "informacion",
      "informacion",
      "datos",
      "quiero",
      "necesito",
      "mi",
    ]);

  return mentionsProfileDomain && asksForKnowledge;
}

function detectMenuIntent(tokens: string[], normalizedText: string): boolean {
  const mentionsMenuDomain =
    hasAnyToken(tokens, ["menu", "ayuda", "opciones", "comandos"]) ||
    normalizedText.includes("que puedo hacer") ||
    normalizedText.includes("como funciona");

  const asksForGuidance =
    hasAnyToken(tokens, ["ver", "mostrar", "necesito", "quiero", "ayuda"]) ||
    normalizedText.includes("que puedo hacer") ||
    normalizedText.includes("como funciona");

  return mentionsMenuDomain && asksForGuidance;
}

function detectNewIntent(tokens: string[], normalizedText: string): boolean {
  return (
    normalizedText.includes("nuevo producto") ||
    normalizedText.includes("nueva publicacion") ||
    (hasAnyToken(tokens, ["nuevo", "nueva", "crear", "publicar", "subir"]) &&
      hasAnyToken(tokens, ["producto", "publicacion", "articulo"]))
  );
}

function detectCancelIntent(tokens: string[], normalizedText: string): boolean {
  return (
    normalizedText.includes("cancelar") ||
    normalizedText.includes("detener") ||
    normalizedText.includes("salir de aqui") ||
    normalizedText.includes("ya no quiero seguir") ||
    (hasAnyToken(tokens, ["cancelar", "detener", "salir"]) &&
      hasAnyToken(tokens, ["flujo", "proceso", "publicacion", "edicion"]))
  );
}

const RESET_COMMAND_PATTERNS = [
  "inicio",
  "empezar",
  "empecemos",
  "volver",
  "regresar",
  "reiniciar",
  "reset",
  "empezar de nuevo",
  "empezar desde cero",
  "empecemos desde el principio",
  "volver a empezar",
  "volver al principio",
  "regresar al principio",
  "empecemos de nuevo",
  "quiero empezar de nuevo",
];

const ORDERED_RESET_COMMAND_PATTERNS = [...RESET_COMMAND_PATTERNS].sort(
  (a, b) => b.length - a.length
);

export function detectIntent(rawText: string): IntentType {
  const normalizedText = normalizeConversationCommandText(rawText);

  if (!normalizedText) {
    return "none";
  }

  if (isResetCommand(normalizedText)) {
    return "reset";
  }

  const exact = EXACT_COMMANDS[normalizedText];
  if (exact === "menu") return "menu";
  if (exact === "perfil") return "perfil";
  if (exact === "mis_productos") return "mis_productos";
  if (exact === "nuevo") return "nuevo";
  if (exact === "cancelar") return "cancelar";

  const naturalLanguageCommand = matchNaturalLanguageCommand(normalizedText);
  if (naturalLanguageCommand === "menu") return "menu";
  if (naturalLanguageCommand === "perfil") return "perfil";
  if (naturalLanguageCommand === "mis_productos") return "mis_productos";

  const tokens = tokenize(normalizedText);

  if (detectProductsIntent(tokens, normalizedText)) {
    return "mis_productos";
  }

  if (detectProfileIntent(tokens, normalizedText)) {
    return "perfil";
  }

  if (detectMenuIntent(tokens, normalizedText)) {
    return "menu";
  }

  if (detectNewIntent(tokens, normalizedText)) {
    return "nuevo";
  }

  if (detectCancelIntent(tokens, normalizedText)) {
    return "cancelar";
  }

  return "none";
}

export function isResetCommand(rawText: string): boolean {
  return getResetCommandPattern(rawText) !== null;
}

export function getResetCommandPattern(rawText: string): string | null {
  const normalizedText = normalizeConversationCommandText(rawText);

  if (!normalizedText) {
    return null;
  }

  return (
    ORDERED_RESET_COMMAND_PATTERNS.find(
      (pattern) =>
        normalizedText === pattern || normalizedText.startsWith(`${pattern} `)
    ) ?? null
  );
}

export function isGlobalConversationCommand(rawText: string): boolean {
  const intent = detectIntent(rawText);

  return (
    intent === "menu" ||
    intent === "perfil" ||
    intent === "mis_productos" ||
    intent === "nuevo" ||
    intent === "cancelar"
  );
}

export function matchConversationCommand(rawText: string): CommandMatch {
  const normalizedText = normalizeConversationCommandText(rawText);

  if (!normalizedText) {
    return {
      matched: false,
      rawText,
      normalizedText,
      args: [],
    };
  }

  const exact = EXACT_COMMANDS[normalizedText];
  if (exact) {
    return {
      matched: true,
      commandKey: exact,
      rawText,
      normalizedText,
      args: [],
    };
  }

  const naturalLanguageCommand = matchNaturalLanguageCommand(normalizedText);
  if (naturalLanguageCommand) {
    return {
      matched: true,
      commandKey: naturalLanguageCommand,
      rawText,
      normalizedText,
      args: [],
    };
  }

  const detectedIntent = detectIntent(normalizedText);
  if (
    detectedIntent !== "none" &&
    detectedIntent !== "reset"
  ) {
    return {
      matched: true,
      commandKey: detectedIntent,
      rawText,
      normalizedText,
      args: [],
    };
  }

  const parts = normalizedText.split(" ");
  const prefix = parts[0];

  const contextualMatch = normalizedText.match(/^(ver|editar|eliminar)\s+(\d+)$/);
  if (contextualMatch) {
    const [, action, indexRaw] = contextualMatch;
    const numericArg = Number(indexRaw);
    const commandKey =
      action === "ver"
        ? "ver_producto"
        : action === "editar"
          ? "editar_producto"
          : "eliminar_producto";

    return {
      matched: true,
      commandKey,
      rawText,
      normalizedText,
      args: [indexRaw],
      numericArg,
    };
  }

  if (prefix === "editar" || prefix === "eliminar" || prefix === "ver") {
    return {
      matched: false,
      rawText,
      normalizedText,
      args: parts.slice(1),
    };
  }

  return {
    matched: false,
    rawText,
    normalizedText,
    args: parts.slice(1),
  };
}
