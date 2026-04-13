import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db";

const FUNNEL_EVENTS = {
  viewed: "whatsapp_link_viewed",
  generated: "whatsapp_link_token_generated",
  opened: "whatsapp_link_open_clicked",
  success: "whatsapp_link_success",
} as const;

export type FunnelStats = {
  viewed: number;
  generated: number;
  opened: number;
  success: number;
};

export type ConversionRates = {
  view_to_generate: number;
  generate_to_open: number;
  open_to_success: number;
};

export type FunnelDayPoint = {
  date: string;
  viewed: number;
  generated: number;
  opened: number;
  success: number;
};

function toPercent(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) {
    return 0;
  }

  return Number(((numerator / denominator) * 100).toFixed(2));
}

export async function getFunnelStats(): Promise<FunnelStats> {
  const rows = await sequelize.query<{ event_name: string; total: number }>(
    `
    SELECT event_name, COUNT(*)::int AS total
    FROM analytics_events
    WHERE event_name IN (:eventNames)
    GROUP BY event_name
    `,
    {
      replacements: { eventNames: Object.values(FUNNEL_EVENTS) },
      type: QueryTypes.SELECT,
    }
  );

  const counts = new Map(rows.map((row) => [row.event_name, Number(row.total) || 0]));

  return {
    viewed: counts.get(FUNNEL_EVENTS.viewed) ?? 0,
    generated: counts.get(FUNNEL_EVENTS.generated) ?? 0,
    opened: counts.get(FUNNEL_EVENTS.opened) ?? 0,
    success: counts.get(FUNNEL_EVENTS.success) ?? 0,
  };
}

export async function getConversionRates(): Promise<ConversionRates> {
  const funnel = await getFunnelStats();

  return {
    view_to_generate: toPercent(funnel.generated, funnel.viewed),
    generate_to_open: toPercent(funnel.opened, funnel.generated),
    open_to_success: toPercent(funnel.success, funnel.opened),
  };
}

export async function getEventsByDay(days: number): Promise<FunnelDayPoint[]> {
  const normalizedDays = Math.max(1, Math.min(90, Math.floor(days || 14)));

  const rows = await sequelize.query<FunnelDayPoint>(
    `
    SELECT
      series.day::date::text AS date,
      COALESCE(SUM(CASE WHEN ae.event_name = :viewed THEN 1 ELSE 0 END), 0)::int AS viewed,
      COALESCE(SUM(CASE WHEN ae.event_name = :generated THEN 1 ELSE 0 END), 0)::int AS generated,
      COALESCE(SUM(CASE WHEN ae.event_name = :opened THEN 1 ELSE 0 END), 0)::int AS opened,
      COALESCE(SUM(CASE WHEN ae.event_name = :success THEN 1 ELSE 0 END), 0)::int AS success
    FROM generate_series(
      CURRENT_DATE - (:days::int - 1) * INTERVAL '1 day',
      CURRENT_DATE,
      INTERVAL '1 day'
    ) AS series(day)
    LEFT JOIN analytics_events ae
      ON DATE(ae.created_at) = series.day::date
      AND ae.event_name IN (:eventNames)
    GROUP BY series.day
    ORDER BY series.day ASC
    `,
    {
      replacements: {
        days: normalizedDays,
        eventNames: Object.values(FUNNEL_EVENTS),
        viewed: FUNNEL_EVENTS.viewed,
        generated: FUNNEL_EVENTS.generated,
        opened: FUNNEL_EVENTS.opened,
        success: FUNNEL_EVENTS.success,
      },
      type: QueryTypes.SELECT,
    }
  );

  return rows.map((row) => ({
    date: row.date,
    viewed: Number(row.viewed) || 0,
    generated: Number(row.generated) || 0,
    opened: Number(row.opened) || 0,
    success: Number(row.success) || 0,
  }));
}

