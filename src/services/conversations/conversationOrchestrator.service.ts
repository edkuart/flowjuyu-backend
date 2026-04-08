import type ConversationSession from "../../models/ConversationSession.model";
import type ListingDraft from "../../models/ListingDraft.model";
import {
  bindSellerToSession,
  findOrCreateSession,
  setPendingConfirmation,
  transitionSession,
  updateLastActivity,
} from "./conversationSession.service";
import {
  markMessageProcessed,
  saveInboundMessageIfNew,
  saveOutboundTextMessage,
  updateInboundMessageTranscription,
} from "./conversationMessage.service";
import type { NormalizedInboundMessage } from "../integrations/whatsapp/whatsapp.types";
import { resolveSellerByPhone } from "../integrations/whatsapp/whatsappSellerResolver.service";
import { sendTextMessage } from "../integrations/whatsapp/whatsappOutbound.service";
import {
  appendImageToDraft,
  buildDraftPreview,
  getMissingFields,
  getOrCreateDraft,
  getVisionSuggestion,
  updateDraft,
  type MissingDraftField,
} from "../listing-drafts/listingDraft.service";
import { listProductClasses, resolveProductClassFromText } from "../listing-drafts/productCatalog.service";
import { publishListingDraft } from "../listing-drafts/listingPublish.service";
import { generateListingContent } from "../ai-listing/aiListingGeneration.service";
import { transcribeAudio } from "../ai-listing/aiListingTranscription.service";
import { analyzeListingImages } from "../ai-listing/aiListingVision.service";
import { downloadAudioMediaBuffer } from "../integrations/whatsapp/whatsappMedia.service";
import type { ExpectedInputType } from "./conversationState";
import {
  buildConfirmationClarification,
  buildPatchFromConfirmation,
  getPendingConfirmation,
  parseConfirmationIntent,
} from "./conversationConfirmation.service";
import { decideNextPrompt } from "./conversationSmartPrompt.service";
import {
  autoFillDraftFromSignals,
  buildGroupedConfirmationMessage,
} from "./conversationAutoFill.service";

function normalizeText(input: string | undefined): string {
  return String(input ?? "").trim();
}

function isPublishCommand(text: string): boolean {
  const normalized = normalizeText(text).toLowerCase();
  return ["publicar", "confirmar", "publicar producto", "confirmar publicar"].includes(normalized);
}

function isAiRefreshCommand(text: string): boolean {
  const normalized = normalizeText(text).toLowerCase();
  return [
    "hazlo mejor",
    "hazlo mas atractivo",
    "hazlo más atractivo",
    "mejora la descripcion",
    "mejora la descripción",
    "mejora descripcion",
    "mejora descripción",
  ].includes(normalized);
}

