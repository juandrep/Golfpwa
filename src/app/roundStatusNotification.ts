export interface RoundStatusNotificationPayload {
  roundId: string;
  courseName: string;
  holeNumber: number;
  holesTotal: number;
  holePar?: number;
  holeStrokes: number;
  totalStrokes: number;
}

const ROUND_STATUS_NOTIFICATION_TAG = 'greencaddie-round-status';

function supportsNotifications(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;

  try {
    return await Promise.race<ServiceWorkerRegistration | null>([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), 1200);
      }),
    ]);
  } catch {
    return null;
  }
}

function buildBody(payload: RoundStatusNotificationPayload): string {
  const parSegment = Number.isFinite(payload.holePar) ? `Par ${payload.holePar}` : '';
  const holeSegment = `Hole ${payload.holeNumber}/${payload.holesTotal}`;
  const strokesSegment = `Strokes ${payload.holeStrokes}`;
  const totalSegment = `Total ${payload.totalStrokes}`;
  return [holeSegment, parSegment, strokesSegment, totalSegment].filter(Boolean).join(' · ');
}

export async function requestRoundStatusNotificationPermission(): Promise<NotificationPermission | null> {
  if (!supportsNotifications()) return null;
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function showRoundStatusNotification(payload: RoundStatusNotificationPayload): Promise<void> {
  if (!supportsNotifications() || Notification.permission !== 'granted') return;

  const options: NotificationOptions = {
    body: buildBody(payload),
    tag: ROUND_STATUS_NOTIFICATION_TAG,
    renotify: false,
    requireInteraction: true,
    silent: true,
    icon: '/android-chrome-192x192.png',
    badge: '/favicon-32x32.png',
    data: {
      path: '/enter-score',
      roundId: payload.roundId,
    },
  };

  const registration = await getServiceWorkerRegistration();
  if (registration && typeof registration.showNotification === 'function') {
    await registration.showNotification(`${payload.courseName} · Live Round`, options);
    return;
  }

  // Fallback for environments where SW notification display is unavailable.
  new Notification(`${payload.courseName} · Live Round`, options);
}

export async function closeRoundStatusNotification(): Promise<void> {
  const registration = await getServiceWorkerRegistration();
  if (!registration || typeof registration.getNotifications !== 'function') return;
  const notices = await registration.getNotifications({ tag: ROUND_STATUS_NOTIFICATION_TAG });
  notices.forEach((notice) => notice.close());
}
