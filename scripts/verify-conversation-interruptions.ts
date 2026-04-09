import assert from "node:assert/strict";
import ConversationSession from "../src/models/ConversationSession.model";
import ListingDraft from "../src/models/ListingDraft.model";
import { sequelize } from "../src/config/db";
import {
  clearInterruptibleState,
  resetConversationHard,
} from "../src/services/conversations/conversationSession.service";
import {
  getResetCommandPattern,
  isGlobalConversationCommand,
  normalizeConversationCommandText,
} from "../src/services/conversations/conversationCommandMatcher.service";
import { deleteListingDraftBySession } from "../src/services/listing-drafts/listingDraft.service";

type MutableSession = InstanceType<typeof ConversationSession> & {
  update: (values: Record<string, unknown>) => Promise<MutableSession>;
};

function buildSession(overrides?: Partial<MutableSession>): MutableSession {
  const session = ConversationSession.build({
    id: "session-test-1",
    phone_e164: "+50255555555",
    channel: "whatsapp",
    linked_seller_user_id: 10,
    current_step: "awaiting_confirmation",
    expected_input_type: "text",
    pending_confirmation_json: { targetField: "category" },
    command_context_json: {
      mode: "listing_edit",
      selectedProductId: "prod-1",
      pendingDeleteProductId: "prod-2",
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

async function withSessionDbMocks<T>(fn: () => Promise<T>): Promise<T> {
  const originalTransaction = sequelize.transaction.bind(sequelize);
  const originalFindByPk = ConversationSession.findByPk.bind(ConversationSession);

  const lockedSession = buildSession();

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

async function testClearInterruptibleState() {
  await withSessionDbMocks(async () => {
    const session = buildSession();
    await clearInterruptibleState(session);

    assert.equal(session.current_step, "awaiting_confirmation");
    assert.equal(session.expected_input_type, null);
    assert.equal(session.pending_confirmation_json, null);
    assert.deepEqual(session.command_context_json, {
      mode: "listing_edit",
      selectedProductId: "prod-1",
      pendingDeleteProductId: "prod-2",
    });
  });
}

async function testResetConversationHard() {
  await withSessionDbMocks(async () => {
    const session = buildSession();
    await resetConversationHard(session);

    assert.equal(session.current_step, "awaiting_image");
    assert.equal(session.expected_input_type, null);
    assert.equal(session.pending_confirmation_json, null);
    assert.equal(session.command_context_json, null);
    assert.equal(session.status, "active");
  });
}

async function testDeleteListingDraftBySession() {
  const originalDestroy = ListingDraft.destroy.bind(ListingDraft);
  let destroyWhere: Record<string, unknown> | null = null;

  (ListingDraft as any).destroy = async (options: { where: Record<string, unknown> }) => {
    destroyWhere = options.where;
    return 1;
  };

  try {
    const deleted = await deleteListingDraftBySession("session-test-1");
    assert.equal(deleted, 1);
    assert.deepEqual(destroyWhere, { session_id: "session-test-1" });
  } finally {
    (ListingDraft as any).destroy = originalDestroy;
  }
}

function testCommandMatching() {
  assert.equal(normalizeConversationCommandText("  Empecemos   desde el principio "), "empecemos desde el principio");

  assert.equal(getResetCommandPattern("inicio"), "inicio");
  assert.equal(getResetCommandPattern("empecemos desde el principio"), "empecemos desde el principio");
  assert.equal(getResetCommandPattern("reiniciar"), "reiniciar");

  assert.equal(isGlobalConversationCommand("quiero ver mis productos"), true);
  assert.equal(isGlobalConversationCommand("cuantos productos tengo"), true);
  assert.equal(isGlobalConversationCommand("ver perfil"), true);
  assert.equal(isGlobalConversationCommand("ir al menu"), true);
  assert.equal(isGlobalConversationCommand("hola, como estas"), false);
}

async function run() {
  testCommandMatching();
  await testClearInterruptibleState();
  await testResetConversationHard();
  await testDeleteListingDraftBySession();
  console.log("[conversation-interruptions-regression] ok");
}

run();
