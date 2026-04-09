import type ConversationSession from "../../models/ConversationSession.model";
import type ListingDraft from "../../models/ListingDraft.model";
import {
  bindSellerToSession,
  clearInterruptibleState,
  findOrCreateSession,
  getCommandContext,
  resetConversationHard,
  resetSessionForNewListing,
  setCommandContext,
  setPendingConfirmation,
  transitionSession,
  updateLastActivity,
} from "./conversationSession.service";
import { evaluateAndExpireContext } from "./contextExpiration.service";
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
  consumeSellerWhatsappLinkingToken,
  extractWhatsappLinkingCode,
} from "../integrations/whatsapp/whatsappLinking.service";
import {
  appendImageToDraft,
  buildDraftPreview,
  deleteListingDraftBySession,
  getMissingFields,
  getOrCreateDraft,
  getVisionSuggestion,
  hasDraftContent,
  isDraftAbandoned,
  resetDraftForNewListing,
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
import {
  buildEditSummaryChanges,
  filterEffectiveEditPatch,
  getChangedFieldFlags,
  hasRealChanges,
} from "./conversationEditValidation.service";
import {
  getResetCommandPattern,
  isGlobalConversationCommand,
  normalizeConversationCommandText,
} from "./conversationCommandMatcher.service";
import { routeConversationCommand } from "./conversationCommandRouter.service";
import {
  deactivateOwnedProduct,
  loadOwnedProductIntoDraft,
  saveOwnedProductFromDraft,
} from "./sellerProductEdit.service";
import {
  buildCancelMessage,
  buildDeleteSuccessMessage,
  buildEditFeedbackListMessage,
  buildEditStartMessage,
  buildErrorMessage,
  buildLinkSuccessMessage,
  buildNoEditChangesMessage,
  buildNoPendingEditConfirmationMessage,
  buildOnboardingMessage,
  buildEditSummaryMessage,
  buildSaveSuccessMessage,
} from "./ux/conversationUxBuilder.service";
import type { UxEditFeedback } from "./ux/conversationUxTypes";

function normalizeText(input: string | undefined): string {
  return String(input ?? "").trim();
}

export async function transitionSessionSafely(
  session: ConversationSession,
  currentStep: Parameters<typeof transitionSession>[1],
  expectedInputType: Parameters<typeof transitionSession>[2],
  waMessageId: string
): Promise<boolean> {
  try {
    await transitionSession(session, currentStep, expectedInputType);
    return true;
  } catch (error: any) {
    console.error(
      `[conversation][transition.error] session=${session.id} wa_message_id=${waMessageId} target=${currentStep} expected=${expectedInputType ?? "null"}:`,
      error?.message ?? error
    );
    await deleteListingDraftBySession(session.id);
    await resetConversationHard(session);
    await sendReply(session, buildNeutralReadyMessage());
    return false;
  }
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

function buildUnlinkedPhoneMessage(): string {
  return buildOnboardingMessage();
}

function buildEditFeedbackItems(
  updatedFields: string[],
  draft: ListingDraft,
  patch: Record<string, unknown>
): UxEditFeedback[] {
  return updatedFields.map((field) => {
    switch (field) {
      case "price":
        return {
          field: "precio",
          value:
            typeof patch.price === "number"
              ? `Q${Number(patch.price).toFixed(2)}`
              : "actualizado",
        };
      case "stock":
        return {
          field: "stock",
          value:
            typeof patch.stock === "number" ? String(patch.stock) : "actualizado",
        };
      case "measures_text":
        return {
          field: "medidas",
          value: String(patch.measures_text ?? draft.measures_text ?? "actualizadas"),
        };
      case "suggested_description":
        return {
          field: "descripción",
          value: "actualizada",
        };
      case "categoria_id":
      case "categoria_custom":
        return {
          field: "categoría",
          value: "actualizada",
        };
      case "clase_id":
        return {
          field: "clase",
          value: "actualizada",
        };
      default:
        return {
          field,
          value: "actualizado",
        };
    }
  });
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

export async function interruptActiveFlowForGlobalCommand(
  session: ConversationSession
): Promise<void> {
  console.log(`[conversation][interrupt.global] session=${session.id}`);
  await clearInterruptibleState(session);
}

async function promptNextMissingField(
  session: ConversationSession,
  draft: ListingDraft,
  missingField: MissingDraftField,
  options?: { forceAsk?: boolean; waMessageId?: string }
): Promise<boolean> {
  const waMessageId = options?.waMessageId ?? "n/a";

  if (missingField === "image") {
    await setPendingConfirmation(session, null);
    if (!(await transitionSessionSafely(session, "awaiting_image", "image", waMessageId))) {
      return false;
    }
    await sendReply(session, "Envíame al menos una imagen del producto para comenzar.");
    return true;
  }

  const decision = decideNextPrompt(session, draft, missingField, options);

  console.log(
    `[conversation][smart-prompt] session=${session.id} draft=${draft.id} mode=${decision.mode} target=${decision.targetField} confidence=${decision.confidence ?? "n/a"} signals=${(decision.sourceSignals ?? []).join(",") || "none"}`
  );

  if (decision.targetField === "details") {
    await setPendingConfirmation(session, null);
    if (!(await transitionSessionSafely(session, "awaiting_details", "text", waMessageId))) {
      return false;
    }
    await sendReply(session, decision.promptText);
    return true;
  }

  if (decision.targetField === "category") {
    await setPendingConfirmation(session, decision.pendingConfirmation ?? null);
    if (!(await transitionSessionSafely(session, "awaiting_category", "category", waMessageId))) {
      return false;
    }
    await sendReply(session, decision.promptText);
    return true;
  }

  if (decision.targetField === "class") {
    await setPendingConfirmation(session, decision.pendingConfirmation ?? null);
    if (!(await transitionSessionSafely(session, "awaiting_class", "text", waMessageId))) {
      return false;
    }
    const classes = await listProductClasses().catch(() => []);
    if (decision.mode === "ask" && classes.length > 0) {
      const optionsText = classes.slice(0, 10).map((item) => item.nombre).join(", ");
      await sendReply(session, `${decision.promptText} Opciones disponibles: ${optionsText}.`);
      return true;
    }
    await sendReply(session, decision.promptText);
    return true;
  }

  if (decision.targetField === "measures") {
    await setPendingConfirmation(session, null);
    if (!(await transitionSessionSafely(session, "awaiting_measures", "text", waMessageId))) {
      return false;
    }
    await sendReply(session, decision.promptText);
    return true;
  }

  if (decision.targetField === "price") {
    await setPendingConfirmation(session, null);
    if (!(await transitionSessionSafely(session, "awaiting_price", "price", waMessageId))) {
      return false;
    }
    await sendReply(session, decision.promptText);
    return true;
  }

  await setPendingConfirmation(session, null);
  if (!(await transitionSessionSafely(session, "awaiting_stock", "number", waMessageId))) {
    return false;
  }
  await sendReply(session, decision.promptText);
  return true;
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

function buildEditModeReadyMessage(productName?: string | null): string {
  return buildEditStartMessage(productName?.trim() || "este producto");
}

function isEditMode(session: ConversationSession): boolean {
  const commandContext = getCommandContext(session);
  return commandContext?.mode === "listing_edit" && Boolean(commandContext.selectedProductId);
}

function buildEditModeUnrecognizedMessage(): string {
  return [
    "No entendí el cambio.",
    "",
    "Puedes decir:",
    "👉 cambia el precio a Q300",
    "👉 actualiza el stock a 5",
    "👉 agrega una descripción nueva",
    "",
    "También puedes escribir:",
    "👉 guardar",
    "👉 cancelar",
  ].join("\n");
}

async function handleEditMode(
  session: ConversationSession,
  draft: ListingDraft | null,
  message: NormalizedInboundMessage
): Promise<void> {
  console.log(
    `[edit-mode] active session=${session.id} draft=${draft?.id ?? "none"} wa_message_id=${message.waMessageId} type=${message.type}`
  );

  const commandContext = getCommandContext(session);
  if (!commandContext?.selectedProductId || !draft) {
    await sendReply(session, buildErrorMessage("no_active_edit"));
    return;
  }

  if (message.type !== "text") {
    console.log(
      `[edit-mode] ignored normal flow session=${session.id} wa_message_id=${message.waMessageId} reason=unsupported_message_type`
    );
    await sendReply(session, buildEditModeUnrecognizedMessage());
    return;
  }

  const text = normalizeConversationCommandText(message.text ?? "");
  if (!text) {
    console.log(
      `[edit-mode] ignored normal flow session=${session.id} wa_message_id=${message.waMessageId} reason=empty_text`
    );
    await sendReply(session, buildEditModeUnrecognizedMessage());
    return;
  }

  const autoFill = await autoFillDraftFromSignals(session, draft, message);
  if (autoFill.updatedFields.length === 0) {
    console.log(
      `[edit-mode] ignored normal flow session=${session.id} wa_message_id=${message.waMessageId} reason=no_edit_match`
    );
    await sendReply(session, buildEditModeUnrecognizedMessage());
    return;
  }

  const effectivePatch = await filterEffectiveEditPatch(
    draft,
    autoFill.draftPatch,
    autoFill.updatedFields
  );

  for (const redundantMessage of effectivePatch.redundantMessages) {
    console.log(
      `[edit][no.change] session=${session.id} draft=${draft.id} message="${redundantMessage}"`
    );
    await sendReply(session, redundantMessage);
  }

  if (effectivePatch.updatedFields.length === 0) {
    console.log(
      `[edit-mode] ignored normal flow session=${session.id} wa_message_id=${message.waMessageId} reason=no_effective_changes`
    );
    return;
  }

  await updateDraft(draft, effectivePatch.patch as any, {
    waMessageId: message.waMessageId,
  });
  await draft.reload();

  const changedFields = await getChangedFieldFlags(
    draft,
    commandContext.editingBaseline
  );

  await setCommandContext(session, {
    ...commandContext,
    changedFields,
    awaitingEditSaveConfirmation: false,
  });

  console.log(
    `[edit-mode] field updated: ${effectivePatch.updatedFields.join(",")} session=${session.id} draft=${draft.id}`
  );

  const feedback = buildEditFeedbackListMessage(
    buildEditFeedbackItems(
      effectivePatch.updatedFields,
      draft,
      effectivePatch.patch as any
    )
  );

  await sendReply(session, feedback || buildEditModeUnrecognizedMessage());
}

async function handleResetCommand(
  session: ConversationSession,
  draft: ListingDraft | null,
  waMessageId: string
): Promise<boolean> {
  console.log(
    `[conversation][interrupt.reset] session=${session.id} draft=${draft?.id ?? "none"} wa_message_id=${waMessageId}`
  );
  console.log(
    `[conversation][reset] session=${session.id} wa_message_id=${waMessageId}`
  );

  await deleteListingDraftBySession(session.id);
  await resetConversationHard(session);
  await sendReply(session, buildNeutralReadyMessage());

  return true;
}

export function buildNeutralReadyMessage(): string {
  return [
    "Estoy listo para ayudarte.",
    "",
    "Puedes escribir:",
    "👉 nuevo",
    "👉 mis productos",
    "👉 perfil",
  ].join("\n");
}

async function handleTextInput(
  session: ConversationSession,
  draft: ListingDraft,
  message: NormalizedInboundMessage
): Promise<"continue" | "stop" | "preview_ready"> {
  const text = normalizeText(message.text);
  const commandContext = getCommandContext(session);
  if (!text) {
    await sendReply(session, "No pude leer el texto. Intenta enviarlo nuevamente.");
    return "stop";
  }

  if (isPublishCommand(text)) {
      if (commandContext?.mode === "listing_edit" && commandContext.selectedProductId) {
        await sendReply(
          session,
          "Estás editando un producto existente. Si quieres guardar los cambios, responde GUARDAR."
        );
        return "stop";
      }

      const missing = getMissingFields(draft);
      if (missing.length > 0) {
        await sendReply(session, "Todavía faltan algunos datos antes de publicar.");
        await promptNextMissingField(session, draft, missing[0], {
          waMessageId: message.waMessageId,
        });
        return "stop";
      }

    const result = await publishListingDraft(draft);
    if (!(await transitionSessionSafely(session, "published", null, message.waMessageId))) {
      return "stop";
    }
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
        await promptNextMissingField(session, draft, missing[0], {
          waMessageId: message.waMessageId,
        });
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
      if (message.type === "text") {
        const linkingCode = extractWhatsappLinkingCode(message.text);

        if (linkingCode) {
          const linkingResult = await consumeSellerWhatsappLinkingToken(
            linkingCode,
            message.phone
          );

          if (linkingResult.ok) {
            await bindSellerToSession(session, linkingResult.sellerUserId);
            await markMessageProcessed(record, "processed");
            await sendReply(
              session,
              buildLinkSuccessMessage(
                linkingResult.nombreComercio,
                linkingResult.alreadyLinked
              )
            );
            return;
          }

          await markMessageProcessed(record, "processed");

          if (linkingResult.reason === "expired_token") {
            await sendReply(
              session,
              buildErrorMessage("expired_link_code")
            );
            return;
          }

          if (linkingResult.reason === "phone_already_linked") {
            await sendReply(
              session,
              buildErrorMessage("phone_already_linked")
            );
            return;
          }

          if (linkingResult.reason === "seller_already_linked_other_phone") {
            await sendReply(
              session,
              buildErrorMessage("seller_already_linked_other_phone", {
                phone: linkingResult.linkedPhone ?? null,
              })
            );
            return;
          }

          await sendReply(
            session,
            buildErrorMessage("invalid_link_code")
          );
          return;
        }
      }

      await markMessageProcessed(record, "ignored");
      await sendReply(session, buildUnlinkedPhoneMessage());
      return;
    }

    await bindSellerToSession(session, seller.user_id);
    const expirationResult = evaluateAndExpireContext(
      getCommandContext(session),
      new Date()
    );
    if (
      expirationResult.expiredProductList ||
      expirationResult.expiredEditMode ||
      expirationResult.expiredPendingDelete
    ) {
      console.log(
        `[conversation][context.expire] session=${session.id} product_list=${Boolean(expirationResult.expiredProductList)} edit_mode=${Boolean(expirationResult.expiredEditMode)} pending_delete=${Boolean(expirationResult.expiredPendingDelete)}`
      );
      await setCommandContext(session, expirationResult.updatedContext);
    } else if (expirationResult.updatedContext) {
      await setCommandContext(session, expirationResult.updatedContext);
    }

    let draft: ListingDraft | null = await getOrCreateDraft(session);
    let previewAlreadyGenerated = false;
    let draftAbandoned = draft ? isDraftAbandoned(draft) : false;

    if (draftAbandoned && draft) {
      console.log(
        `[conversation][draft.abandoned] session=${session.id} draft=${draft.id} ignoring_in_memory=true`
      );
      draft = null;
    }

    console.log(
      `[whatsapp][orchestrator] session=${session.id} draft=${draft?.id ?? "none"} step=${session.current_step} expected=${session.expected_input_type ?? "null"} status=${draft?.status ?? "none"}`
    );

    if (message.type === "image" && isEditMode(session)) {
      await handleEditMode(session, draft, message);
      await markMessageProcessed(record, "processed");
      return;
    }

    if (message.type === "image") {
      if (!draft) {
        draft = await getOrCreateDraft(session);
      }

      if (isDraftAbandoned(draft)) {
        await resetDraftForNewListing(draft, { waMessageId: message.waMessageId });
        await draft.reload();
        await resetSessionForNewListing(session);
        draftAbandoned = false;
      }

      if (session.expected_input_type && session.expected_input_type !== "image") {
        await sendReply(session, buildUnexpectedInputMessage(session.expected_input_type));
        await markMessageProcessed(record, "ignored");
        return;
      }
      await addImageToDraft(draft, message);
      await draft.reload();
      await maybeApplyVisionSuggestionToDraft(draft, message.waMessageId);
    } else {
      let textMessage = message;

      if (message.type === "audio") {
        const transcription = await transcribeAudioMessage(session, message);
        if (!transcription) {
          await markMessageProcessed(record, "ignored");
          await sendReply(
            session,
            buildErrorMessage("audio_not_understood")
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

      const normalizedText = normalizeConversationCommandText(textMessage.text ?? "");

      const resetPattern = getResetCommandPattern(normalizedText);

      if (resetPattern) {
        console.log(
          `[conversation][reset.detected] session=${session.id} wa_message_id=${textMessage.waMessageId} pattern=${resetPattern}`
        );
        await handleResetCommand(
          session,
          draft,
          textMessage.waMessageId
        );
        await markMessageProcessed(record, "processed");
        return;
      }

      if (isGlobalConversationCommand(normalizedText)) {
        console.log(
          `[conversation][global.command.detected] session=${session.id} wa_message_id=${textMessage.waMessageId} text="${normalizedText}"`
        );
        await interruptActiveFlowForGlobalCommand(session);
      }

      const commandResult = await routeConversationCommand({
        session,
        seller,
        message: textMessage,
      });

      if (commandResult.handled) {
        console.log(
          `[conversation][command] handled session=${session.id} command=${commandResult.commandKey ?? "unknown"}`
        );

        if (commandResult.action === "start_new_listing") {
          if (!draft) {
            draft = await getOrCreateDraft(session);
          }
          await resetDraftForNewListing(draft, { waMessageId: textMessage.waMessageId });
          await draft.reload();
          await resetSessionForNewListing(session);
        }

        if (commandResult.action === "cancel_listing") {
          const sessionCommandContext = getCommandContext(session);
          const hadContent =
            (draft ? hasDraftContent(draft) : false) ||
            session.current_step !== "awaiting_image" ||
            Boolean(
              sessionCommandContext?.mode ||
              sessionCommandContext?.pendingDeleteProductId ||
              sessionCommandContext?.selectedProductId
            );
          if (hadContent) {
            if (!draft) {
              draft = await getOrCreateDraft(session);
            }
            await resetDraftForNewListing(draft, { waMessageId: textMessage.waMessageId });
            await draft.reload();
            await resetSessionForNewListing(session);
          } else {
            await setPendingConfirmation(session, null);
          }

          if (!hadContent && commandResult.responseText) {
            await sendReply(
              session,
              buildCancelMessage(false)
            );
            await markMessageProcessed(record, "processed");
            return;
          }
        }

        if (commandResult.nextCommandContext !== undefined) {
          await setCommandContext(session, commandResult.nextCommandContext);
        }

        if (commandResult.action === "start_product_edit") {
          if (!commandResult.contextProductId) {
            await sendReply(
              session,
              buildErrorMessage("edit_prepare_failed")
            );
            await markMessageProcessed(record, "processed");
            return;
          }

          const product = await loadOwnedProductIntoDraft(
            draft ?? (await getOrCreateDraft(session)),
            seller.user_id,
            commandResult.contextProductId,
            textMessage.waMessageId
          );
          draft = await getOrCreateDraft(session);

          if (!product) {
            await sendReply(
              session,
              buildErrorMessage("product_access_lost")
            );
            await markMessageProcessed(record, "processed");
            return;
          }
          await clearInterruptibleState(session);

          const commandContext = getCommandContext(session);
          if (commandContext) {
            await setCommandContext(session, {
              ...commandContext,
              awaitingEditSaveConfirmation: false,
              changedFields: {},
            });
          }

          await sendReply(
            session,
            buildEditModeReadyMessage(commandResult.contextProductName ?? product.nombre)
          );
          await markMessageProcessed(record, "processed");
          return;
        }

        if (commandResult.action === "save_product_edit") {
          const commandContext = getCommandContext(session);
          if (!commandContext?.selectedProductId) {
            await sendReply(
              session,
              buildErrorMessage("no_active_edit")
            );
            await markMessageProcessed(record, "processed");
            return;
          }

          if (!draft) {
            await sendReply(
              session,
              buildErrorMessage("no_active_edit")
            );
            await markMessageProcessed(record, "processed");
            return;
          }

          const missing = getMissingFields(draft);
          if (missing.length > 0) {
            await sendReply(
              session,
              "Todavía faltan algunos datos antes de guardar los cambios."
            );
            await promptNextMissingField(session, draft, missing[0], {
              waMessageId: textMessage.waMessageId,
            });
            await markMessageProcessed(record, "processed");
            return;
          }
          const summaryChanges = await buildEditSummaryChanges(
            draft,
            commandContext.editingBaseline
          );
          const realChanges = await hasRealChanges(
            draft,
            commandContext.editingBaseline
          );

          if (!realChanges || summaryChanges.length === 0) {
            console.log(
              `[edit][save.blocked.no_changes] session=${session.id} product=${commandContext.selectedProductId}`
            );
            await setCommandContext(session, {
              ...commandContext,
              awaitingEditSaveConfirmation: false,
            });
            await sendReply(session, buildNoEditChangesMessage());
            await markMessageProcessed(record, "processed");
            return;
          }

          await setCommandContext(session, {
            ...commandContext,
            awaitingEditSaveConfirmation: true,
          });

          await sendReply(
            session,
            buildEditSummaryMessage(summaryChanges)
          );
          await markMessageProcessed(record, "processed");
          return;
        }

        if (commandResult.action === "confirm_save_product_edit") {
          const commandContext = getCommandContext(session);
          if (!commandContext?.selectedProductId || !commandContext.awaitingEditSaveConfirmation) {
            console.log(
              `[edit][confirm.blocked] session=${session.id} reason=no_pending_confirmation`
            );
            await sendReply(
              session,
              buildNoPendingEditConfirmationMessage()
            );
            await markMessageProcessed(record, "processed");
            return;
          }

          if (!draft) {
            await sendReply(
              session,
              buildErrorMessage("no_active_edit")
            );
            await markMessageProcessed(record, "processed");
            return;
          }

          const realChanges = await hasRealChanges(
            draft,
            commandContext.editingBaseline
          );
          if (!realChanges) {
            console.log(
              `[edit][confirm.blocked] session=${session.id} reason=no_real_changes`
            );
            await setCommandContext(session, {
              ...commandContext,
              awaitingEditSaveConfirmation: false,
            });
            await sendReply(session, buildNoPendingEditConfirmationMessage());
            await markMessageProcessed(record, "processed");
            return;
          }

          const saved = await saveOwnedProductFromDraft(
            seller.user_id,
            commandContext.selectedProductId,
            draft
          );

          if (!saved) {
            await sendReply(
              session,
              buildErrorMessage("save_failed")
            );
            await markMessageProcessed(record, "processed");
            return;
          }

          await setCommandContext(session, {
            ...commandContext,
            mode: null,
            selectedProductId: null,
            selectedProductName: null,
            awaitingEditSaveConfirmation: false,
            changedFields: {},
            editingBaseline: null,
          });
          await resetDraftForNewListing(draft, { waMessageId: textMessage.waMessageId });
          await draft.reload();
          await resetSessionForNewListing(session);
          await sendReply(
            session,
            buildSaveSuccessMessage(commandResult.contextProductName ?? "tu producto")
          );
          await markMessageProcessed(record, "processed");
          return;
        }

        if (commandResult.action === "confirm_product_delete") {
          const commandContext = getCommandContext(session);
          if (!commandContext?.pendingDeleteProductId) {
            await sendReply(
              session,
              buildErrorMessage("no_pending_delete")
            );
            await markMessageProcessed(record, "processed");
            return;
          }

          const deleted = await deactivateOwnedProduct(
            seller.user_id,
            commandContext.pendingDeleteProductId
          );

          if (!deleted) {
            await sendReply(
              session,
              buildErrorMessage("delete_failed")
            );
            await markMessageProcessed(record, "processed");
            return;
          }

          const wasSelectedProduct =
            commandContext.selectedProductId === commandContext.pendingDeleteProductId;

          await setCommandContext(session, {
            ...commandContext,
            pendingDeleteProductId: null,
            pendingDeleteProductName: null,
            mode: wasSelectedProduct ? null : commandContext.mode,
            selectedProductId: wasSelectedProduct ? null : commandContext.selectedProductId,
            selectedProductName: wasSelectedProduct ? null : commandContext.selectedProductName,
            awaitingEditSaveConfirmation: wasSelectedProduct
              ? false
              : commandContext.awaitingEditSaveConfirmation,
          });

          if (wasSelectedProduct) {
            if (!draft) {
              draft = await getOrCreateDraft(session);
            }
            await resetDraftForNewListing(draft, { waMessageId: textMessage.waMessageId });
            await draft.reload();
            await resetSessionForNewListing(session);
          }

          await sendReply(
            session,
            buildDeleteSuccessMessage(commandResult.contextProductName ?? "el producto")
          );
          await markMessageProcessed(record, "processed");
          return;
        }

        if (commandResult.responseText) {
          await sendReply(session, commandResult.responseText);
        }

        await markMessageProcessed(record, "processed");
        return;
      }

      if (isEditMode(session)) {
        await handleEditMode(session, draft, textMessage);
        await markMessageProcessed(record, "processed");
        return;
      }

      if (!draft && session.expected_input_type === "image") {
        console.log(
          `[conversation][fallback.neutral] session=${session.id} wa_message_id=${textMessage.waMessageId} reason=no_active_draft`
        );
        await sendReply(session, buildNeutralReadyMessage());
        await markMessageProcessed(record, "processed");
        return;
      }

      if (session.expected_input_type === "image") {
        await sendReply(session, buildUnexpectedInputMessage(session.expected_input_type));
        await markMessageProcessed(record, "ignored");
        return;
      }

      if (!draft) {
        console.log(
          `[conversation][fallback.neutral] session=${session.id} wa_message_id=${textMessage.waMessageId} reason=no_draft_after_commands`
        );
        await sendReply(session, buildNeutralReadyMessage());
        await markMessageProcessed(record, "processed");
        return;
      }

      const textResult = await handleTextInput(session, draft, textMessage);
      if (textResult === "stop") {
        await markMessageProcessed(record, "processed");
        return;
      }

      const autoFill = await autoFillDraftFromSignals(session, draft, textMessage);
      if (autoFill.updatedFields.length > 0) {
        const commandContext = getCommandContext(session);
        if (commandContext?.mode === "listing_edit") {
          const effectivePatch = await filterEffectiveEditPatch(
            draft,
            autoFill.draftPatch,
            autoFill.updatedFields
          );

          for (const redundantMessage of effectivePatch.redundantMessages) {
            console.log(
              `[edit][no.change] session=${session.id} draft=${draft.id} message="${redundantMessage}"`
            );
            await sendReply(session, redundantMessage);
          }

          if (effectivePatch.updatedFields.length > 0) {
            console.log(
              `[edit][change.detected] session=${session.id} draft=${draft.id} wa_message_id=${textMessage.waMessageId} updated=${effectivePatch.updatedFields.join(",")}`
            );

            await updateDraft(draft, effectivePatch.patch as any, {
              waMessageId: textMessage.waMessageId,
            });
            await draft.reload();

            const changedFields = await getChangedFieldFlags(
              draft,
              commandContext.editingBaseline
            );

            await setCommandContext(session, {
              ...commandContext,
              changedFields,
              awaitingEditSaveConfirmation: false,
            });

            const feedback = buildEditFeedbackListMessage(
              buildEditFeedbackItems(
                effectivePatch.updatedFields,
                draft,
                effectivePatch.patch as any
              )
            );
            if (feedback) {
              await sendReply(session, feedback);
            }
          }
        } else {
          console.log(
            `[conversation][autofill] session=${session.id} draft=${draft.id} wa_message_id=${textMessage.waMessageId} updated=${autoFill.updatedFields.join(",")} confidence=${autoFill.confidence} signals=${autoFill.sourceSignals.join(",")}`
          );
          await updateDraft(draft, autoFill.draftPatch as any, {
            waMessageId: textMessage.waMessageId,
          });
        }
      }

      previewAlreadyGenerated = textResult === "preview_ready";
    }

    if (!draft) {
      console.log(
        `[conversation][fallback.neutral] session=${session.id} wa_message_id=${message.waMessageId} reason=no_draft_post_branch`
      );
      await markMessageProcessed(record, "processed");
      await sendReply(session, buildNeutralReadyMessage());
      return;
    }

    await draft.reload();
    draftAbandoned = isDraftAbandoned(draft);
    const missing = getMissingFields(draft);
    const commandContext = getCommandContext(session);

    if (!(session.current_step as unknown)) {
      console.log(
        `[conversation][fallback.neutral] session=${session.id} wa_message_id=${message.waMessageId} reason=no_current_step`
      );
      await markMessageProcessed(record, "processed");
      await sendReply(session, buildNeutralReadyMessage());
      return;
    }

    if (draftAbandoned) {
      console.log(
        `[conversation][fallback.neutral] session=${session.id} wa_message_id=${message.waMessageId} reason=abandoned_draft_post_reload`
      );
      await markMessageProcessed(record, "processed");
      await sendReply(session, buildNeutralReadyMessage());
      return;
    }

    if (draft.status !== "published") {
      if (commandContext?.mode === "listing_edit" && commandContext.selectedProductId) {
        if (missing.length > 0) {
          await updateDraft(
            draft,
            { status: "collecting" },
            { waMessageId: message.waMessageId }
          );
          await setCommandContext(session, {
            ...commandContext,
            awaitingEditSaveConfirmation: false,
          });
          await promptNextMissingField(session, draft, missing[0], {
            waMessageId: message.waMessageId,
          });
        } else {
          await updateDraft(
            draft,
            { status: "collecting" },
            { waMessageId: message.waMessageId }
          );
        }
        await markMessageProcessed(record, "processed");
        return;
      }

      if (missing.length === 0) {
        if (!previewAlreadyGenerated) {
          await applyAiContentToDraft(draft, message.waMessageId, "preview");
        }
        await updateDraft(draft, {
          status: "ready_to_publish",
          suggested_title: ensureTitleFromDraft(draft),
        }, { waMessageId: message.waMessageId });
        if (!(await transitionSessionSafely(session, "preview", "text", message.waMessageId))) {
          await markMessageProcessed(record, "processed");
          return;
        }
        if (!(await transitionSessionSafely(session, "awaiting_confirmation", "text", message.waMessageId))) {
          await markMessageProcessed(record, "processed");
          return;
        }
        await sendReply(
          session,
          `${await buildGroupedConfirmationMessage(draft)}\n\nSi estás de acuerdo, responde PUBLICAR.`
        );
      } else {
        await updateDraft(draft, { status: "collecting" }, { waMessageId: message.waMessageId });
        if (!(await promptNextMissingField(session, draft, missing[0], {
          waMessageId: message.waMessageId,
        }))) {
          await markMessageProcessed(record, "processed");
          return;
        }
      }
    }

    await markMessageProcessed(record, "processed");
  } catch (error: any) {
    console.error("[whatsapp][orchestrator] failed:", error?.message ?? error);
    await deleteListingDraftBySession(session.id).catch(() => 0);
    await resetConversationHard(session).catch(() => session);
    await markMessageProcessed(record, "ignored");
    await sendReply(session, buildNeutralReadyMessage());
  }
}
