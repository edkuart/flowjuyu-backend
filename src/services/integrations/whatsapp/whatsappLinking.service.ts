import crypto from "crypto";
import { Op, Transaction } from "sequelize";
import { sequelize } from "../../../config/db";
import WhatsappLinkedIdentity from "../../../models/WhatsappLinkedIdentity.model";
import WhatsappLinkingToken from "../../../models/WhatsappLinkingToken.model";
import { User } from "../../../models/user.model";
import { VendedorPerfil } from "../../../models/VendedorPerfil";
import { logAuditEvent } from "../../audit.service";
import { trackEvent } from "../../analytics/analytics.service";
import type {
  ConsumeSellerWhatsappLinkingTokenResult,
  GenerateSellerWhatsappLinkingTokenResult,
  SellerWhatsappLinkStatus,
} from "./whatsappLinking.types";

const CODE_PREFIX = "FJY";
const CODE_LENGTH = 6;
const TOKEN_TTL_MINUTES = Math.max(
  1,
  Number(process.env.WHATSAPP_LINK_CODE_TTL_MINUTES || 10)
);
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function digitsOnly(input: string): string {
  return String(input || "").replace(/\D/g, "");
}

export function normalizePhoneE164(input: string): string {
  const digits = digitsOnly(input);
  return digits ? `+${digits}` : "";
}

function buildRawCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = "";

  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += TOKEN_ALPHABET[bytes[index] % TOKEN_ALPHABET.length];
  }

  return `${CODE_PREFIX}-${code}`;
}

function maskTokenHint(code: string): string {
  const suffix = code.slice(-2);
  return `${CODE_PREFIX}-****${suffix}`;
}