const CONSENT_ANALYTICS_EVENTS = {
  consentViewed: "consent_review_viewed",
  termsAccepted: "consent_terms_accepted",
  privacyAccepted: "consent_privacy_accepted",
  consentCompleted: "consent_review_completed",
  preferencesViewed: "marketing_preferences_viewed",
  emailEnabled: "marketing_email_enabled",
  emailDisabled: "marketing_email_disabled",
  whatsappEnabled: "marketing_whatsapp_enabled",
  whatsappDisabled: "marketing_whatsapp_disabled",
  nudgeViewed: "marketing_nudge_viewed",
  nudgeAccepted: "marketing_nudge_accepted",
  nudgeSnoozed: "marketing_nudge_snoozed",
} as const;

type ConsentRoleMetrics = {
  role: string;
  consentViewedUsers: number;
  consentCompletedUsers: number;
  consentCompletionRate: number;
  marketingEmailEnabledUsers: number;
  marketingWhatsappEnabledUsers: number;
};

type NudgePromptMetrics = {
  promptKey: string;
  role: string;
  viewedUsers: number;
  acceptedUsers: number;
  snoozedUsers: number;
  acceptedAfterSnoozeUsers: number;
  snoozedWithoutAcceptUsers: number;
  acceptanceRate: number;
  snoozeRate: number;
};

export type ConsentConversionSummary = {
  rangeDays: number;
  consent: {
    viewedUsers: number;
    termsAcceptedUsers: number;
    privacyAcceptedUsers: number;
    completedUsers: number;
    completionRate: number;
    byRole: ConsentRoleMetrics[];
  };
  preferences: {
    viewedUsers: number;
    emailEnabledUsers: number;
    emailDisabledUsers: number;
    whatsappEnabledUsers: number;
    whatsappDisabledUsers: number;
  };
  nudges: {
    overall: {
      viewedUsers: number;
      acceptedUsers: number;
      snoozedUsers: number;
      acceptanceRate: number;
      snoozeRate: number;
    };
    prompts: NudgePromptMetrics[];
  };
};

function normalizeDays(days: number): number {
  return Math.max(1, Math.min(180, Math.floor(days || 30)));
}

