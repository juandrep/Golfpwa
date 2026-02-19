import { apiClient, type AnalyticsEventPayload } from '../data';

export async function trackAppEvent(payload: AnalyticsEventPayload): Promise<void> {
  try {
    await apiClient.trackEvent(payload);
  } catch {
    // analytics is best-effort only
  }
}
