import assert from "node:assert/strict";
import ConversationSession from "../src/models/ConversationSession.model";
import ListingDraft from "../src/models/ListingDraft.model";
import { sequelize } from "../src/config/db";
import {
  buildNeutralReadyMessage,
  transitionSessionSafely,
} from "../src/services/conversations/conversationOrchestrator.service";
import {
  clearInterruptibleState,
  resetConversationHard,
} from "../src/services/conversations/conversationSession.service";
import {
  deleteListingDraftBySession,
} from "../src/services/listing-drafts/listingDraft.service";
import {
  getResetCommandPattern,
  isGlobalConversationCommand,
} from "../src/services/conversations/conversationCommandMatcher.service";
import { routeConversationCommand } from "../src/services/conversations/conversationCommandRouter.service";
import * as whatsappOutboundService from "../src/services/integrations/whatsapp/whatsappOutbound.service";
import * as conversationMessageService from "../src/services/conversations/conversationMessage.service";
import * as sellerCatalogSummaryService from "../src/services/conversations/sellerCatalogSummary.service";
import * as sellerProfileSummaryService from "../src/services/conversations/sellerProfileSummary.service";

type MutableSession = InstanceType<typeof ConversationSession> & {
  update: (values: Record<string, unknown>, options?: unknown) => Promise<MutableSession>;
};

function buildSession(overrides?: Partial<MutableSession>): MutableSession {
  const session = ConversationSession.build({
    id: "session-regression-1",
    phone_e164: "+50255555555",
    channel: "whatsapp",
    linked_seller_user_id: 77,
    current_step: "awaiting_confirmation",
    expected_input_type: "text",
    pending_confirmation_json: { targetField: "category" },
    command_context_json: {
      mode: "listing_edit",
      selectedProductId: "prod-1",
      selectedProductName: "Bolsa tejida",
      pendingDeleteProductId: "prod-2",
      pendingDeleteProductName: "Corte azul",
    },
    status: "active",
    ...overrides,
  }) as MutableSession;

  session.update = async function update(values: Record<string, unknown>) {
    Object.assign(this, values);
    return this;
  };

  return session;
}

function buildDraft(id: string, sessionId: string) {
  const draft = ListingDraft.build({
    session_id: sessionId,
    seller_user_id: 77,
    images_json: [],
    suggested_title: "Bolsa tejida",
    suggested_description: "Hecha a mano",
    price: 250,
    stock: 2,
    measures_text: "40 x 30 cm",
    categoria_id: 2,
    categoria_custom: null,
    clase_id: 3,
    vision_suggestions_json: null,
    status: "collecting",
    published_product_id: null,
  } as any);

  (draft as any).id = id;
  return draft;
}

async function withSessionDbMocks<T>(
  lockedSession: MutableSession,
  fn: () => Promise<T>
): Promise<T> {
  const originalTransaction = sequelize.transaction.bind(sequelize);
  const originalFindByPk = ConversationSession.findByPk.bind(ConversationSession);

  (sequelize as any).transaction = async (callback: (transaction: any) => Promise<T>) =>
    callback({
      LOCK: { UPDATE: "UPDATE" },
    });

  (ConversationSession as any).findByPk = async () => lockedSession;

  try {
    return await fn();
  } finally {
    (sequelize as any).transaction = originalTransaction;
    (ConversationSession as any).findByPk = originalFindByPk;
  }
}

function withDraftDestroyMock() {
  const originalDestroy = ListingDraft.destroy.bind(ListingDraft);
  let deleted = 0;
  let lastWhere: Record<string, unknown> | null = null;

  (ListingDraft as any).destroy = async (options: { where: Record<string, unknown> }) => {
    deleted += 1;
    lastWhere = options.where;
    return 1;
  };

  return {
    get deleted() {
      return deleted;
    },
    get lastWhere() {
      return lastWhere;
    },
    restore() {
      (ListingDraft as any).destroy = originalDestroy;
    },
  };
}

function withOutboundCapture() {
  const originalSend = whatsappOutboundService.sendTextMessage;
  const originalSaveOutbound = conversationMessageService.saveOutboundTextMessage;
  let lastText: string | null = null;

  (whatsappOutboundService as any).sendTextMessage = async (_to: string, text: string) => {
    lastText = text;
    return {
      success: true,
      waMessageId: "wamid.test",
      raw: { ok: true },
    };
  };

  (conversationMessageService as any).saveOutboundTextMessage = async () => undefined;

  return {
    get lastText() {
      return lastText;
    },
    restore() {
      (whatsappOutboundService as any).sendTextMessage = originalSend;
      (conversationMessageService as any).saveOutboundTextMessage = originalSaveOutbound;
    },
  };
}

function withCommandServiceMocks() {
  const originalCatalog = sellerCatalogSummaryService.getSellerCatalogSummaryData;
  const originalProfile = sellerProfileSummaryService.buildSellerProfileSummary;

  (sellerCatalogSummaryService as any).getSellerCatalogSummaryData = async () => ({
    responseText: "🧵 Tus productos\n\n1. Bolsa tejida - Q250.00",
    items: [{ index: 1, productId: "prod-1", nombre: "Bolsa tejida", precio: 250, activo: true }],
  });

  (sellerProfileSummaryService as any).buildSellerProfileSummary = async () =>
    "👤 Tu perfil\n\n• Comercio: Tejidos Xela";

  return {
    restore() {
      (sellerCatalogSummaryService as any).getSellerCatalogSummaryData = originalCatalog;
      (sellerProfileSummaryService as any).buildSellerProfileSummary = originalProfile;
    },
  };
}

