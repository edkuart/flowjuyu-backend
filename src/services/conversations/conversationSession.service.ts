import { Transaction } from "sequelize";
import { sequelize } from "../../config/db";
import ConversationSession from "../../models/ConversationSession.model";
import {
  canTransition,
  type ConversationStep,
  type ExpectedInputType,
} from "./conversationState";
import type { PendingConfirmation } from "./conversationConfirmation.service";
import type { ConversationCommandContext } from "./conversationCommandContext.types";

export async function findOrCreateSession(phoneE164: string) {
  const [session] = await ConversationSession.findOrCreate({
    where: {
      channel: "whatsapp",
      phone_e164: phoneE164,
    },
    defaults: {
      channel: "whatsapp",
      phone_e164: phoneE164,
      current_step: "awaiting_image",
      expected_input_type: "image",
      status: "active",
    },
  });

  return session;
}

export async function getSessionForUpdate(
  sessionId: string,
  transaction: Transaction
): Promise<ConversationSession> {
  const session = await ConversationSession.findByPk(sessionId, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!session) {
    throw new Error(`Conversation session ${sessionId} was not found`);
  }

  return session;
}

export async function transitionSession(
  session: ConversationSession,
  currentStep: ConversationStep,
  expectedInputType: ExpectedInputType | null
): Promise<ConversationSession> {
  await sequelize.transaction(async (transaction) => {
    const lockedSession = await getSessionForUpdate(session.id, transaction);

    if (!canTransition(lockedSession.current_step, currentStep)) {
      throw new Error(
        `Invalid session step transition: ${lockedSession.current_step} -> ${currentStep}`
      );
    }

    console.log(
      `[conversation][step] session=${lockedSession.id} ${lockedSession.current_step} -> ${currentStep} expected=${expectedInputType ?? "null"}`
    );

    await lockedSession.update(
      {
        current_step: currentStep,
        expected_input_type: expectedInputType,
      },
      { transaction }
    );

    session.current_step = lockedSession.current_step;
    session.expected_input_type = lockedSession.expected_input_type;
  });

  return session;
}

export async function updateLastActivity(
  session: ConversationSession
): Promise<ConversationSession> {
  await session.update({ last_activity_at: new Date() });
  return session;
}

export async function bindSellerToSession(
  session: ConversationSession,
  sellerUserId: number
): Promise<ConversationSession> {
  if (session.linked_seller_user_id === sellerUserId) return session;
  await session.update({ linked_seller_user_id: sellerUserId });
  return session;
}

export async function setPendingConfirmation(
  session: ConversationSession,
  pending: PendingConfirmation | null
): Promise<ConversationSession> {
  await sequelize.transaction(async (transaction) => {
    const lockedSession = await getSessionForUpdate(session.id, transaction);
    await lockedSession.update(
      {
        pending_confirmation_json: pending,
      },
      { transaction }
    );

    session.pending_confirmation_json = lockedSession.pending_confirmation_json;
  });

  return session;
}

export async function resetSessionForNewListing(
  session: ConversationSession
): Promise<ConversationSession> {
  await sequelize.transaction(async (transaction) => {
    const lockedSession = await getSessionForUpdate(session.id, transaction);
    await lockedSession.update(
      {
        current_step: "awaiting_image",
        expected_input_type: "image",
        pending_confirmation_json: null,
        command_context_json: null,
        status: "active",
      },
      { transaction }
    );

    session.current_step = lockedSession.current_step;
    session.expected_input_type = lockedSession.expected_input_type;
    session.pending_confirmation_json = lockedSession.pending_confirmation_json;
    session.command_context_json = lockedSession.command_context_json;
    session.status = lockedSession.status;
  });

  return session;
}

export async function resetConversationSession(
  session: ConversationSession
): Promise<ConversationSession> {
  return resetSessionForNewListing(session);
}

export async function clearInterruptibleState(
  session: ConversationSession
): Promise<ConversationSession> {
  await sequelize.transaction(async (transaction) => {
    const lockedSession = await getSessionForUpdate(session.id, transaction);
    await lockedSession.update(
      {
        expected_input_type: null,
        pending_confirmation_json: null,
      },
      { transaction }
    );

    session.expected_input_type = lockedSession.expected_input_type;
    session.pending_confirmation_json = lockedSession.pending_confirmation_json;
  });

  return session;
}

export async function resetConversationHard(
  session: ConversationSession
): Promise<ConversationSession> {
  await sequelize.transaction(async (transaction) => {
    const lockedSession = await getSessionForUpdate(session.id, transaction);
    await lockedSession.update(
      {
        // Keep a valid persisted step while bypassing the state machine completely.
        current_step: "awaiting_image",
        expected_input_type: null,
        pending_confirmation_json: null,
        command_context_json: null,
        status: "active",
      },
      { transaction }
    );

    session.current_step = lockedSession.current_step;
    session.expected_input_type = lockedSession.expected_input_type;
    session.pending_confirmation_json = lockedSession.pending_confirmation_json;
    session.command_context_json = lockedSession.command_context_json;
    session.status = lockedSession.status;
  });

  return session;
}

export function getCommandContext(
  session: ConversationSession
): ConversationCommandContext | null {
  const value = session.command_context_json;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as ConversationCommandContext;
}

export async function setCommandContext(
  session: ConversationSession,
  commandContext: ConversationCommandContext | null
): Promise<ConversationSession> {
  await sequelize.transaction(async (transaction) => {
    const lockedSession = await getSessionForUpdate(session.id, transaction);
    const existingContext =
      lockedSession.command_context_json &&
      typeof lockedSession.command_context_json === "object" &&
      !Array.isArray(lockedSession.command_context_json)
        ? (lockedSession.command_context_json as ConversationCommandContext)
        : null;
    const nowIso = new Date().toISOString();
    const normalizedContext = commandContext
      ? {
          ...commandContext,
          context_created_at:
            commandContext.context_created_at ??
            existingContext?.context_created_at ??
            nowIso,
          last_interaction_at:
            commandContext.last_interaction_at ??
            nowIso,
        }
      : null;

    await lockedSession.update(
      {
        command_context_json: normalizedContext,
      },
      { transaction }
    );

    session.command_context_json = lockedSession.command_context_json;
  });

  return session;
}