export async function getConsentConversionSummary(
  days: number
): Promise<ConsentConversionSummary> {
  const normalizedDays = normalizeDays(days);
  const eventNames = Object.values(CONSENT_ANALYTICS_EVENTS);

  const [totalsRows, byRoleRows, promptRows] = await Promise.all([
    sequelize.query<{
      consent_viewed_users: number;
      terms_accepted_users: number;
      privacy_accepted_users: number;
      consent_completed_users: number;
      preferences_viewed_users: number;
      email_enabled_users: number;
      email_disabled_users: number;
      whatsapp_enabled_users: number;
      whatsapp_disabled_users: number;
      nudge_viewed_users: number;
      nudge_accepted_users: number;
      nudge_snoozed_users: number;
    }>(
      `
      WITH base AS (
        SELECT
          event_name,
          NULLIF(payload->>'user_id', '') AS user_id,
          COALESCE(NULLIF(payload->>'role', ''), 'unknown') AS role,
          COALESCE(NULLIF(payload->>'promptKey', ''), 'unknown') AS prompt_key
        FROM analytics_events
        WHERE event_name IN (:eventNames)
          AND created_at >= NOW() - (:days::int * INTERVAL '1 day')
      )
      SELECT
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = :consentViewed)::int    AS consent_viewed_users,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = :termsAccepted)::int    AS terms_accepted_users,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = :privacyAccepted)::int  AS privacy_accepted_users,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = :consentCompleted)::int AS consent_completed_users,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = :preferencesViewed)::int AS preferences_viewed_users,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = :emailEnabled)::int      AS email_enabled_users,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = :emailDisabled)::int     AS email_disabled_users,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = :whatsappEnabled)::int   AS whatsapp_enabled_users,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = :whatsappDisabled)::int  AS whatsapp_disabled_users,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = :nudgeViewed)::int       AS nudge_viewed_users,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = :nudgeAccepted)::int     AS nudge_accepted_users,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = :nudgeSnoozed)::int      AS nudge_snoozed_users
      FROM base
      `,
      {
        replacements: {
          days: normalizedDays,
          eventNames,
          consentViewed: CONSENT_ANALYTICS_EVENTS.consentViewed,
          termsAccepted: CONSENT_ANALYTICS_EVENTS.termsAccepted,
          privacyAccepted: CONSENT_ANALYTICS_EVENTS.privacyAccepted,
          consentCompleted: CONSENT_ANALYTICS_EVENTS.consentCompleted,
          preferencesViewed: CONSENT_ANALYTICS_EVENTS.preferencesViewed,
          emailEnabled: CONSENT_ANALYTICS_EVENTS.emailEnabled,
          emailDisabled: CONSENT_ANALYTICS_EVENTS.emailDisabled,
          whatsappEnabled: CONSENT_ANALYTICS_EVENTS.whatsappEnabled,
          whatsappDisabled: CONSENT_ANALYTICS_EVENTS.whatsappDisabled,
          nudgeViewed: CONSENT_ANALYTICS_EVENTS.nudgeViewed,
          nudgeAccepted: CONSENT_ANALYTICS_EVENTS.nudgeAccepted,
          nudgeSnoozed: CONSENT_ANALYTICS_EVENTS.nudgeSnoozed,
        },
        type: QueryTypes.SELECT,
      }
    ),
    sequelize.query<ConsentRoleMetrics>(
      `
      WITH base AS (
        SELECT
          event_name,
          NULLIF(payload->>'user_id', '') AS user_id,
          COALESCE(NULLIF(payload->>'role', ''), 'unknown') AS role
        FROM analytics_events
        WHERE event_name IN (:eventNames)
          AND created_at >= NOW() - (:days::int * INTERVAL '1 day')
      )
      SELECT
        role,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = :consentViewed)::int    AS consent_viewed_users,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = :consentCompleted)::int AS consent_completed_users,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = :emailEnabled)::int      AS marketing_email_enabled_users,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = :whatsappEnabled)::int   AS marketing_whatsapp_enabled_users
      FROM base
      GROUP BY role
      ORDER BY role ASC
      `,
      {
        replacements: {
          days: normalizedDays,
          eventNames,
          consentViewed: CONSENT_ANALYTICS_EVENTS.consentViewed,
          consentCompleted: CONSENT_ANALYTICS_EVENTS.consentCompleted,
          emailEnabled: CONSENT_ANALYTICS_EVENTS.emailEnabled,
          whatsappEnabled: CONSENT_ANALYTICS_EVENTS.whatsappEnabled,
        },
        type: QueryTypes.SELECT,
      }
    ),
    sequelize.query<{
      prompt_key: string;
      role: string;
      viewed_users: number;
      accepted_users: number;
      snoozed_users: number;
      accepted_after_snooze_users: number;
    }>(
      `
      WITH base AS (
        SELECT DISTINCT
          event_name,
          NULLIF(payload->>'user_id', '') AS user_id,
          COALESCE(NULLIF(payload->>'role', ''), 'unknown') AS role,
          COALESCE(NULLIF(payload->>'promptKey', ''), 'unknown') AS prompt_key
        FROM analytics_events
        WHERE event_name IN (:nudgeEventNames)
          AND created_at >= NOW() - (:days::int * INTERVAL '1 day')
      ),
      grouped AS (
        SELECT
          prompt_key,
          role,
          user_id,
          MAX(CASE WHEN event_name = :nudgeViewed THEN 1 ELSE 0 END)   AS viewed_flag,
          MAX(CASE WHEN event_name = :nudgeAccepted THEN 1 ELSE 0 END) AS accepted_flag,
          MAX(CASE WHEN event_name = :nudgeSnoozed THEN 1 ELSE 0 END)  AS snoozed_flag
        FROM base
        WHERE user_id IS NOT NULL
        GROUP BY prompt_key, role, user_id
      )
      SELECT
        prompt_key,
        role,
        COUNT(*) FILTER (WHERE viewed_flag = 1)::int AS viewed_users,
        COUNT(*) FILTER (WHERE accepted_flag = 1)::int AS accepted_users,
        COUNT(*) FILTER (WHERE snoozed_flag = 1)::int AS snoozed_users,
        COUNT(*) FILTER (WHERE accepted_flag = 1 AND snoozed_flag = 1)::int AS accepted_after_snooze_users
      FROM grouped
      GROUP BY prompt_key, role
      ORDER BY prompt_key ASC, role ASC
      `,
      {
        replacements: {
          days: normalizedDays,
          nudgeEventNames: [
            CONSENT_ANALYTICS_EVENTS.nudgeViewed,
            CONSENT_ANALYTICS_EVENTS.nudgeAccepted,
            CONSENT_ANALYTICS_EVENTS.nudgeSnoozed,
          ],
          nudgeViewed: CONSENT_ANALYTICS_EVENTS.nudgeViewed,
          nudgeAccepted: CONSENT_ANALYTICS_EVENTS.nudgeAccepted,
          nudgeSnoozed: CONSENT_ANALYTICS_EVENTS.nudgeSnoozed,
        },
        type: QueryTypes.SELECT,
      }
    ),
  ]);

  const totals = totalsRows[0] ?? {
    consent_viewed_users: 0,
    terms_accepted_users: 0,
    privacy_accepted_users: 0,
    consent_completed_users: 0,
    preferences_viewed_users: 0,
    email_enabled_users: 0,
    email_disabled_users: 0,
    whatsapp_enabled_users: 0,
    whatsapp_disabled_users: 0,
    nudge_viewed_users: 0,
    nudge_accepted_users: 0,
    nudge_snoozed_users: 0,
  };

  const byRole = byRoleRows.map((row: any) => {
    const viewedUsers = Number(row.consent_viewed_users) || 0;
    const completedUsers = Number(row.consent_completed_users) || 0;

    return {
      role: row.role || "unknown",
      consentViewedUsers: viewedUsers,
      consentCompletedUsers: completedUsers,
      consentCompletionRate: toPercent(completedUsers, viewedUsers),
      marketingEmailEnabledUsers: Number(row.marketing_email_enabled_users) || 0,
      marketingWhatsappEnabledUsers:
        Number(row.marketing_whatsapp_enabled_users) || 0,
    };
  });

  const prompts = promptRows.map((row) => {
    const viewedUsers = Number(row.viewed_users) || 0;
    const acceptedUsers = Number(row.accepted_users) || 0;
    const snoozedUsers = Number(row.snoozed_users) || 0;
    const acceptedAfterSnoozeUsers =
      Number(row.accepted_after_snooze_users) || 0;

    return {
      promptKey: row.prompt_key,
      role: row.role,
      viewedUsers,
      acceptedUsers,
      snoozedUsers,
      acceptedAfterSnoozeUsers,
      snoozedWithoutAcceptUsers: Math.max(
        0,
        snoozedUsers - acceptedAfterSnoozeUsers
      ),
      acceptanceRate: toPercent(acceptedUsers, viewedUsers),
      snoozeRate: toPercent(snoozedUsers, viewedUsers),
    };
  });

  const nudgeViewedUsers = Number(totals.nudge_viewed_users) || 0;
  const nudgeAcceptedUsers = Number(totals.nudge_accepted_users) || 0;
  const nudgeSnoozedUsers = Number(totals.nudge_snoozed_users) || 0;

  return {
    rangeDays: normalizedDays,
    consent: {
      viewedUsers: Number(totals.consent_viewed_users) || 0,
      termsAcceptedUsers: Number(totals.terms_accepted_users) || 0,
      privacyAcceptedUsers: Number(totals.privacy_accepted_users) || 0,
      completedUsers: Number(totals.consent_completed_users) || 0,
      completionRate: toPercent(
        Number(totals.consent_completed_users) || 0,
        Number(totals.consent_viewed_users) || 0
      ),
      byRole,
    },
    preferences: {
      viewedUsers: Number(totals.preferences_viewed_users) || 0,
      emailEnabledUsers: Number(totals.email_enabled_users) || 0,
      emailDisabledUsers: Number(totals.email_disabled_users) || 0,
      whatsappEnabledUsers: Number(totals.whatsapp_enabled_users) || 0,
      whatsappDisabledUsers: Number(totals.whatsapp_disabled_users) || 0,
    },
    nudges: {
      overall: {
        viewedUsers: nudgeViewedUsers,
        acceptedUsers: nudgeAcceptedUsers,
        snoozedUsers: nudgeSnoozedUsers,
        acceptanceRate: toPercent(nudgeAcceptedUsers, nudgeViewedUsers),
        snoozeRate: toPercent(nudgeSnoozedUsers, nudgeViewedUsers),
      },
      prompts,
    },
  };
}
