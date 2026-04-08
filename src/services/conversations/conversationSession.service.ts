import { Transaction } from "sequelize";
import { sequelize } from "../../config/db";
import ConversationSession from "../../models/ConversationSession.model";
import {
  canTransition,
  type ConversationStep,
  type ExpectedInputType,
} from "./conversationState";
import type { PendingConfirmation } from "./conversationConfirmation.service";

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
