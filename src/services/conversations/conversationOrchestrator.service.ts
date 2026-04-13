import type ConversationSession from "../../models/ConversationSession.model";
import type ListingDraft from "../../models/ListingDraft.model";
import ConversationFailureEvent from "../../models/ConversationFailureEvent.model";
import { logger } from "../../config/logger";
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
  getMissingFieldsForEdit,
  getOrCreateDraft,
  getVisionSuggestion,
  hasDraftContent,
  isDraftAbandoned,
  resetDraftForNewListing,
  updateDraft,
  type MissingDraftField,
} from "../listing-drafts/listingDraft.service";
import { listProductClasses, resolveProductClassFromText } from "../listing-drafts/productCatalog.service";
import { publishListingDraft, SkuCollisionError } from "../listing-drafts/listingPublish.service";
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
import {
  detectSyncFailureSignals,
  detectAsyncFailureSignals,
} from "./conversationFailureDetector.service";
import {
  buildAdaptiveRecovery,
  buildSafeModeGuidance,
} from "./conversationRecovery.service";
import { persistFailureEvent, persistFailureEvents } from "./conversationFailureEvent.service";
import { matchFaqEntry } from "../platform-faq/platformFaq.service";
import {
  updateSessionScore,
  applySuccessfulStepDecay,
  evaluateSafeMode,
  getSessionRiskLevel,
} from "./conversationScoring.service";
import {
  addUserMessage,
  addBotMessage,
  addAction,
  getMemorySnapshot,
  clearMemory,
} from "./conversationMemory.service";
import { shouldUseAiFallback } from "./conversationAiGate.service";
import {
  buildAiContext,
  getRecentFailureSignals,
  countRecentRecoveryAttempts,
} from "./conversationAiContextBuilder.service";
import {
  buildSystemPrompt,
  buildUserPrompt,
} from "./conversationAiPromptBuilder.service";
import { validateAiFallbackResponse } from "./conversationAiValidator.service";
import { getActiveFallbackAdapter } from "../ai/aiFallback.interface";
import type { ConversationStep } from "./conversationState";
import type { FailureSignal } from "./conversationFailureDetector.service";

function normalizeText(input: string | undefined): string {
  return String(input ?? "").trim();
}

const SAFE_MODE_GUIDED_COMMANDS = new Set([
  "nuevo",
  "mis productos",
  "cancelar",
  "menu",
]);

function isSafeModeGuidedCommand(normalizedText: string): boolean {
  return SAFE_MODE_GUIDED_COMMANDS.has(normalizedText);
}

function canProcessStrictSafeModeStep(
  session: ConversationSession,
  message: NormalizedInboundMessage
): boolean {
  if (message.type !== "text") return false;
  return Boolean(
    session.expected_input_type &&
      session.expected_input_type !== "image" &&
      session.current_step !== "awaiting_image"
  );
}

async function getRecentConversationFailureEvents(
  session: ConversationSession
): Promise<ConversationFailureEvent[]> {
  try {
    return await ConversationFailureEvent.findAll({
      where: { session_id: session.id },
      order: [["created_at", "DESC"]],
      limit: 10,
    });
  } catch (error: any) {
    logger.info(
      { session_id: session.id, error: error?.message ?? String(error) },
      "[conversation][ai.fallback]"
    );
    return [];
  }
}

