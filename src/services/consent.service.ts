import { Op, QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../config/db";
import PolicyVersion, { type PolicyType } from "../models/PolicyVersion.model";
import UserConsent, { type ConsentSource } from "../models/UserConsent.model";
import CurrentConsent from "../models/CurrentConsent.model";
import UserMarketingPromptState, {
  type MarketingPromptStatus,
} from "../models/UserMarketingPromptState.model";
import WhatsappLinkedIdentity from "../models/WhatsappLinkedIdentity.model";
import { User } from "../models/user.model";
import { invalidateSession } from "../lib/sessionCache";

export type LegalPolicyType = "terms" | "privacy";

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
  ipHash?: string | null;
  locale?: string | null;
  userAgent?: string | null;
  evidenceJson?: Record<string, unknown> | null;
  acceptedAt?: Date;
  policyVersionId?: string;
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

export interface PolicyVersionSnapshot {
  id: string;
  policyType: PolicyType;
  versionCode: string;
  versionLabel: string;
  url: string | null;
  contentHash: string;
  effectiveAt: string;
  isActive: boolean;
  isMaterial: boolean;
  requiresReacceptance: boolean;
  changeSummaryShort: string | null;
  changeSummaryFull: string | null;
}

export interface ResolvedConsentAccess {
  userId: number;
  canAccess: boolean;
  needsConsent: boolean;
  missingPolicies: LegalPolicyType[];
  requiresReacceptanceFor: LegalPolicyType[];
  acceptedVersionIds: {
    terms: string | null;
    privacy: string | null;
  };
  activeVersions: {
    terms: PolicyVersionSnapshot | null;
    privacy: PolicyVersionSnapshot | null;
  };
  summary: {
    acceptedTermsVersionId: string | null;
    acceptedPrivacyVersionId: string | null;
    needsReacceptanceTerms: boolean;
    needsReacceptancePrivacy: boolean;
    updatedAt: string | null;
  };
}

export interface SessionConsentContract {
  canAccess: boolean;
  needsConsent: boolean;
  missingPolicies: LegalPolicyType[];
  requiresReacceptanceFor: LegalPolicyType[];
  acceptedVersionIds: {
    terms: string | null;
    privacy: string | null;
  };
  activeVersions: {
    terms: PolicyVersionSnapshot | null;
    privacy: PolicyVersionSnapshot | null;
  };
}

type CurrentLegalDecisionRow = {
  policy_type: LegalPolicyType;
  policy_version_id: string | null;
  accepted: boolean;
  accepted_at: Date;
  created_at: Date;
};

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

let activePolicyCache:
  | {
      expiresAt: number;
      values: Record<LegalPolicyType, PolicyVersion | null>;
    }
  | null = null;

function normalizeUserId(userId: number | string): number {
  const parsed =
    typeof userId === "number" ? userId : Number.parseInt(String(userId), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid userId "${userId}"`);
  }

  return parsed;
}

function toPolicySnapshot(policy: PolicyVersion | null): PolicyVersionSnapshot | null {
  if (!policy) return null;

  return {
    id: policy.id,
    policyType: policy.policy_type,
    versionCode: policy.version_code,
    versionLabel: policy.version_label,
    url: policy.url,
    contentHash: policy.content_hash,
    effectiveAt: policy.effective_at.toISOString(),
    isActive: policy.is_active,
    isMaterial: policy.is_material,
    requiresReacceptance: policy.requires_reacceptance,
    changeSummaryShort: policy.change_summary_short,
    changeSummaryFull: policy.change_summary_full,
  };
}

function hashIpAddress(ipAddress?: string | null): string | null {
  if (!ipAddress) return null;
  const normalized = ipAddress.trim();
  if (!normalized) return null;
  return Buffer.from(normalized).toString("base64");
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

function buildLegacyUserFlags(
  consentType: ConsentType,
  accepted: boolean,
  policy: PolicyVersion,
  acceptedAt: Date,
): Record<string, unknown> {
  switch (consentType) {
    case "terms":
      return {
        terms_current: accepted,
        terms_version: accepted ? policy.version_code : null,
        terms_accepted_at: accepted ? acceptedAt : null,
      };
    case "privacy":
      return {
        privacy_current: accepted,
        privacy_version: accepted ? policy.version_code : null,
        privacy_accepted_at: accepted ? acceptedAt : null,
      };
    case "marketing_email":
      return {
        marketing_email: accepted,
        marketing_email_at: accepted ? acceptedAt : null,
      };
    case "marketing_whatsapp":
      return {
        marketing_whatsapp: accepted,
        marketing_whatsapp_at: accepted ? acceptedAt : null,
      };
    case "data_processing":
      return {
        data_processing_acknowledged: accepted,
        data_processing_acknowledged_at: accepted ? acceptedAt : null,
      };
    case "kyc_data":
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

async function fetchLatestLegalDecisions(
  userId: number,
  transaction?: Transaction,
): Promise<Map<LegalPolicyType, CurrentLegalDecisionRow>> {
  const rows = await sequelize.query<CurrentLegalDecisionRow>(
    `
    SELECT DISTINCT ON (policy_type)
      policy_type,
      policy_version_id,
      accepted,
      accepted_at,
      created_at
    FROM user_consents
    WHERE user_id = :userId
      AND policy_type IN ('terms', 'privacy')
    ORDER BY policy_type, accepted_at DESC, created_at DESC, id DESC
    `,
    {
      replacements: { userId },
      type: QueryTypes.SELECT,
      transaction,
    },
  );

  return new Map(rows.map((row) => [row.policy_type, row]));
}

async function getActiveLegalPolicies(options?: {
  transaction?: Transaction;
  bypassCache?: boolean;
}): Promise<Record<LegalPolicyType, PolicyVersion | null>> {
  const bypassCache = options?.transaction != null || options?.bypassCache === true;
  const now = Date.now();

  if (!bypassCache && activePolicyCache && now < activePolicyCache.expiresAt) {
    return activePolicyCache.values;
  }

  const rows = await PolicyVersion.findAll({
    where: {
      policy_type: { [Op.in]: ["terms", "privacy"] },
      is_active: true,
    },
    transaction: options?.transaction,
  });

  const values: Record<LegalPolicyType, PolicyVersion | null> = {
    terms: rows.find((row) => row.policy_type === "terms") ?? null,
    privacy: rows.find((row) => row.policy_type === "privacy") ?? null,
  };

  if (!bypassCache) {
    activePolicyCache = {
      values,
      expiresAt: now + 30_000,
    };
  }

  return values;
}

function computeConsentAccess(
  userId: number,
  summary: CurrentConsent | null,
  activePolicies: Record<LegalPolicyType, PolicyVersion | null>,
): ResolvedConsentAccess {
  const acceptedTermsVersionId = summary?.accepted_terms_version_id ?? null;
  const acceptedPrivacyVersionId = summary?.accepted_privacy_version_id ?? null;

  const missingPolicies: LegalPolicyType[] = [];
  const requiresReacceptanceFor: LegalPolicyType[] = [];

  const activeTerms = activePolicies.terms;
  const activePrivacy = activePolicies.privacy;

  const termsNeedsConsent =
    !activeTerms ||
    !acceptedTermsVersionId ||
    (activeTerms.requires_reacceptance && acceptedTermsVersionId !== activeTerms.id);

  const privacyNeedsConsent =
    !activePrivacy ||
    !acceptedPrivacyVersionId ||
    (activePrivacy.requires_reacceptance && acceptedPrivacyVersionId !== activePrivacy.id);

  if (termsNeedsConsent) {
    missingPolicies.push("terms");
    if (activeTerms && acceptedTermsVersionId && acceptedTermsVersionId !== activeTerms.id) {
      requiresReacceptanceFor.push("terms");
    }
  }

  if (privacyNeedsConsent) {
    missingPolicies.push("privacy");
    if (
      activePrivacy &&
      acceptedPrivacyVersionId &&
      acceptedPrivacyVersionId !== activePrivacy.id
    ) {
      requiresReacceptanceFor.push("privacy");
    }
  }

  return {
    userId,
    canAccess: missingPolicies.length === 0,
    needsConsent: missingPolicies.length > 0,
    missingPolicies,
    requiresReacceptanceFor,
    acceptedVersionIds: {
      terms: acceptedTermsVersionId,
      privacy: acceptedPrivacyVersionId,
    },
    activeVersions: {
      terms: toPolicySnapshot(activeTerms),
      privacy: toPolicySnapshot(activePrivacy),
    },
    summary: {
      acceptedTermsVersionId,
      acceptedPrivacyVersionId,
      needsReacceptanceTerms: summary?.needs_reacceptance_terms ?? termsNeedsConsent,
      needsReacceptancePrivacy: summary?.needs_reacceptance_privacy ?? privacyNeedsConsent,
      updatedAt: summary?.updated_at ? summary.updated_at.toISOString() : null,
    },
  };
}

async function syncCurrentConsentSummary(
  userId: number,
  transaction?: Transaction,
): Promise<CurrentConsent> {
  const [latestDecisions, activePolicies] = await Promise.all([
    fetchLatestLegalDecisions(userId, transaction),
    getActiveLegalPolicies({ transaction }),
  ]);

  const latestTerms = latestDecisions.get("terms");
  const latestPrivacy = latestDecisions.get("privacy");

  const acceptedTermsVersionId = latestTerms?.accepted
    ? latestTerms.policy_version_id
    : null;
  const acceptedPrivacyVersionId = latestPrivacy?.accepted
    ? latestPrivacy.policy_version_id
    : null;

  const needsReacceptanceTerms = Boolean(
    activePolicies.terms &&
      (!acceptedTermsVersionId ||
        (activePolicies.terms.requires_reacceptance &&
          acceptedTermsVersionId !== activePolicies.terms.id)),
  );

  const needsReacceptancePrivacy = Boolean(
    activePolicies.privacy &&
      (!acceptedPrivacyVersionId ||
        (activePolicies.privacy.requires_reacceptance &&
          acceptedPrivacyVersionId !== activePolicies.privacy.id)),
  );

  await CurrentConsent.upsert(
    {
      user_id: userId,
      accepted_terms_version_id: acceptedTermsVersionId,
      accepted_privacy_version_id: acceptedPrivacyVersionId,
      needs_reacceptance_terms: needsReacceptanceTerms,
      needs_reacceptance_privacy: needsReacceptancePrivacy,
    },
    { transaction },
  );

  const current = await CurrentConsent.findByPk(userId, { transaction });
  if (!current) {
    throw new Error(`Failed to upsert current_consents row for user ${userId}`);
  }
  return current;
}

export async function getActivePolicyVersion(
  policyType: PolicyType,
): Promise<PolicyVersion | null> {
  return PolicyVersion.findOne({
    where: { policy_type: policyType, is_active: true },
    order: [["effective_at", "DESC"]],
  });
}

export async function resolveConsentAccess(
  userIdInput: number | string,
): Promise<ResolvedConsentAccess> {
  const userId = normalizeUserId(userIdInput);

  let summary = await CurrentConsent.findByPk(userId);
  const activePolicies = await getActiveLegalPolicies();

  if (!summary) {
    summary = await syncCurrentConsentSummary(userId);
  }

  const computed = computeConsentAccess(userId, summary, activePolicies);

  if (
    computed.summary.needsReacceptanceTerms !== summary.needs_reacceptance_terms ||
    computed.summary.needsReacceptancePrivacy !== summary.needs_reacceptance_privacy
  ) {
    summary = await syncCurrentConsentSummary(userId);
    return computeConsentAccess(userId, summary, activePolicies);
  }

  return computed;
}

export function buildSessionConsentContract(
  resolved: ResolvedConsentAccess,
): SessionConsentContract {
  return {
    canAccess: resolved.canAccess,
    needsConsent: resolved.needsConsent,
    missingPolicies: resolved.missingPolicies,
    requiresReacceptanceFor: resolved.requiresReacceptanceFor,
    acceptedVersionIds: resolved.acceptedVersionIds,
    activeVersions: resolved.activeVersions,
  };
}

export async function recordConsent(
  input: RecordConsentInput,
): Promise<UserConsent> {
  const userId = normalizeUserId(input.userId);
  const policyType = CONSENT_TO_POLICY_TYPE[input.consentType];
  const acceptedAt = input.acceptedAt ?? new Date();

  const t = await sequelize.transaction();
  try {
    const policyVersion =
      (input.policyVersionId
        ? await PolicyVersion.findByPk(input.policyVersionId, { transaction: t })
        : await getActivePolicyVersion(policyType)) ?? null;

    if (!policyVersion) {
      throw new Error(
        `[consent] No active policy version found for type "${policyType}"`,
      );
    }

    const existingAccepted =
      input.accepted === true
        ? await UserConsent.findOne({
            where: {
              user_id: userId,
              policy_version_id: policyVersion.id,
              accepted: true,
            },
            transaction: t,
          })
        : null;

    const consent =
      existingAccepted ??
      (await UserConsent.create(
        {
          user_id: userId,
          policy_type: policyType,
          policy_version_id: policyVersion.id,
          accepted: input.accepted,
          accepted_at: acceptedAt,
          surface: input.source ?? null,
          locale: input.locale ?? null,
          user_agent: input.userAgent ?? null,
          ip_hash: input.ipHash ?? hashIpAddress(input.ipAddress),
          evidence_json: input.evidenceJson ?? null,
        },
        { transaction: t },
      ));

    const flags = buildLegacyUserFlags(
      input.consentType,
      input.accepted,
      policyVersion,
      acceptedAt,
    );
    if (Object.keys(flags).length > 0) {
      await User.update(flags, { where: { id: userId }, transaction: t });
    }

    if (policyType === "terms" || policyType === "privacy") {
      await syncCurrentConsentSummary(userId, t);
    }

    await t.commit();
    invalidateSession(userId);
    return consent;
  } catch (err) {
    if ((t as any).finished !== "commit") {
      try {
        await t.rollback();
      } catch {
        // ignore
      }
    }
    throw err;
  }
}

export async function recordRegistrationConsents(
  userIdInput: number | string,
  opts: {
    accepted: boolean;
    source: ConsentSource | string;
    ipAddress?: string | null;
    userAgent?: string | null;
    locale?: string | null;
  },
): Promise<void> {
  const userId = normalizeUserId(userIdInput);

  const [termsVersion, privacyVersion] = await Promise.all([
    getActivePolicyVersion("terms"),
    getActivePolicyVersion("privacy"),
  ]);

  if (!termsVersion || !privacyVersion) {
    throw new Error("[consent] Missing active legal policy versions");
  }

  const now = new Date();
  const t = await sequelize.transaction();

  try {
    const rows = [
      {
        user_id: userId,
        policy_type: "terms",
        policy_version_id: termsVersion.id,
      },
      {
        user_id: userId,
        policy_type: "privacy",
        policy_version_id: privacyVersion.id,
      },
    ];

    for (const row of rows) {
      const existingAccepted = await UserConsent.findOne({
        where: {
          user_id: row.user_id,
          policy_version_id: row.policy_version_id,
          accepted: true,
        },
        transaction: t,
      });

      if (existingAccepted) continue;

      await UserConsent.create(
        {
          ...row,
          accepted: opts.accepted,
          accepted_at: now,
          surface: opts.source,
          locale: opts.locale ?? null,
          user_agent: opts.userAgent ?? null,
          ip_hash: hashIpAddress(opts.ipAddress),
          evidence_json: {
            registration: true,
          },
        },
        { transaction: t },
      );
    }

    await User.update(
      {
        terms_current: opts.accepted,
        terms_version: termsVersion.version_code,
        terms_accepted_at: opts.accepted ? now : null,
        privacy_current: opts.accepted,
        privacy_version: privacyVersion.version_code,
        privacy_accepted_at: opts.accepted ? now : null,
      },
      {
        where: { id: userId },
        transaction: t,
      },
    );

    await syncCurrentConsentSummary(userId, t);
    await t.commit();
    invalidateSession(userId);
  } catch (err) {
    if ((t as any).finished !== "commit") {
      try {
        await t.rollback();
      } catch {
        // ignore
      }
    }
    throw err;
  }
}

export async function getEffectiveConsent(
  userIdInput: number | string,
  policyType: PolicyType,
): Promise<{
  user_id: number;
  policy_type: PolicyType;
  policy_version_id: string;
  accepted: boolean;
  accepted_at: Date;
  created_at: Date;
} | null> {
  const userId = normalizeUserId(userIdInput);
  const rows = await sequelize.query<{
    user_id: number;
    policy_type: PolicyType;
    policy_version_id: string;
    accepted: boolean;
    accepted_at: Date;
    created_at: Date;
  }>(
    `
    SELECT
      user_id,
      policy_type,
      policy_version_id,
      accepted,
      accepted_at,
      created_at
    FROM user_consents
    WHERE user_id = :userId
      AND policy_type = :policyType
    ORDER BY accepted_at DESC, created_at DESC, id DESC
    LIMIT 1
    `,
    {
      replacements: { userId, policyType },
      type: QueryTypes.SELECT,
    },
  );

  return rows[0] ?? null;
}

export async function checkTermsCompliance(
  userIdInput: number | string,
): Promise<{
  compliant: boolean;
  terms: boolean;
  privacy: boolean;
  missingConsents: LegalPolicyType[];
}> {
  const resolved = await resolveConsentAccess(userIdInput);

  return {
    compliant: resolved.canAccess,
    terms: !resolved.missingPolicies.includes("terms"),
    privacy: !resolved.missingPolicies.includes("privacy"),
    missingConsents: resolved.missingPolicies,
  };
}

export async function getCommunicationPreferences(
  userIdInput: number | string,
): Promise<CommunicationPreferences> {
  const userId = normalizeUserId(userIdInput);
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
  userIdInput: number | string,
  input: CommunicationPreferenceUpdateInput,
  context: {
    source: ConsentSource | string;
    ipAddress?: string | null;
    userAgent?: string | null;
    locale?: string | null;
  },
): Promise<{
  preferences: CommunicationPreferences;
  changedFields: string[];
}> {
  const userId = normalizeUserId(userIdInput);
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
      locale: context.locale ?? null,
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
      locale: context.locale ?? null,
    });
    changedFields.push("marketingWhatsapp");
  }

  return {
    preferences: await getCommunicationPreferences(userId),
    changedFields,
  };
}

export async function getMarketingPromptSnapshot(
  userIdInput: number | string,
  promptKey: MarketingPromptKey,
): Promise<MarketingPromptSnapshot> {
  const userId = normalizeUserId(userIdInput);
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
  userIdInput: number | string,
  promptKey: MarketingPromptKey,
  input: {
    status: Extract<MarketingPromptStatus, "shown" | "dismissed" | "snoozed">;
    metadata?: Record<string, unknown> | null;
  },
): Promise<MarketingPromptSnapshot> {
  const userId = normalizeUserId(userIdInput);
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
  userIdInput: number | string,
  promptKey: MarketingPromptKey,
  context: {
    source: ConsentSource | string;
    ipAddress?: string | null;
    userAgent?: string | null;
    locale?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<MarketingPromptSnapshot & { changedFields: string[] }> {
  const userId = normalizeUserId(userIdInput);
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
      locale: context.locale ?? null,
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
