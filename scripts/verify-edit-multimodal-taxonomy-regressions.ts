import assert from "node:assert/strict";
import ConversationSession from "../src/models/ConversationSession.model";
import ListingDraft from "../src/models/ListingDraft.model";
import type { NormalizedInboundMessage } from "../src/services/integrations/whatsapp/whatsapp.types";
import { autoFillDraftFromSignals } from "../src/services/conversations/conversationAutoFill.service";
import {
  buildEditSummaryChanges,
  filterEffectiveEditPatch,
  hasRealChanges,
} from "../src/services/conversations/conversationEditValidation.service";
import type { EditModeBaseline } from "../src/services/conversations/conversationCommandContext.types";
import * as productCatalogService from "../src/services/listing-drafts/productCatalog.service";

type MutableSession = InstanceType<typeof ConversationSession>;

function buildSession(currentStep: string): MutableSession {
  return ConversationSession.build(
    {
      id: "session-edit-audio-1",
      phone_e164: "+50255555555",
      channel: "whatsapp",
      linked_seller_user_id: 77,
      current_step: currentStep,
      expected_input_type: "text",
      pending_confirmation_json: null,
      command_context_json: {
        mode: "listing_edit",
        selectedProductId: "prod-1",
        selectedProductName: "Bolsa tejida",
      },
      status: "active",
    } as any
  ) as MutableSession;
}

function buildDraft(overrides?: Partial<ListingDraft>) {
  return ListingDraft.build({
    session_id: "session-edit-audio-1",
    seller_user_id: 77,
    suggested_title: "Bolsa tejida",
    suggested_description: "Bolsa artesanal",
    price: 1200,
    stock: 2,
    categoria_id: 2,
    categoria_custom: null,
    clase_id: 3,
    measures_text: "40 x 30 cm",
    images_json: [],
    vision_suggestions_json: null,
    status: "collecting",
    published_product_id: null,
    ...overrides,
  } as any);
}

function buildBaseline(): EditModeBaseline {
  return {
    nombre: "Bolsa tejida",
    precio: 1200,
    stock: 2,
    descripcion: "Bolsa artesanal",
    categoria: "Bolsas",
    clase: "Accesorios",
    medidas: "40 x 30 cm",
  };
}

function buildMessage(
  type: "text" | "audio",
  text: string
): NormalizedInboundMessage {
  return {
    channel: "whatsapp",
    phone: "+50255555555",
    waMessageId: `${type}-msg-1`,
    type,
    text,
    rawPayload: {},
  } as NormalizedInboundMessage;
}

async function testAudioEditUpdatesAccumulate() {
  const session = buildSession("awaiting_confirmation");
  const draft = buildDraft();

  const result = await autoFillDraftFromSignals(
    session,
    draft,
    buildMessage("audio", "cambia el precio a Q1500 y tengo 5 unidades")
  );

  assert.equal(result.sourceSignals.includes("message:audio"), true);
  assert.equal(result.updatedFields.includes("price"), true);
  assert.equal(result.updatedFields.includes("stock"), true);
  assert.equal(result.draftPatch.price, 1500);
  assert.equal(result.draftPatch.stock, 5);
}

async function testAudioRedundantChangeDoesNotCount() {
  const draft = buildDraft({
    price: 1500,
    stock: 5,
  });

  const filtered = await filterEffectiveEditPatch(
    draft,
    { price: 1500, stock: 5 },
    ["price", "stock"]
  );

  assert.equal(filtered.updatedFields.length, 0);
  assert.equal(filtered.redundantMessages.length, 2);
  assert.match(filtered.redundantMessages[0] ?? "", /precio ya es/i);
}

async function testCustomCategoryWinsWhenNoCatalogMatch() {
  const originalResolveCategory = productCatalogService.resolveProductCategoryFromText;

  (productCatalogService as any).resolveProductCategoryFromText = async () => null;

  try {
    const session = buildSession("awaiting_category");
    const draft = buildDraft({
      categoria_id: null,
      categoria_custom: null,
    });

    const result = await autoFillDraftFromSignals(
      session,
      draft,
      buildMessage("text", "Cestas ceremoniales")
    );

    assert.equal(result.updatedFields.includes("categoria_custom"), true);
    assert.equal(result.draftPatch.categoria_custom, "Cestas ceremoniales");
    assert.equal(result.draftPatch.categoria_id, undefined);
  } finally {
    (productCatalogService as any).resolveProductCategoryFromText = originalResolveCategory;
  }
}

async function testCatalogClassStillResolvesCleanly() {
  const originalResolveClass = productCatalogService.resolveProductClassFromText;

  (productCatalogService as any).resolveProductClassFromText = async (text: string) => {
    if (text.toLowerCase().includes("accesorios")) {
      return { id: 3, nombre: "Accesorios" };
    }
    return null;
  };

  try {
    const session = buildSession("awaiting_confirmation");
    const draft = buildDraft({
      clase_id: null,
    });

    const result = await autoFillDraftFromSignals(
      session,
      draft,
      buildMessage("text", "cambia la clase a accesorios")
    );

    assert.equal(result.updatedFields.includes("clase_id"), true);
    assert.equal(result.draftPatch.clase_id, 3);
  } finally {
    (productCatalogService as any).resolveProductClassFromText = originalResolveClass;
  }
}

async function testCustomCategoryShowsRealDiff() {
  const baseline = buildBaseline();
  const draft = buildDraft({
    categoria_id: null,
    categoria_custom: "Cestas ceremoniales",
  });

  const changed = await hasRealChanges(draft, baseline);
  const summary = await buildEditSummaryChanges(draft, baseline);

  assert.equal(changed, true);
  assert.equal(summary.some((item) => item.field === "Categoría"), true);
}

async function run() {
  await testAudioEditUpdatesAccumulate();
  await testAudioRedundantChangeDoesNotCount();
  await testCustomCategoryWinsWhenNoCatalogMatch();
  await testCatalogClassStillResolvesCleanly();
  await testCustomCategoryShowsRealDiff();
  console.log("[edit-multimodal-taxonomy-regressions] ok");
}

run();
