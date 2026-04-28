import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db";

// GTQ centavos: 100 = Q1.00. Conversion: 1 USD = 7.75 GTQ
const GTQ_PER_USD = 7.75;

export function usdCentsToGtqCents(usdCents: number): number {
  return Math.ceil(usdCents * GTQ_PER_USD);
}

export async function getBalance(userId: number): Promise<number> {
  const [row] = await sequelize.query(
    `SELECT video_credits_gtq_cents FROM vendedor_perfil WHERE user_id = :userId`,
    { replacements: { userId }, type: QueryTypes.SELECT }
  ) as any[];
  return row?.video_credits_gtq_cents ?? 0;
}

// Returns remaining balance, or null if insufficient funds.
export async function deductCredits(userId: number, amountGtqCents: number): Promise<number | null> {
  if (amountGtqCents <= 0) {
    return getBalance(userId);
  }
  const [row] = await sequelize.query(
    `UPDATE vendedor_perfil
     SET video_credits_gtq_cents = video_credits_gtq_cents - :amount
     WHERE user_id = :userId AND video_credits_gtq_cents >= :amount
     RETURNING video_credits_gtq_cents`,
    { replacements: { userId, amount: amountGtqCents }, type: QueryTypes.SELECT }
  ) as any[];
  return row ? (row.video_credits_gtq_cents as number) : null;
}

export async function refundCredits(userId: number, amountGtqCents: number): Promise<number> {
  if (amountGtqCents <= 0) return getBalance(userId);
  const [row] = await sequelize.query(
    `UPDATE vendedor_perfil
     SET video_credits_gtq_cents = video_credits_gtq_cents + :amount
     WHERE user_id = :userId
     RETURNING video_credits_gtq_cents`,
    { replacements: { userId, amount: amountGtqCents }, type: QueryTypes.SELECT }
  ) as any[];
  return row?.video_credits_gtq_cents ?? 0;
}

export async function addCredits(userId: number, amountGtqCents: number): Promise<number> {
  if (amountGtqCents <= 0) return getBalance(userId);
  const [row] = await sequelize.query(
    `UPDATE vendedor_perfil
     SET video_credits_gtq_cents = video_credits_gtq_cents + :amount
     WHERE user_id = :userId
     RETURNING video_credits_gtq_cents`,
    { replacements: { userId, amount: amountGtqCents }, type: QueryTypes.SELECT }
  ) as any[];
  return row?.video_credits_gtq_cents ?? 0;
}
