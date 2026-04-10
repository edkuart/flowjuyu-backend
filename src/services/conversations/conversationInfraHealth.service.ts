import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db";
import { logger } from "../../config/logger";
import {
  disableFailurePersistence,
  resetFailurePersistenceGuard,
} from "./conversationFailureEvent.service";

export type ConversationInfraHealthStatus = {
  failureEventsTableExists: boolean;
  checkedAt: Date;
  error?: string;
};

let lastStatus: ConversationInfraHealthStatus | null = null;

export function getConversationInfraHealthStatus(): ConversationInfraHealthStatus | null {
  return lastStatus;
}

export async function checkConversationFailureEventsTable(): Promise<boolean> {
  type Row = { exists: boolean };

  const [row] = await sequelize.query<Row>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_name = 'conversation_failure_events'
     ) AS "exists"`,
    { type: QueryTypes.SELECT }
  );

  return Boolean(row?.exists);
}

export async function verifyFailureIntelligenceInfra(): Promise<ConversationInfraHealthStatus> {
  try {
    const exists = await checkConversationFailureEventsTable();
    lastStatus = {
      failureEventsTableExists: exists,
      checkedAt: new Date(),
    };

    if (exists) {
      resetFailurePersistenceGuard();
      logger.info(
        { table: "conversation_failure_events" },
        "[conversation][infra.check.ok]"
      );
    } else {
      disableFailurePersistence("conversation_failure_events_missing_at_boot");
      logger.error(
        { table: "conversation_failure_events" },
        "[conversation][infra.check.missing]"
      );
    }

    return lastStatus;
  } catch (error: any) {
    lastStatus = {
      failureEventsTableExists: false,
      checkedAt: new Date(),
      error: error?.message ?? String(error),
    };

    logger.error(
      { error: lastStatus.error },
      "[conversation][infra.check.missing]"
    );

    return lastStatus;
  }
}
