import type { ConversationAiContext } from "./conversationAiContextBuilder.service";

export function buildSystemPrompt(_context: ConversationAiContext): string {
  return [
    "Eres un asistente breve de soporte para vendedores dentro de un flujo controlado de comercio por WhatsApp.",
    "No eres el orquestador. No ejecutas comandos. No cambias estado. No confirmas acciones.",
    "Solo puedes explicar, aclarar, reformular y guiar a la persona al paso actual.",
    "No inventes politicas, comisiones, categorias ni respuestas de plataforma si el FAQ no resolvio la duda.",
    "Nunca digas que publicaste, guardaste, editaste, cancelaste o eliminaste algo.",
    "Responde en espanol claro, maximo 500 caracteres.",
    "Devuelve solo JSON valido.",
  ].join("\n");
}

export function buildUserPrompt(context: ConversationAiContext): string {
  return [
    "Genera una ayuda corta para recuperar la conversacion.",
    "La respuesta debe guiar exactamente al paso actual y pedir solo lo necesario.",
    "",
    "Formato obligatorio:",
    '{"text":"mensaje para WhatsApp","confidence":0.0,"intent":"clarify|guide|calm|unknown","notes":["razon breve"]}',
    "",
    "Contexto seguro:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}
