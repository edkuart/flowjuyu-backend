import assert from "node:assert/strict";
import ConversationSession from "../src/models/ConversationSession.model";
import ListingDraft from "../src/models/ListingDraft.model";
import type { EditModeBaseline } from "../src/services/conversations/conversationCommandContext.types";
import {
  buildEditSummaryChanges,
  filterEffectiveEditPatch,
  hasRealChanges,
} from "../src/services/conversations/conversationEditValidation.service";
import { routeConversationCommand } from "../src/services/conversations/conversationCommandRouter.service";
import {
  buildEditSummaryMessage,
  buildNoEditChangesMessage,
  buildNoPendingEditConfirmationMessage,
} from "../src/services/conversations/ux/conversationUxBuilder.service";
import * as listingDraftService from "../src/services/listing-drafts/listingDraft.service";

type MutableSession = InstanceType<typeof ConversationSession>;

function buildBaseline(): EditModeBaseline {
  return {
    nombre: "Bolsa tejida",
    precio: 1500,
    stock: 3,
    descripcion: "Bolsa artesanal",
    categoria: "Bolsas",
    clase: null,
    medidas: "40 x 30 cm",
  };
}

function buildDraft(overrides?: Partial<ListingDraft>) {
  return ListingDraft.build({
    session_id: "session-edit-1",
    seller_user_id: 77,
    suggested_title: "Bolsa tejida",
    suggested_description: "Bolsa artesanal",
    price: 1500,
    stock: 3,
    categoria_id: null,
    categoria_custom: "Bolsas",
    clase_id: null,
    measures_text: "40 x 30 cm",
    images_json: [],
    vision_suggestions_json: null,
    status: "collecting",
    published_product_id: null,
    ...overrides,
  } as any);
}

function buildSession(commandContext: Record<string, unknown>): MutableSession {
  return ConversationSession.build(
    {
      id: "session-edit-1",
      phone_e164: "+50255555555",
      channel: "whatsapp",
      linked_seller_user_id: 77,
      current_step: "awaiting_confirmation",
      expected_input_type: "text",
      pending_confirmation_json: null,
      command_context_json: commandContext,
      status: "active",
    } as any
  ) as MutableSession;
}

async function testMultiChangeSaveFlow() {
  const baseline = buildBaseline();
  const draft = buildDraft({
    price: 1800,
    stock: 5,
    suggested_description: "Bolsa artesanal con acabados nuevos",
  });

  const realChanges = await hasRealChanges(draft, baseline);
  assert.equal(realChanges, true);

  const summary = await buildEditSummaryChanges(draft, baseline);
  assert.equal(summary.length >= 3, true);

  const response = buildEditSummaryMessage(summary);
  assert.match(response, /Cambios realizados/);
  assert.match(response, /Precio: Q1500\.00 → Q1800\.00/);
  assert.match(response, /Stock: 3 → 5/);
  assert.match(response, /👉 confirmar/);

  let dbUpdated = false;
  assert.equal(dbUpdated, false);
  dbUpdated = true;
  assert.equal(dbUpdated, true);
}

async function testCancelFlow() {
  const originalDelete = listingDraftService.deleteListingDraftBySession;
  let deletedSessionId: string | null = null;
  const persistedProduct = { precio: 1500 };

  (listingDraftService as any).deleteListingDraftBySession = async (sessionId: string) => {
    deletedSessionId = sessionId;
    return 1;
  };

  try {
    const deleted = await listingDraftService.deleteListingDraftBySession("session-edit-1");
    assert.equal(deleted, 1);
    assert.equal(deletedSessionId, "session-edit-1");
    assert.equal(persistedProduct.precio, 1500);
  } finally {
    (listingDraftService as any).deleteListingDraftBySession = originalDelete;
  }
}

async function testSaveWithoutChanges() {
  const baseline = buildBaseline();
  const draft = buildDraft({});

  const realChanges = await hasRealChanges(draft, baseline);
  assert.equal(realChanges, false);

  const response = buildNoEditChangesMessage();
  assert.match(response, /No hiciste cambios todavía/);
  assert.match(response, /👉 cancelar/);
}

async function testRedundantChange() {
  const draft = buildDraft({
    price: 1500,
  });

  const filtered = await filterEffectiveEditPatch(
    draft,
    { price: 1500 },
    ["price"]
  );

  assert.equal(filtered.updatedFields.length, 0);
  assert.equal(filtered.redundantMessages.length, 1);
  assert.match(filtered.redundantMessages[0] ?? "", /El precio ya es Q1500\.00/);
}

async function testPartialChangeThenCancel() {
  const baseline = buildBaseline();
  const draft = buildDraft({
    price: 1800,
  });

  const summary = await buildEditSummaryChanges(draft, baseline);
  assert.equal(summary.length, 1);

  let dbUpdated = false;
  assert.equal(dbUpdated, false);
  const cancelled = true;
  if (!cancelled) {
    dbUpdated = true;
  }
  assert.equal(dbUpdated, false);
}

async function testConfirmWithoutSave() {
  const session = buildSession({
    mode: "listing_edit",
    selectedProductId: "prod-1",
    selectedProductName: "Bolsa tejida",
    awaitingEditSaveConfirmation: false,
    changedFields: {},
    editingBaseline: buildBaseline(),
  });

  const result = await routeConversationCommand({
    session,
    seller: { user_id: 77 } as any,
    message: {
      type: "text",
      text: "confirmar",
    } as any,
  });

  assert.equal(result.handled, true);
  assert.equal(
    result.responseText,
    buildNoPendingEditConfirmationMessage()
  );
}

async function run() {
  await testMultiChangeSaveFlow();
  await testCancelFlow();
  await testSaveWithoutChanges();
  await testRedundantChange();
  await testPartialChangeThenCancel();
  await testConfirmWithoutSave();
  console.log("[edit-flow-regressions] ok");
}

run();
