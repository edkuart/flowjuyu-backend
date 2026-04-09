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
