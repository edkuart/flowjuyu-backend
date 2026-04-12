// src/services/consent.service.ts
//
// Single write-gate for the consent layer.
// Controllers must NOT write directly to user_consents or update consent
// flags on users. All consent mutations must flow through this service.
//
// Design rules:
//   - user_consents is append-only. Never UPDATE or DELETE rows here.
//   - Each consent write is atomic: INSERT + user flag UPDATE share one transaction.
//   - getActivePolicyVersion() is the only place that reads policy_versions;
//     callers never hardcode version strings.
//   - recordRegistrationConsents() is the shorthand for the two-policy write
//     that happens at every registration path.

import { QueryTypes } from "sequelize";
import { sequelize } from "../config/db";
import PolicyVersion, { type PolicyType } from "../models/PolicyVersion.model";
import UserConsent, { type ConsentSource } from "../models/UserConsent.model";
import UserMarketingPromptState, {
  type MarketingPromptStatus,
} from "../models/UserMarketingPromptState.model";
import WhatsappLinkedIdentity from "../models/WhatsappLinkedIdentity.model";
import { User } from "../models/user.model";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConsentType =
  | "terms"
  | "privacy"
  | "marketing_email"
  | "marketing_whatsapp"
  | "data_processing"
  | "kyc_data";

export type MarketingPromptKey =
  | "seller_marketing_email_dashboard"
  | "buyer_marketing_email_favorites";

export interface RecordConsentInput {
  userId: number;
  consentType: ConsentType;
  accepted: boolean;
  source: ConsentSource | string;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Skip the DB lookup when the caller already resolved the version */
  policyVersionId?: number;
}

export interface CommunicationPreferences {
  operationalEmail: boolean;
  marketingEmail: boolean;
  operationalWhatsapp: boolean;
  marketingWhatsapp: boolean;
}

export interface CommunicationPreferenceUpdateInput {
  marketingEmail?: boolean;
  marketingWhatsapp?: boolean;
}

export interface MarketingPromptSnapshot {
  prompt: {
    key: MarketingPromptKey;
    status: MarketingPromptStatus | null;
    shownAt: string | null;
    actedAt: string | null;
    metadata: Record<string, unknown> | null;
    shouldShow: boolean;
    cooldownUntil: string | null;
  };
  preferences: CommunicationPreferences;
}

// Rows returned by the current_consents view
export interface CurrentConsentRow {
  id: string;
  user_id: number;
  policy_type: string;
  version: string;
  policy_version_id: number;
  granted: boolean;
  source: string | null;
  ip_address: string | null;
  created_at: Date;
}

// ── Internal mapping tables ───────────────────────────────────────────────────

/**
 * Maps consentType to the policy_type stored in policy_versions.
 * marketing_email, marketing_whatsapp and data_processing share the
 * 'communications' policy.
 */
const CONSENT_TO_POLICY_TYPE: Record<ConsentType, PolicyType> = {
  terms: "terms",
  privacy: "privacy",
  marketing_email: "communications",
  marketing_whatsapp: "communications",
  data_processing: "communications",
  kyc_data: "kyc_data",
};

const PROMPT_ROLE: Record<MarketingPromptKey, "buyer" | "seller"> = {
  seller_marketing_email_dashboard: "seller",
  buyer_marketing_email_favorites: "buyer",
};