function parseMoney(text: string): number | null {
  const normalized = text.replace(/[^\d.,]/g, "").replace(",", ".");
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseStock(text: string): number | null {
  const normalized = text.replace(/[^\d]/g, "");
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

async function sendReply(session: ConversationSession, text: string): Promise<void> {
  try {
    console.log(
      `[whatsapp][outbound] session=${session.id} phone=${session.phone_e164} sending_text_length=${text.length}`
    );
    const result = await sendTextMessage(session.phone_e164, text);
    await saveOutboundTextMessage({
      sessionId: session.id,
      contentText: text,
      waMessageId: result.waMessageId,
      status: "sent",
      rawPayload: result.raw,
    });
  } catch (error: any) {
    console.error(
      `[whatsapp][outbound] send failed session=${session.id} phone=${session.phone_e164}:`,
      error?.message ?? error
    );
    await saveOutboundTextMessage({
      sessionId: session.id,
      contentText: text,
      status: "failed",
      rawPayload: { error: error?.message ?? String(error) },
    });
  }
}

async function promptNextMissingField(
  session: ConversationSession,
  draft: ListingDraft,
  missingField: MissingDraftField,
  options?: { forceAsk?: boolean }
): Promise<void> {
  if (missingField === "image") {
    await setPendingConfirmation(session, null);
    await transitionSession(session, "awaiting_image", "image");
    await sendReply(session, "Envíame al menos una imagen del producto para comenzar.");
    return;
  }

  const decision = decideNextPrompt(session, draft, missingField, options);

  console.log(
    `[conversation][smart-prompt] session=${session.id} draft=${draft.id} mode=${decision.mode} target=${decision.targetField} confidence=${decision.confidence ?? "n/a"} signals=${(decision.sourceSignals ?? []).join(",") || "none"}`
  );

  if (decision.targetField === "details") {
    await setPendingConfirmation(session, null);
    await transitionSession(session, "awaiting_details", "text");
    await sendReply(session, decision.promptText);
    return;
  }

  if (decision.targetField === "category") {
    await setPendingConfirmation(session, decision.pendingConfirmation ?? null);
    await transitionSession(session, "awaiting_category", "category");
    await sendReply(session, decision.promptText);
    return;
  }

  if (decision.targetField === "class") {
    await setPendingConfirmation(session, decision.pendingConfirmation ?? null);
    await transitionSession(session, "awaiting_class", "text");
    const classes = await listProductClasses().catch(() => []);
    if (decision.mode === "ask" && classes.length > 0) {
      const optionsText = classes.slice(0, 10).map((item) => item.nombre).join(", ");
      await sendReply(session, `${decision.promptText} Opciones disponibles: ${optionsText}.`);
      return;
    }
    await sendReply(session, decision.promptText);
    return;
  }

  if (decision.targetField === "measures") {
    await setPendingConfirmation(session, null);
    await transitionSession(session, "awaiting_measures", "text");
    await sendReply(session, decision.promptText);
    return;
  }

  if (decision.targetField === "price") {
    await setPendingConfirmation(session, null);
    await transitionSession(session, "awaiting_price", "price");
    await sendReply(session, decision.promptText);
    return;
  }

  await setPendingConfirmation(session, null);
  await transitionSession(session, "awaiting_stock", "number");
  await sendReply(session, decision.promptText);
}

function ensureTitleFromDraft(draft: ListingDraft): string {
  if (draft.suggested_title?.trim()) return draft.suggested_title.trim();
  if (draft.categoria_custom?.trim()) return draft.categoria_custom.trim();
  return "Producto artesanal";
}

async function addImageToDraft(
  draft: ListingDraft,
  message: NormalizedInboundMessage
): Promise<void> {
  if (!message.mediaId) return;
  await appendImageToDraft(
    draft.id,
    {
      source: "whatsapp",
      mediaId: message.mediaId,
      mimeType: message.mimeType ?? null,
    },
    { waMessageId: message.waMessageId }
  );
}

async function maybeApplyVisionSuggestionToDraft(
  draft: ListingDraft,
  waMessageId: string
): Promise<void> {
  const existingVision = getVisionSuggestion(draft);
  const needsVision =
    !existingVision ||
    (!draft.categoria_id && !draft.categoria_custom?.trim()) ||
    !draft.clase_id;

  if (!needsVision) {
    return;
  }

  const result = await analyzeListingImages(draft);

  console.log(
    `[conversation][ai-vision] draft=${draft.id} session=${draft.session_id} wa_message_id=${waMessageId} provider=${result.metadata.provider} model=${result.metadata.model ?? "n/a"} duration_ms=${result.metadata.durationMs} prompt_tokens=${result.metadata.promptTokens ?? "n/a"} completion_tokens=${result.metadata.completionTokens ?? "n/a"} fallback=${result.metadata.usedFallback} confidence=${result.suggestion?.confidence ?? "n/a"} error=${result.metadata.error ?? "none"}`
  );

  if (!result.suggestion) {
    return;
  }

  await updateDraft(
    draft,
    {
      vision_suggestions_json: result.suggestion,
    },
    { waMessageId }
  );

  await draft.reload();
}

function buildUnexpectedInputMessage(expected: ExpectedInputType | null): string {
  switch (expected) {
    case "image":
      return "Estoy esperando una imagen del producto. Envíamela para continuar.";
    case "price":
      return "Estoy esperando el precio. Por favor indícalo en formato QXXX.";
    case "number":
      return "Estoy esperando una cantidad numérica. Por favor responde con un número entero.";
    case "category":
      return "Estoy esperando la categoría del producto. Responde con el tipo de producto que quieres publicar.";
    case "text":
    default:
      return "Estoy esperando la información solicitada en texto. Por favor responde según la última pregunta.";
  }
}

async function clearRejectedConfirmationSuggestion(
  draft: ListingDraft,
  session: ConversationSession,
  targetField: "category" | "class",
  waMessageId: string
): Promise<void> {
  const vision = getVisionSuggestion(draft);
  if (!vision) {
    return;
  }

  if (targetField === "category") {
    await updateDraft(
      draft,
      {
        vision_suggestions_json: {
          ...vision,
          suggestedCategoryName: null,
          mappedCategoryId: null,
          mappedCategoryName: null,
        } as any,
      },
      { waMessageId }
    );
  } else {
    await updateDraft(
      draft,
      {
        vision_suggestions_json: {
          ...vision,
          suggestedClassName: null,
          mappedClassId: null,
          mappedClassName: null,
        } as any,
      },
      { waMessageId }
    );
  }

  console.log(
    `[conversation][confirmation.reject] session=${session.id} draft=${draft.id} target=${targetField} wa_message_id=${waMessageId}`
  );

  await draft.reload();
}

async function transcribeAudioMessage(
  session: ConversationSession,
  message: NormalizedInboundMessage
): Promise<string | null> {
  if (!message.mediaId) {
    return null;
  }

  const startedAt = Date.now();

  try {
    const audio = await downloadAudioMediaBuffer(message.mediaId);
    const transcription = await transcribeAudio(audio.buffer, audio.mimeType);

    console.log(
      `[conversation][audio.transcription] session=${session.id} wa_message_id=${message.waMessageId} mime=${audio.mimeType} size_bytes=${audio.sizeBytes} duration_ms=${Date.now() - startedAt}`
    );

    return transcription;
  } catch (error: any) {
    console.error(
      `[conversation][audio.transcription] failed session=${session.id} wa_message_id=${message.waMessageId} duration_ms=${Date.now() - startedAt}:`,
      error?.message ?? error
    );
    return null;
  }
}

async function applyAiContentToDraft(
  draft: ListingDraft,
  waMessageId: string,
  reason: "preview" | "regenerate"
): Promise<void> {
  const result = await generateListingContent(draft, { reason });

  console.log(
    `[conversation][ai-listing] draft=${draft.id} session=${draft.session_id} wa_message_id=${waMessageId} provider=${result.metadata.provider} model=${result.metadata.model ?? "n/a"} duration_ms=${result.metadata.durationMs} prompt_tokens=${result.metadata.promptTokens ?? "n/a"} completion_tokens=${result.metadata.completionTokens ?? "n/a"} fallback=${result.metadata.usedFallback} error=${result.metadata.error ?? "none"}`
  );

  await updateDraft(
    draft,
    {
      suggested_title: result.title,
      suggested_description: result.description,
    },
    { waMessageId }
  );

  await draft.reload();
}

async function handleTextInput(
  session: ConversationSession,
  draft: ListingDraft,
  message: NormalizedInboundMessage
): Promise<"continue" | "stop" | "preview_ready"> {
  const text = normalizeText(message.text);
  if (!text) {
    await sendReply(session, "No pude leer el texto. Intenta enviarlo nuevamente.");
    return "stop";
  }

  if (isPublishCommand(text)) {
      const missing = getMissingFields(draft);
      if (missing.length > 0) {
        await sendReply(session, "Todavía faltan algunos datos antes de publicar.");
        await promptNextMissingField(session, draft, missing[0]);
        return "stop";
      }

    const result = await publishListingDraft(draft);
    await transitionSession(session, "published", null);
    await sendReply(
      session,
      `Tu producto fue creado correctamente con ID ${result.productId}. Quedó guardado como inactivo para revisión final antes de activarlo.`
    );
    return "stop";
  }

  if (isAiRefreshCommand(text)) {
      const missing = getMissingFields(draft);
      if (missing.length > 0) {
        await sendReply(session, "Todavía faltan algunos datos antes de mejorar la descripción.");
        await promptNextMissingField(session, draft, missing[0]);
        return "stop";
      }

    await applyAiContentToDraft(draft, message.waMessageId, "regenerate");
    return "preview_ready";
  }

  const pendingConfirmation = getPendingConfirmation(session);
  if (
    pendingConfirmation &&
    (session.current_step === "awaiting_category" || session.current_step === "awaiting_class")
  ) {
    const confirmationIntent = parseConfirmationIntent(text);

    if (confirmationIntent === "yes") {
      await updateDraft(
        draft,
        buildPatchFromConfirmation(pendingConfirmation) as any,
        { waMessageId: message.waMessageId }
      );
      await setPendingConfirmation(session, null);

      console.log(
        `[conversation][confirmation.accept] session=${session.id} draft=${draft.id} target=${pendingConfirmation.targetField} wa_message_id=${message.waMessageId}`
      );

      return "continue";
    }

    if (confirmationIntent === "no") {
      await setPendingConfirmation(session, null);
      await clearRejectedConfirmationSuggestion(
        draft,
        session,
        pendingConfirmation.targetField,
        message.waMessageId
      );

      if (pendingConfirmation.targetField === "category") {
        await sendReply(
          session,
          "Entendido. Entonces dime la categoría correcta del producto."
        );
      } else {
        const classes = await listProductClasses().catch(() => []);
        const options = classes.slice(0, 10).map((item) => item.nombre).join(", ");
        await sendReply(
          session,
          `Entendido. Entonces dime la clase correcta del producto.${options ? ` Opciones disponibles: ${options}.` : ""}`
        );
      }

      return "stop";
    }

    if (pendingConfirmation.targetField === "category" || pendingConfirmation.targetField === "class") {
      const isExplicitOverride = text.length > 2;
      if (!isExplicitOverride) {
        await sendReply(session, buildConfirmationClarification(pendingConfirmation));
        return "stop";
      }

      await setPendingConfirmation(session, null);

      console.log(
        `[conversation][confirmation.override] session=${session.id} draft=${draft.id} target=${pendingConfirmation.targetField} wa_message_id=${message.waMessageId}`
      );
    }
  }

  switch (session.current_step) {
    case "awaiting_details":
      await updateDraft(draft, {
        suggested_description: text,
        suggested_title: ensureTitleFromDraft(draft),
      }, { waMessageId: message.waMessageId });
      return "continue";

    case "awaiting_category":
      await updateDraft(draft, {
        categoria_custom: text,
        suggested_title: text,
      }, { waMessageId: message.waMessageId });
      return "continue";

    case "awaiting_class": {
      const productClass = await resolveProductClassFromText(text);
      if (!productClass) {
        const classes = await listProductClasses().catch(() => []);
        const options = classes.slice(0, 10).map((item) => item.nombre).join(", ");
        await sendReply(
          session,
          `No encontré una clase exacta para "${text}".${options ? ` Opciones disponibles: ${options}.` : ""}`
        );
        return "stop";
      }
      await updateDraft(draft, { clase_id: productClass.id }, { waMessageId: message.waMessageId });
      return "continue";
    }

    case "awaiting_measures":
      await updateDraft(draft, { measures_text: text }, { waMessageId: message.waMessageId });
      return "continue";

    case "awaiting_price": {
      const price = parseMoney(text);
      if (price == null) {
        await sendReply(session, "No pude interpretar el precio. Intenta con un formato como Q250 o 250.");
        return "stop";
      }
      await updateDraft(draft, { price }, { waMessageId: message.waMessageId });
      return "continue";
    }

    case "awaiting_stock": {
      const stock = parseStock(text);
      if (stock == null) {
        await sendReply(session, "No pude interpretar la cantidad. Responde con un número entero, por ejemplo: 1.");
        return "stop";
      }
      await updateDraft(draft, { stock }, { waMessageId: message.waMessageId });
      return "continue";
    }

    case "preview":
    case "awaiting_confirmation":
      return "continue";

    default: {
      await sendReply(session, buildUnexpectedInputMessage(session.expected_input_type));
      return "stop";
    }
  }
}

export async function handleInboundMessage(
  message: NormalizedInboundMessage
): Promise<void> {
  const session = await findOrCreateSession(message.phone);
  await updateLastActivity(session);

  const { created, record } = await saveInboundMessageIfNew({
    sessionId: session.id,
    message,
  });

  if (!created) {
    console.log(`[whatsapp][inbound] duplicate ignored wa_message_id=${message.waMessageId}`);
    return;
  }

  try {
    console.log(
      `[whatsapp][orchestrator] handling session=${session.id} wa_message_id=${message.waMessageId} type=${message.type}`
    );

    const seller = await resolveSellerByPhone(message.phone);

    if (!seller) {
      await markMessageProcessed(record, "ignored");
      await sendReply(
        session,
        "Este número no está vinculado a un vendedor. Comunícate con soporte para registrar o actualizar tu número."
      );
      return;
    }

    await bindSellerToSession(session, seller.user_id);
    const draft = await getOrCreateDraft(session);
    let previewAlreadyGenerated = false;

    console.log(
      `[whatsapp][orchestrator] session=${session.id} draft=${draft.id} step=${session.current_step} expected=${session.expected_input_type ?? "null"}`
    );

    if (message.type === "image") {
      if (session.expected_input_type && session.expected_input_type !== "image") {
        await sendReply(session, buildUnexpectedInputMessage(session.expected_input_type));
        await markMessageProcessed(record, "ignored");
        return;
      }
      await addImageToDraft(draft, message);
      await draft.reload();
      await maybeApplyVisionSuggestionToDraft(draft, message.waMessageId);
    } else {
      if (session.expected_input_type === "image") {
        await sendReply(session, buildUnexpectedInputMessage(session.expected_input_type));
        await markMessageProcessed(record, "ignored");
        return;
      }
      let textMessage = message;

      if (message.type === "audio") {
        const transcription = await transcribeAudioMessage(session, message);
        if (!transcription) {
          await markMessageProcessed(record, "ignored");
          await sendReply(
            session,
            "No pude entender el audio, ¿puedes escribirlo o enviarlo nuevamente?"
          );
          return;
        }

        await updateInboundMessageTranscription(record, transcription);
        textMessage = {
          ...message,
          type: "text",
          text: transcription,
        };
      }

      const textResult = await handleTextInput(session, draft, textMessage);
      if (textResult === "stop") {
        await markMessageProcessed(record, "processed");
        return;
      }

      const autoFill = await autoFillDraftFromSignals(session, draft, textMessage);
      if (autoFill.updatedFields.length > 0) {
        console.log(
          `[conversation][autofill] session=${session.id} draft=${draft.id} wa_message_id=${textMessage.waMessageId} updated=${autoFill.updatedFields.join(",")} confidence=${autoFill.confidence} signals=${autoFill.sourceSignals.join(",")}`
        );
        await updateDraft(draft, autoFill.draftPatch as any, {
          waMessageId: textMessage.waMessageId,
        });
      }

      previewAlreadyGenerated = textResult === "preview_ready";
    }

    await draft.reload();
    const missing = getMissingFields(draft);

    if (draft.status !== "published") {
      if (missing.length === 0) {
        if (!previewAlreadyGenerated) {
          await applyAiContentToDraft(draft, message.waMessageId, "preview");
        }
        await updateDraft(draft, {
          status: "ready_to_publish",
          suggested_title: ensureTitleFromDraft(draft),
        }, { waMessageId: message.waMessageId });
        await transitionSession(session, "preview", "text");
        await transitionSession(session, "awaiting_confirmation", "text");
        await sendReply(
          session,
          `${await buildGroupedConfirmationMessage(draft)}\n\nSi estás de acuerdo, responde PUBLICAR.`
        );
      } else {
        await updateDraft(draft, { status: "collecting" }, { waMessageId: message.waMessageId });
        await promptNextMissingField(session, draft, missing[0]);
      }
    }

    await markMessageProcessed(record, "processed");
  } catch (error: any) {
    console.error("[whatsapp][orchestrator] failed:", error?.message ?? error);
    await markMessageProcessed(record, "ignored");
    await sendReply(
      session,
      "Ocurrió un problema procesando tu mensaje. Intenta nuevamente en un momento."
    );
  }
}
