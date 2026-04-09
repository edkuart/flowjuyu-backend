import AnalyticsEvent from "../../models/AnalyticsEvent.model";

export type AnalyticsPayload = Record<string, unknown>;

export type TrackEventInput = {
  event: string;
  sellerId?: number | null;
  payload?: AnalyticsPayload | null;
};

export async function trackEvent(input: TrackEventInput): Promise<void> {
  try {
    const event = String(input.event || "").trim();

    if (!event) {
      return;
    }

    await AnalyticsEvent.create({
      event_name: event,
      seller_id: Number.isFinite(input.sellerId) ? Number(input.sellerId) : null,
      payload: input.payload ?? null,
    });
  } catch (error) {
    console.warn(
      "[analytics-events] Failed to persist event:",
      error instanceof Error ? error.message : error
    );
  }
}