const PROMPT_COOLDOWN_MS: Record<MarketingPromptStatus, number> = {
  shown: 3 * 24 * 60 * 60 * 1000,
  accepted: Number.MAX_SAFE_INTEGER,
  dismissed: 14 * 24 * 60 * 60 * 1000,
  snoozed: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Builds the partial update object for the users table based on consentType.
 * kyc_data is intentionally absent — its flag lives on vendedor_perfil, not users.
 */
function buildUserFlags(
  consentType: ConsentType,
  granted: boolean,
  policyVersion: string | null,
): Record<string, unknown> {
  const now = new Date();

  switch (consentType) {
    case "terms":
      return {
        terms_current: granted,
        terms_accepted_at: now,
        ...(policyVersion ? { terms_version: policyVersion } : {}),
      };

    case "privacy":
      return {
        privacy_current: granted,
        privacy_accepted_at: now,
        ...(policyVersion ? { privacy_version: policyVersion } : {}),
      };

    case "marketing_email":
      return {
        marketing_email: granted,
        marketing_email_at: now,
      };

    case "marketing_whatsapp":
      return {
        marketing_whatsapp: granted,
        marketing_whatsapp_at: now,
      };

    case "data_processing":
      return {
        data_processing_acknowledged: granted,
        data_processing_acknowledged_at: now,
      };

    case "kyc_data":
      return {};

    default:
      return {};
  }
}

async function hasOperationalWhatsappChannel(
  userId: number,
  role?: string | null,
): Promise<boolean> {
  if (role !== "seller") return false;

  const count = await WhatsappLinkedIdentity.count({
    where: {
      seller_user_id: userId,
      status: "active",
    },
  });

  return count > 0;
}

function assertPromptRole(userRole: string | null | undefined, promptKey: MarketingPromptKey): void {
  const requiredRole = PROMPT_ROLE[promptKey];
  if (requiredRole !== userRole) {
    throw new Error("PROMPT_ROLE_MISMATCH");
  }
}

function getPromptCooldownUntil(
  state: UserMarketingPromptState | null,
): Date | null {
  if (!state) return null;
  if (state.status === "accepted") return new Date("9999-12-31T23:59:59.999Z");

  const anchor = state.status === "shown" ? state.shown_at : state.acted_at;
  if (!anchor) return null;

  return new Date(anchor.getTime() + PROMPT_COOLDOWN_MS[state.status]);
}

function serializePromptSnapshot(
  promptKey: MarketingPromptKey,
  state: UserMarketingPromptState | null,
  preferences: CommunicationPreferences,
): MarketingPromptSnapshot {
  const cooldownUntil = getPromptCooldownUntil(state);
  const now = Date.now();

  const shouldShow =
    !preferences.marketingEmail &&
    state?.status !== "accepted" &&
    (!cooldownUntil || cooldownUntil.getTime() <= now);

  return {
    prompt: {
      key: promptKey,
      status: state?.status ?? null,
      shownAt: state?.shown_at ? state.shown_at.toISOString() : null,
      actedAt: state?.acted_at ? state.acted_at.toISOString() : null,
      metadata: (state?.metadata as Record<string, unknown> | null) ?? null,
      shouldShow,
      cooldownUntil: shouldShow || !cooldownUntil ? null : cooldownUntil.toISOString(),
    },
    preferences,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the currently active version of a policy type.
 * Returns null if no active version exists (misconfiguration).
 */
export async function getActivePolicyVersion(
  policyType: PolicyType,
): Promise<PolicyVersion | null> {
  return PolicyVersion.findOne({
    where: { policy_type: policyType, is_active: true },
  });
}

/**
 * Records a single consent action.
 * Atomically:
 *   1. Inserts a row in user_consents (append-only log)
 *   2. Updates the fast-access flags on users
 *
 * Throws on failure — callers decide how to handle (log + continue, or propagate).
 */
export async function recordConsent(
  input: RecordConsentInput,
): Promise<UserConsent> {
  const policyType = CONSENT_TO_POLICY_TYPE[input.consentType];

  let policyVersionId = input.policyVersionId ?? null;
  let policyVersion: PolicyVersion | null = null;

  if (!policyVersionId) {
    policyVersion = await getActivePolicyVersion(policyType);
    if (!policyVersion) {
      throw new Error(
        `[consent] No active policy_version found for type "${policyType}". ` +
          `Run the seed migration or activate a version before recording consents.`,
      );
    }
    policyVersionId = policyVersion.id;
  }

  const t = await sequelize.transaction();
  try {
    const consent = await UserConsent.create(
      {
        user_id: input.userId,
        policy_version_id: policyVersionId,
        granted: input.accepted,
        ip_address: input.ipAddress ?? null,
        user_agent: input.userAgent ?? null,
        source: input.source ?? null,
      },
      { transaction: t },
    );

    const resolvedVersion =
      policyVersion?.version ??
      (await PolicyVersion.findByPk(policyVersionId))?.version ??
      null;

    const flags = buildUserFlags(input.consentType, input.accepted, resolvedVersion);
    if (Object.keys(flags).length > 0) {
      await User.update(flags, { where: { id: input.userId }, transaction: t });
    }

    await t.commit();
    return consent;
  } catch (err) {
    if ((t as any).finished !== "commit") {
      try {
        await t.rollback();
      } catch {
        // already finished
      }
    }
    throw err;
  }
}

/**
 * Convenience function for the registration paths (buyer, seller, social).
 * Records terms + privacy in a single transaction so both succeed or both fail.
 *
 * Does NOT record marketing_email — that requires an explicit opt-in.
 */
export async function recordRegistrationConsents(
  userId: number,
  opts: {
    accepted: boolean;
    source: ConsentSource | string;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
): Promise<void> {
  const [termsVersion, privacyVersion] = await Promise.all([
    getActivePolicyVersion("terms"),
    getActivePolicyVersion("privacy"),
  ]);

  if (!termsVersion && !privacyVersion) {
    throw new Error(
      "[consent] No active policy versions found for 'terms' or 'privacy'. " +
        "Ensure the seed migration has run.",
    );
  }

  const now = new Date();
  const t = await sequelize.transaction();

  type ConsentRow = {
    user_id: number;
    policy_version_id: number;
    granted: boolean;
    ip_address: string | null;
    user_agent: string | null;
    source: string | null;
  };

  try {
    const consentRows: ConsentRow[] = [];
    const userFlags: Record<string, unknown> = {};

    if (termsVersion) {
      consentRows.push({
        user_id: userId,
        policy_version_id: termsVersion.id,
        granted: opts.accepted,
        ip_address: opts.ipAddress ?? null,
        user_agent: opts.userAgent ?? null,
        source: opts.source,
      });
      if (opts.accepted) {
        userFlags.terms_current = true;
        userFlags.terms_version = termsVersion.version;
        userFlags.terms_accepted_at = now;
      }
    }

    if (privacyVersion) {
      consentRows.push({
        user_id: userId,
        policy_version_id: privacyVersion.id,
        granted: opts.accepted,
        ip_address: opts.ipAddress ?? null,
        user_agent: opts.userAgent ?? null,
        source: opts.source,
      });
      if (opts.accepted) {
        userFlags.privacy_current = true;
        userFlags.privacy_version = privacyVersion.version;
        userFlags.privacy_accepted_at = now;
      }
    }

    for (const row of consentRows) {
      await UserConsent.create(row, { transaction: t });
    }

    if (Object.keys(userFlags).length > 0) {
      await User.update(userFlags, { where: { id: userId }, transaction: t });
    }

    await t.commit();
  } catch (err) {
    if ((t as any).finished !== "commit") {
      try {
        await t.rollback();
      } catch {
        // already finished
      }
    }
    throw err;
  }
}

/**
 * Returns the current effective consent for a user × policy_type pair.
 * Queries the current_consents VIEW (most-recent row per user × policy_type).
 * Returns null if the user has never made a consent decision for this type.
 */
export async function getEffectiveConsent(
  userId: number,
  policyType: PolicyType,
): Promise<CurrentConsentRow | null> {
  const rows = await sequelize.query<CurrentConsentRow>(
    `SELECT * FROM current_consents
     WHERE user_id = :userId AND policy_type = :policyType
     LIMIT 1`,
    {
      replacements: { userId, policyType },
      type: QueryTypes.SELECT,
    },
  );
  return rows[0] ?? null;
}

export async function getCommunicationPreferences(
  userId: number,
): Promise<CommunicationPreferences> {
  const user = await User.findByPk(userId, {
    attributes: ["id", "rol", "marketing_email", "marketing_whatsapp"],
  });

  if (!user) {
    return {
      operationalEmail: true,
      marketingEmail: false,
      operationalWhatsapp: false,
      marketingWhatsapp: false,
    };
  }

  return {
    operationalEmail: true,
    marketingEmail: Boolean(user.marketing_email),
    operationalWhatsapp: await hasOperationalWhatsappChannel(userId, user.rol),
    marketingWhatsapp: Boolean(user.marketing_whatsapp),
  };
}

export async function updateCommunicationPreferences(
  userId: number,
  input: CommunicationPreferenceUpdateInput,
  context: {
    source: ConsentSource | string;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
): Promise<{
  preferences: CommunicationPreferences;
  changedFields: string[];
}> {
  const user = await User.findByPk(userId, {
    attributes: ["id", "marketing_email", "marketing_whatsapp"],
  });

  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  const changedFields: string[] = [];

  if (
    typeof input.marketingEmail === "boolean" &&
    input.marketingEmail !== Boolean(user.marketing_email)
  ) {
    await recordConsent({
      userId,
      consentType: "marketing_email",
      accepted: input.marketingEmail,
      source: context.source,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });
    changedFields.push("marketingEmail");
  }

  if (
    typeof input.marketingWhatsapp === "boolean" &&
    input.marketingWhatsapp !== Boolean(user.marketing_whatsapp)
  ) {
    await recordConsent({
      userId,
      consentType: "marketing_whatsapp",
      accepted: input.marketingWhatsapp,
      source: context.source,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });
    changedFields.push("marketingWhatsapp");
  }

  return {
    preferences: await getCommunicationPreferences(userId),
    changedFields,
  };
}

export async function getMarketingPromptSnapshot(
  userId: number,
  promptKey: MarketingPromptKey,
): Promise<MarketingPromptSnapshot> {
  const user = await User.findByPk(userId, {
    attributes: ["id", "rol"],
  });

  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  assertPromptRole(user.rol, promptKey);

  const [preferences, state] = await Promise.all([
    getCommunicationPreferences(userId),
    UserMarketingPromptState.findOne({
      where: { user_id: userId, prompt_key: promptKey },
    }),
  ]);

  return serializePromptSnapshot(promptKey, state, preferences);
}

export async function updateMarketingPromptState(
  userId: number,
  promptKey: MarketingPromptKey,
  input: {
    status: Extract<MarketingPromptStatus, "shown" | "dismissed" | "snoozed">;
    metadata?: Record<string, unknown> | null;
  },
): Promise<MarketingPromptSnapshot> {
  const user = await User.findByPk(userId, {
    attributes: ["id", "rol"],
  });

  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  assertPromptRole(user.rol, promptKey);

  const existing = await UserMarketingPromptState.findOne({
    where: { user_id: userId, prompt_key: promptKey },
  });

  const now = new Date();
  const mergedMetadata = {
    ...(((existing?.metadata as Record<string, unknown> | null) ?? {})),
    ...((input.metadata ?? {})),
  };

  if (existing) {
    existing.status = input.status;
    existing.shown_at = input.status === "shown" ? now : existing.shown_at ?? now;
    existing.acted_at = input.status === "shown" ? existing.acted_at : now;
    existing.metadata = Object.keys(mergedMetadata).length > 0 ? mergedMetadata : null;
    await existing.save();
  } else {
    await UserMarketingPromptState.create({
      user_id: userId,
      prompt_key: promptKey,
      status: input.status,
      shown_at: now,
      acted_at: input.status === "shown" ? null : now,
      metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : null,
    });
  }

  return getMarketingPromptSnapshot(userId, promptKey);
}

export async function acceptMarketingPrompt(
  userId: number,
  promptKey: MarketingPromptKey,
  context: {
    source: ConsentSource | string;
    ipAddress?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<MarketingPromptSnapshot & { changedFields: string[] }> {
  const user = await User.findByPk(userId, {
    attributes: ["id", "rol"],
  });

  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  assertPromptRole(user.rol, promptKey);

  const result = await updateCommunicationPreferences(
    userId,
    { marketingEmail: true },
    {
      source: context.source,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    },
  );

  const existing = await UserMarketingPromptState.findOne({
    where: { user_id: userId, prompt_key: promptKey },
  });

  const now = new Date();
  const metadata = {
    ...(((existing?.metadata as Record<string, unknown> | null) ?? {})),
    ...((context.metadata ?? {})),
    channel: "email",
  };

  if (existing) {
    existing.status = "accepted";
    existing.shown_at = existing.shown_at ?? now;
    existing.acted_at = now;
    existing.metadata = metadata;
    await existing.save();
  } else {
    await UserMarketingPromptState.create({
      user_id: userId,
      prompt_key: promptKey,
      status: "accepted",
      shown_at: now,
      acted_at: now,
      metadata,
    });
  }

  const snapshot = await getMarketingPromptSnapshot(userId, promptKey);

  return {
    ...snapshot,
    changedFields: result.changedFields,
  };
}

/**
 * Checks whether a user has accepted both current terms and privacy policy.
 * Uses the denormalized flags on users (O(1) — no JOIN required).
 * Intended as the foundation for future middleware enforcement.
 */
export async function checkTermsCompliance(userId: number): Promise<{
  compliant: boolean;
  terms: boolean;
  privacy: boolean;
  missingConsents: string[];
}> {
  const user = await User.findByPk(userId, {
    attributes: ["id", "terms_current", "privacy_current"],
  });

  if (!user) {
    return {
      compliant: false,
      terms: false,
      privacy: false,
      missingConsents: ["terms", "privacy"],
    };
  }

  const termsOk = user.terms_current ?? false;
  const privacyOk = user.privacy_current ?? false;
  const missing: string[] = [];
  if (!termsOk) missing.push("terms");
  if (!privacyOk) missing.push("privacy");

  return {
    compliant: termsOk && privacyOk,
    terms: termsOk,
    privacy: privacyOk,
    missingConsents: missing,
  };
}