function normalizeTokenCode(input: string): string {
  const normalized = String(input || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (normalized.startsWith(CODE_PREFIX)) {
    return normalized;
  }

  return "";
}

function hashTokenValue(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function extractWhatsappLinkingCode(text: string | undefined): string | null {
  const raw = String(text || "").trim().toUpperCase();
  const match = raw.match(/\bFJY[-\s]?([A-HJ-NP-Z2-9]{6})\b/);
  if (!match?.[1]) {
    return null;
  }

  return `${CODE_PREFIX}-${match[1]}`;
}

async function getActiveLinkedIdentityForSeller(
  sellerUserId: number,
  transaction?: Transaction
): Promise<WhatsappLinkedIdentity | null> {
  return WhatsappLinkedIdentity.findOne({
    where: {
      seller_user_id: sellerUserId,
      channel: "whatsapp",
      status: "active",
    },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
}

async function getActiveLinkedIdentityForPhone(
  phoneE164: string,
  transaction?: Transaction
): Promise<WhatsappLinkedIdentity | null> {
  return WhatsappLinkedIdentity.findOne({
    where: {
      phone_e164: phoneE164,
      channel: "whatsapp",
      status: "active",
    },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
}

export async function getSellerWhatsappLinkStatus(
  sellerUserId: number
): Promise<SellerWhatsappLinkStatus> {
  const [activeLink, activeToken] = await Promise.all([
    getActiveLinkedIdentityForSeller(sellerUserId),
    WhatsappLinkingToken.findOne({
      where: {
        seller_user_id: sellerUserId,
        used_at: null,
        invalidated_at: null,
        expires_at: { [Op.gt]: new Date() },
      },
      order: [["created_at", "DESC"]],
    }),
  ]);

  return {
    linkedPhone: activeLink?.phone_e164 ?? null,
    linkedAt: activeLink?.linked_at?.toISOString() ?? null,
    activeToken: activeToken
      ? {
          tokenHint: activeToken.token_hint,
          expiresAt: activeToken.expires_at.toISOString(),
        }
      : null,
  };
}

export async function generateSellerWhatsappLinkingToken(
  sellerUserId: number
): Promise<GenerateSellerWhatsappLinkingTokenResult> {
  const code = buildRawCode();
  const normalizedCode = normalizeTokenCode(code);
  const tokenHint = maskTokenHint(code);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

  await sequelize.transaction(async (transaction) => {
    await WhatsappLinkingToken.update(
      {
        invalidated_at: new Date(),
      },
      {
        where: {
          seller_user_id: sellerUserId,
          used_at: null,
          invalidated_at: null,
          expires_at: { [Op.gt]: new Date() },
        },
        transaction,
      }
    );

    await WhatsappLinkingToken.create(
      {
        seller_user_id: sellerUserId,
        token_hash: hashTokenValue(normalizedCode),
        token_hint: tokenHint,
        expires_at: expiresAt,
      },
      { transaction }
    );
  });

  return {
    code,
    tokenHint,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function consumeSellerWhatsappLinkingToken(
  rawCode: string,
  phoneE164: string
): Promise<ConsumeSellerWhatsappLinkingTokenResult> {
  const normalizedCode = normalizeTokenCode(rawCode);
  const normalizedPhone = normalizePhoneE164(phoneE164);

  if (!normalizedCode || !normalizedPhone) {
    return { ok: false, reason: "invalid_token" };
  }

  const result = await sequelize.transaction<
    ConsumeSellerWhatsappLinkingTokenResult
  >(async (transaction) => {
    const token = await WhatsappLinkingToken.findOne({
      where: {
        token_hash: hashTokenValue(normalizedCode),
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!token || token.invalidated_at || token.used_at) {
      return { ok: false, reason: "invalid_token" };
    }

    if (token.expires_at.getTime() <= Date.now()) {
      return { ok: false, reason: "expired_token", sellerUserId: token.seller_user_id };
    }

    const seller = await User.findByPk(token.seller_user_id, { transaction, lock: transaction.LOCK.UPDATE });
    const perfil = await VendedorPerfil.findOne({
      where: { user_id: token.seller_user_id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!seller || seller.rol !== "seller" || !perfil) {
      return { ok: false, reason: "invalid_token" };
    }

    const activeSellerLink = await getActiveLinkedIdentityForSeller(
      token.seller_user_id,
      transaction
    );
    const activePhoneLink = await getActiveLinkedIdentityForPhone(
      normalizedPhone,
      transaction
    );

    if (
      activePhoneLink &&
      activePhoneLink.seller_user_id !== token.seller_user_id
    ) {
      return {
        ok: false,
        reason: "phone_already_linked",
        sellerUserId: token.seller_user_id,
      };
    }

    if (
      activeSellerLink &&
      activeSellerLink.phone_e164 !== normalizedPhone
    ) {
      return {
        ok: false,
        reason: "seller_already_linked_other_phone",
        sellerUserId: token.seller_user_id,
        linkedPhone: activeSellerLink.phone_e164,
      };
    }

    if (!activeSellerLink) {
      await WhatsappLinkedIdentity.create(
        {
          seller_user_id: token.seller_user_id,
          channel: "whatsapp",
          phone_e164: normalizedPhone,
          status: "active",
          linked_via_token_id: token.id,
        },
        { transaction }
      );
    }

    await token.update(
      {
        used_at: new Date(),
        used_by_phone_e164: normalizedPhone,
      },
      { transaction }
    );

    return {
      ok: true,
      sellerUserId: token.seller_user_id,
      phoneE164: normalizedPhone,
      nombreComercio: perfil.nombre_comercio,
      alreadyLinked: Boolean(activeSellerLink),
    };
  });

  if (!result.ok) {
    await logAuditEvent({
      actor_role: "system",
      action:
        result.reason === "expired_token"
          ? "whatsapp.link.consume.expired"
          : result.reason === "invalid_token"
            ? "whatsapp.link.consume.invalid"
            : result.reason === "phone_already_linked"
              ? "whatsapp.link.consume.phone_conflict"
              : "whatsapp.link.consume.seller_conflict",
      entity_type: "whatsapp_link",
      entity_id: normalizedPhone || null,
      target_user_id: result.sellerUserId ?? null,
      ip_address: "whatsapp",
      user_agent: "meta-webhook",
      http_method: "POST",
      route: "/api/integrations/whatsapp/webhook",
      status:
        result.reason === "invalid_token" || result.reason === "expired_token"
          ? "failed"
          : "blocked",
      severity: "medium",
      metadata: {
        phone_e164: normalizedPhone || null,
        reason: result.reason,
      },
    });
    return result;
  }

  await logAuditEvent({
    actor_user_id: result.sellerUserId,
    actor_role: "seller",
    action: "whatsapp.link.consume.success",
    entity_type: "whatsapp_link",
    entity_id: result.phoneE164,
    target_user_id: result.sellerUserId,
    ip_address: "whatsapp",
    user_agent: "meta-webhook",
    http_method: "POST",
    route: "/api/integrations/whatsapp/webhook",
    status: "success",
    severity: "medium",
    metadata: {
      phone_e164: result.phoneE164,
      already_linked: result.alreadyLinked,
    },
  });

  await trackEvent({
    event: "whatsapp_link_success",
    sellerId: result.sellerUserId,
    payload: {
      phone_e164: result.phoneE164,
      already_linked: result.alreadyLinked,
      source: "backend",
    },
  });

  return result;
}

export async function revokeSellerWhatsappLink(
  sellerUserId: number,
  revokedByUserId: number
): Promise<{ revoked: boolean; phoneE164: string | null }> {
  return sequelize.transaction(async (transaction) => {
    const activeLink = await getActiveLinkedIdentityForSeller(
      sellerUserId,
      transaction
    );

    if (!activeLink) {
      return { revoked: false, phoneE164: null };
    }

    await activeLink.update(
      {
        status: "revoked",
        revoked_at: new Date(),
        revoked_by_user_id: revokedByUserId,
      },
      { transaction }
    );

    await WhatsappLinkingToken.update(
      {
        invalidated_at: new Date(),
      },
      {
        where: {
          seller_user_id: sellerUserId,
          used_at: null,
          invalidated_at: null,
          expires_at: { [Op.gt]: new Date() },
        },
        transaction,
      }
    );

    return { revoked: true, phoneE164: activeLink.phone_e164 };
  });
}