async function maybeSendAiFallback(params: {
  session: ConversationSession;
  draft: ListingDraft | null;
  message: NormalizedInboundMessage;
  normalizedText: string;
  memory: ReturnType<typeof getMemorySnapshot>;
  currentSignals: FailureSignal[];
  ruleRecoveryText?: string;
}): Promise<boolean> {
  const recentEvents = await getRecentConversationFailureEvents(params.session);
  const historicalSignals = getRecentFailureSignals(recentEvents);
  const allSignals = [...params.currentSignals, ...historicalSignals];
  const priorRecoveryAttempts = countRecentRecoveryAttempts(recentEvents);

  const aiGate = shouldUseAiFallback({
    failure_score: params.session.failure_score ?? 0,
    frustration_score: params.session.frustration_score ?? 0,
    failure_signals: allSignals,
    current_step: params.session.current_step,
    expected_input_type: params.session.expected_input_type ?? null,
    safe_mode: Boolean(params.session.safe_mode),
    message_type: params.message.type,
    last_user_messages: params.memory.lastUserMessages,
    last_actions: params.memory.lastActions,
    recovery_attempted: priorRecoveryAttempts > 0,
  });

  if (!aiGate.useAi) return false;

  const adapter = getActiveFallbackAdapter();
  if (!adapter.isAvailable()) {
    logger.info(
      {
        session_id: params.session.id,
        wa_message_id: params.message.waMessageId,
        reason: "adapter_unavailable",
      },
      "[conversation][ai.fallback]"
    );
    return false;
  }

  const aiContext = buildAiContext(
    params.session,
    params.memory,
    params.draft,
    recentEvents,
    {
      activeFailureSignals: allSignals,
      triggerReason: aiGate.reason,
      priorRecoveryAttempts,
      ruleRecoveryText: params.ruleRecoveryText,
    }
  );
  const systemPrompt = buildSystemPrompt(aiContext);
  const userPrompt = buildUserPrompt(aiContext);

  logger.info(
    {
      session_id: params.session.id,
      wa_message_id: params.message.waMessageId,
      risk_level: aiContext.risk_level,
      reason: aiGate.reason,
      signals: allSignals,
    },
    "[conversation][ai.triggered]"
  );

  const aiResponse = await adapter.generateResponse({
    session: {
      id: params.session.id,
      current_step: params.session.current_step,
      expected_input_type: params.session.expected_input_type ?? null,
      failure_score: params.session.failure_score ?? 0,
      frustration_score: params.session.frustration_score ?? 0,
      safe_mode: Boolean(params.session.safe_mode),
    },
    memory: params.memory,
    currentUserText: params.normalizedText,
    failureSignals: allSignals,
    riskLevel: aiContext.risk_level,
    systemPrompt,
    userPrompt,
  });

  const validation = validateAiFallbackResponse(aiResponse, params.session);

  if (!validation.valid) {
    logger.info(
      {
        session_id: params.session.id,
        wa_message_id: params.message.waMessageId,
        reason: validation.reason,
        confidence: aiResponse.confidence,
        intent: aiResponse.intent ?? null,
        notes: aiResponse.notes ?? [],
      },
      "[conversation][ai.rejected]"
    );
    void persistFailureEvent({
      session: params.session,
      signal: "ai_rejected",
      waMessageId: params.message.waMessageId,
      userText: params.normalizedText,
      botText: params.ruleRecoveryText ?? null,
      metadata: {
        reason: validation.reason,
        confidence: aiResponse.confidence,
        intent: aiResponse.intent ?? null,
      },
    });
    return false;
  }

  logger.info(
    {
      session_id: params.session.id,
      wa_message_id: params.message.waMessageId,
      confidence: aiResponse.confidence,
      intent: aiResponse.intent ?? null,
      notes: aiResponse.notes ?? [],
      response_length: aiResponse.text.length,
      model: aiResponse.metadata?.model ?? null,
    },
    "[conversation][ai.response]"
  );

  await sendReply(params.session, aiResponse.text.trim());
  void persistFailureEvent({
    session: params.session,
    signal: "ai_used",
    waMessageId: params.message.waMessageId,
    userText: params.normalizedText,
    botText: aiResponse.text.trim(),
    metadata: {
      confidence: aiResponse.confidence,
      intent: aiResponse.intent ?? null,
      notes: aiResponse.notes ?? [],
      model: aiResponse.metadata?.model ?? null,
      durationMs: aiResponse.metadata?.durationMs ?? null,
    },
  });

  return true;
}