async function testResetFromAwaitingConfirmation() {
  const session = buildSession({
    current_step: "awaiting_confirmation",
    expected_input_type: "text",
  });
  const destroyMock = withDraftDestroyMock();

  try {
    await withSessionDbMocks(session, async () => {
      assert.equal(getResetCommandPattern("inicio"), "inicio");
      await deleteListingDraftBySession(session.id);
      await resetConversationHard(session);
    });

    assert.equal(destroyMock.deleted, 1);
    assert.deepEqual(destroyMock.lastWhere, { session_id: session.id });
    assert.equal(session.current_step, "awaiting_image");
    assert.equal(session.expected_input_type, null);
    assert.equal(session.pending_confirmation_json, null);
    assert.equal(session.command_context_json, null);
    assert.equal(
      buildNeutralReadyMessage(),
      ["Estoy listo para ayudarte.", "", "Puedes escribir:", "👉 nuevo", "👉 mis productos", "👉 perfil"].join("\n")
    );
  } finally {
    destroyMock.restore();
  }
}

async function testGlobalCommandFromAwaitingImage() {
  const session = buildSession({
    current_step: "awaiting_image",
    expected_input_type: "image",
  });
  const draft = buildDraft("draft-global-1", session.id);
  const destroyMock = withDraftDestroyMock();
  const commandMocks = withCommandServiceMocks();

  try {
    await withSessionDbMocks(session, async () => {
      assert.equal(isGlobalConversationCommand("mis productos"), true);
      await clearInterruptibleState(session);
    });

    const result = await routeConversationCommand({
      session,
      seller: { user_id: 77 } as any,
      message: {
        type: "text",
        text: "mis productos",
      } as any,
    });

    assert.equal(session.current_step, "awaiting_image");
    assert.equal(session.expected_input_type, null);
    assert.equal(session.pending_confirmation_json, null);
    assert.equal(destroyMock.deleted, 0);
    assert.equal(draft.status, "collecting");
    assert.equal(result.handled, true);
    assert.match(result.responseText ?? "", /Tus productos/);
  } finally {
    destroyMock.restore();
    commandMocks.restore();
  }
}

async function testInvalidTransitionForced() {
  const session = buildSession({
    current_step: "awaiting_confirmation",
    expected_input_type: "text",
  });
  const destroyMock = withDraftDestroyMock();
  const outboundCapture = withOutboundCapture();

  try {
    await withSessionDbMocks(session, async () => {
      const ok = await transitionSessionSafely(
        session,
        "awaiting_image",
        "image",
        "wa-invalid-transition"
      );

      assert.equal(ok, false);
    });

    assert.equal(destroyMock.deleted, 1);
    assert.equal(session.current_step, "awaiting_image");
    assert.equal(session.expected_input_type, null);
    assert.equal(session.pending_confirmation_json, null);
    assert.equal(session.command_context_json, null);
    assert.equal(outboundCapture.lastText, buildNeutralReadyMessage());
  } finally {
    destroyMock.restore();
    outboundCapture.restore();
  }
}

async function testResetDoesNotReanimateOldDraft() {
  const session = buildSession();
  const destroyMock = withDraftDestroyMock();
  const commandMocks = withCommandServiceMocks();

  try {
    await withSessionDbMocks(session, async () => {
      await deleteListingDraftBySession(session.id);
      await resetConversationHard(session);
    });

    const postResetCommand = await routeConversationCommand({
      session,
      seller: { user_id: 77 } as any,
      message: { type: "text", text: "perfil" } as any,
    });

    assert.equal(destroyMock.deleted, 1);
    assert.equal(session.expected_input_type, null);
    assert.equal(session.pending_confirmation_json, null);
    assert.equal(postResetCommand.handled, true);
    assert.match(postResetCommand.responseText ?? "", /Tu perfil/);
  } finally {
    destroyMock.restore();
    commandMocks.restore();
  }
}

async function testPostResetGlobalCommandsStillWork() {
  const session = buildSession();
  const commandMocks = withCommandServiceMocks();

  try {
    await withSessionDbMocks(session, async () => {
      await resetConversationHard(session);
    });

    const seller = { user_id: 77 } as any;

    const profile = await routeConversationCommand({
      session,
      seller,
      message: { type: "text", text: "perfil" } as any,
    });
    const products = await routeConversationCommand({
      session,
      seller,
      message: { type: "text", text: "mis productos" } as any,
    });
    const nuevo = await routeConversationCommand({
      session,
      seller,
      message: { type: "text", text: "nuevo" } as any,
    });

    assert.equal(profile.handled, true);
    assert.match(profile.responseText ?? "", /Tu perfil/);

    assert.equal(products.handled, true);
    assert.match(products.responseText ?? "", /Tus productos/);

    assert.equal(nuevo.handled, true);
    assert.match(nuevo.responseText ?? "", /Nueva publicación|Nueva publicacion/);
  } finally {
    commandMocks.restore();
  }
}

async function run() {
  await testResetFromAwaitingConfirmation();
  await testGlobalCommandFromAwaitingImage();
  await testInvalidTransitionForced();
  await testResetDoesNotReanimateOldDraft();
  await testPostResetGlobalCommandsStillWork();
  console.log("[conversation-orchestrator-regressions] ok");
}

run();
