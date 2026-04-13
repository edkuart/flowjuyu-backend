import type { RequestHandler } from "express";
import {
  getConsentConversionSummary,
  getConversionRates,
  getEventsByDay,
  getFunnelStats,
} from "../services/analytics/analyticsQuery.service";

export const getAdminAnalyticsFunnel: RequestHandler = async (_req, res) => {
  const data = await getFunnelStats();
  res.json({ ok: true, data });
};

export const getAdminAnalyticsConversion: RequestHandler = async (_req, res) => {
  const data = await getConversionRates();
  res.json({ ok: true, data });
};

export const getAdminAnalyticsTimeseries: RequestHandler = async (req, res) => {
  const days = Number(req.query.days || 14);
  const data = await getEventsByDay(days);
  res.json({ ok: true, data, meta: { days: Math.max(1, Math.min(90, Math.floor(days || 14))) } });
};

export const getAdminConsentConversion: RequestHandler = async (req, res) => {
  const days = Number(req.query.days || 30);
  const data = await getConsentConversionSummary(days);
  res.json({ ok: true, data, meta: { days: data.rangeDays } });
};