/**
 * Maps a conversation step to the set of draft fields that step's handler
 * writes when it processes a valid input. Used to prevent autofill from
 * overwriting a field that was just written by the step handler in the same
 * turn.
 */
function getFieldsWrittenByStep(step: ConversationStep): Set<string> {
  switch (step) {
    case "awaiting_details":
      return new Set(["suggested_description", "suggested_title"]);
    case "awaiting_category":
      return new Set(["categoria_custom", "suggested_title"]);
    case "awaiting_class":
      return new Set(["clase_id"]);
    case "awaiting_measures":
      return new Set(["measures_text"]);
    case "awaiting_price":
      return new Set(["price"]);
    case "awaiting_stock":
      return new Set(["stock"]);
    default:
      return new Set();
  }
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
    // Do NOT delete the draft on a failed transition — preserve the seller's
    // work. Only reset session state to a safe resting point. The draft remains
    // and the seller can continue after the recovery message.
    await updateSessionScore(session, ["invalid_transition"]);
    await evaluateSafeMode(session);
    await resetConversationHard(session);
    void persistFailureEvent({
      session,
      signal: "invalid_transition",
      waMessageId,
      metadata: { targetStep: currentStep, expectedInputType: expectedInputType ?? null },
    });
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
    addBotMessage(session.id, text);
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
    await updateSessionScore(session, ["silent_outbound_failure"]);
    await evaluateSafeMode(session);
    // Persist failure event for observability — fire and forget.
    void persistFailureEvent({
      session,
      signal: "silent_outbound_failure",
      botText: text,
      metadata: { error: error?.message ?? String(error) },
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
  clearMemory(session.id);
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

    let result: { productId: string; internalCode: string };
    try {
      result = await publishListingDraft(draft);
    } catch (publishErr: any) {
      if (publishErr instanceof SkuCollisionError) {
        await sendReply(
          session,
          `El código de inventario *${publishErr.sku}* ya está en uso en otro de tus productos. Edita el borrador con un código diferente antes de guardar.`
        );
        return "stop";
      }
      throw publishErr;
    }
    if (!(await transitionSessionSafely(session, "published", null, message.waMessageId))) {
      return "stop";
    }
    await sendReply(
      session,
      `✅ Producto creado con código *${result.internalCode}*.\n\nQuedó guardado como *inactivo*. Actívalo desde tu panel web para que aparezca en el catálogo.\n\nPara consultarlo aquí: *mis productos ${result.internalCode}*`
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
      addAction(session.id, "awaiting_image");
      await applySuccessfulStepDecay(session);
      await evaluateSafeMode(session);
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
      console.log(
        `[conversation][inbound.text] session=${session.id} wa_message_id=${textMessage.waMessageId} step=${session.current_step ?? "idle"} expected=${session.expected_input_type ?? "none"} text="${normalizedText}"`
      );
      addUserMessage(session.id, normalizedText);

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

      const safeModeStrictStep =
        session.safe_mode &&
        !isSafeModeGuidedCommand(normalizedText) &&
        canProcessStrictSafeModeStep(session, textMessage);

      if (
        session.safe_mode &&
        !safeModeStrictStep &&
        !isSafeModeGuidedCommand(normalizedText)
      ) {
        logger.info(
          {
            session_id: session.id,
            wa_message_id: textMessage.waMessageId,
            current_step: session.current_step,
            expected_input_type: session.expected_input_type,
            failure_score: session.failure_score ?? 0,
          },
          "[conversation][safe_mode.blocked]"
        );
        await sendReply(session, buildSafeModeGuidance());
        await markMessageProcessed(record, "processed");
        return;
      }

      if (safeModeStrictStep) {
        logger.info(
          {
            session_id: session.id,
            wa_message_id: textMessage.waMessageId,
            current_step: session.current_step,
            expected_input_type: session.expected_input_type,
          },
          "[conversation][safe_mode.strict_step]"
        );
      } else {
        if (isGlobalConversationCommand(textMessage.text ?? "")) {
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
          addAction(session.id, commandResult.commandKey ?? commandResult.action ?? "command");

          if (commandResult.action === "start_new_listing") {
            console.log(
              `[conversation][new_listing.start] session=${session.id} wa_message_id=${textMessage.waMessageId} from_step=${session.current_step ?? "idle"}`
            );
            if (!draft) {
              draft = await getOrCreateDraft(session);
            }
            await resetDraftForNewListing(draft, { waMessageId: textMessage.waMessageId });
            await draft.reload();
            await resetSessionForNewListing(session);
            console.log(
              `[conversation][new_listing.state] session=${session.id} draft=${draft.id} next_step=${session.current_step ?? "idle"} expected=${session.expected_input_type ?? "none"}`
            );
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

          const missing = getMissingFieldsForEdit(draft);
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

      // ── Failure Intelligence Layer ──────────────────────────────────────
      // Runs AFTER all command/edit-mode guards pass and BEFORE step handling.
      // Priority:
      //   1. FAQ match → controlled policy answer, return.
      //   2. Frustration detected → empathetic recovery, return.
      //   3. Async signals (repetition) → fire-and-forget event persistence.
      //
      // This block never runs for recognised commands or edit-mode inputs —
      // those paths already returned above.

      const faqMatch = session.safe_mode
        ? null
        : await matchFaqEntry(normalizedText, {
            session,
            waMessageId: textMessage.waMessageId,
            userText: normalizedText,
            metadata: { step: session.current_step },
          });
      if (faqMatch) {
        logger.info(
          {
            session_id: session.id,
            wa_message_id: textMessage.waMessageId,
            key: faqMatch.key,
            category: faqMatch.category,
            match_tier: faqMatch.matchTier,
          },
          "[conversation][faq.match]"
        );
        await sendReply(session, faqMatch.answer);
        await markMessageProcessed(record, "processed");
        return;
      }

      const syncDetection = detectSyncFailureSignals({
        session,
        normalizedText,
        messageType: textMessage.type,
      });

      if (syncDetection.signals.length > 0) {
        logger.info(
          {
            session_id: session.id,
            wa_message_id: textMessage.waMessageId,
            current_step: session.current_step,
            expected_input_type: session.expected_input_type,
            signals: syncDetection.signals,
          },
          "[conversation][failure]"
        );
        await updateSessionScore(session, syncDetection.signals);
        await evaluateSafeMode(session);
      }

      const memory = getMemorySnapshot(session.id);
      let ruleRecoveryText: string | undefined;

      if (syncDetection.intercepting.length > 0) {
        const recovery = buildAdaptiveRecovery(
          session,
          syncDetection.intercepting,
          memory
        );

        logger.info(
          {
            session_id: session.id,
            wa_message_id: textMessage.waMessageId,
            signals: syncDetection.intercepting,
            risk_level: getSessionRiskLevel(session.failure_score ?? 0),
            recovery_length: recovery.message.length,
          },
          "[conversation][recovery.triggered]"
        );

        await persistFailureEvents({
          session,
          signals: syncDetection.intercepting,
          waMessageId: textMessage.waMessageId,
          userText: normalizedText,
          botText: recovery.message,
          metadata: { step: session.current_step, expected: session.expected_input_type ?? null },
        });

        ruleRecoveryText = recovery.message;
      }

      // Non-intercepting sync signals (e.g. step_mismatch) — log only.
      if (syncDetection.signals.length > 0) {
        void persistFailureEvents({
          session,
          signals: syncDetection.signals,
          waMessageId: textMessage.waMessageId,
          userText: normalizedText,
          metadata: { step: session.current_step, expected: session.expected_input_type ?? null },
        });
      }

      // Fire-and-forget async detection (DB queries for repetition signals).
      void detectAsyncFailureSignals({
        session,
        normalizedText,
        waMessageId: textMessage.waMessageId,
      }).then((asyncSignals) => {
        if (asyncSignals.length > 0) {
          logger.info(
            {
              session_id: session.id,
              wa_message_id: textMessage.waMessageId,
              current_step: session.current_step,
              signals: asyncSignals,
            },
            "[conversation][failure]"
          );
          void updateSessionScore(session, asyncSignals).then(() =>
            evaluateSafeMode(session)
          );
          void persistFailureEvents({
            session,
            signals: asyncSignals,
            waMessageId: textMessage.waMessageId,
            userText: normalizedText,
            metadata: { step: session.current_step, async: true },
          });
        }
      }).catch(() => {});

      // ── End Failure Intelligence Layer ───────────────────────────────────

      if (
        await maybeSendAiFallback({
          session,
          draft,
          message: textMessage,
          normalizedText,
          memory,
          currentSignals:
            syncDetection.intercepting.length > 0
              ? syncDetection.intercepting
              : syncDetection.signals,
          ruleRecoveryText,
        })
      ) {
        await markMessageProcessed(record, "processed");
        return;
      }

      if (ruleRecoveryText) {
        await sendReply(session, ruleRecoveryText);
        await markMessageProcessed(record, "processed");
        return;
      }

      // Capture step before handleTextInput so we know which field it wrote.
      const stepBeforeTextInput = session.current_step;

      const textResult = await handleTextInput(session, draft, textMessage);
      if (textResult === "stop") {
        await markMessageProcessed(record, "processed");
        return;
      }

      addAction(session.id, stepBeforeTextInput);
      await applySuccessfulStepDecay(session);
      await evaluateSafeMode(session);

      const autoFill = session.safe_mode
        ? { updatedFields: [], draftPatch: {}, confidence: 0, sourceSignals: [] }
        : await autoFillDraftFromSignals(session, draft, textMessage);
      if (autoFill.updatedFields.length > 0) {
        // Filter out fields the step handler already wrote this turn to prevent
        // double-writes. e.g. if awaiting_price wrote `price`, autofill should
        // not overwrite it — but may still write other fields it found (stock, etc.)
        const stepWrittenFields =
          textResult === "continue" ? getFieldsWrittenByStep(stepBeforeTextInput) : new Set<string>();

        const filteredFields = autoFill.updatedFields.filter(
          (f) => !stepWrittenFields.has(f)
        );

        if (filteredFields.length < autoFill.updatedFields.length) {
          console.log(
            `[conversation][autofill.filtered] session=${session.id} removed=${autoFill.updatedFields
              .filter((f) => stepWrittenFields.has(f))
              .join(",")} kept=${filteredFields.join(",")}`
          );
        }

        if (filteredFields.length === 0) {
          // All autofill fields were already written by the step handler — skip.
        } else {
          const filteredPatch: Record<string, unknown> = {};
          for (const field of filteredFields) {
            filteredPatch[field] = (autoFill.draftPatch as Record<string, unknown>)[field];
          }

          const commandContext = getCommandContext(session);
          if (commandContext?.mode === "listing_edit") {
            const effectivePatch = await filterEffectiveEditPatch(
              draft,
              filteredPatch as any,
              filteredFields
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
              `[conversation][autofill] session=${session.id} draft=${draft.id} wa_message_id=${textMessage.waMessageId} updated=${filteredFields.join(",")} confidence=${autoFill.confidence} signals=${autoFill.sourceSignals.join(",")}`
            );
            await updateDraft(draft, filteredPatch as any, {
              waMessageId: textMessage.waMessageId,
            });
          }
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
        const missingForEdit = getMissingFieldsForEdit(draft);
        if (missingForEdit.length > 0) {
          await updateDraft(
            draft,
            { status: "collecting" },
            { waMessageId: message.waMessageId }
          );
          await setCommandContext(session, {
            ...commandContext,
            awaitingEditSaveConfirmation: false,
          });
          await promptNextMissingField(session, draft, missingForEdit[0], {
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
