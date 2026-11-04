import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeLive } from '../procure/live';
import { auditApi, type NotificationData } from './api';

const POLL_MS = 60_000;

// One shared copy for every component that shows notifications (bell, notification centre),
// so marking as read in one place clears the badge everywhere at once
let shared: NotificationData | null = null;
const listeners = new Set<(d: NotificationData | null) => void>();
const publish = (d: NotificationData | null) => {
  shared = d;
  for (const l of listeners) l(d);
};

async function refreshShared(): Promise<void> {
  try {
    publish(await auditApi.notifications());
  } catch {
    /* the bell just keeps its last content; the connection pill already tells the user about outages */
  }
}

/**
 * The bell's data: other people's changes (with unread tracking) and conditions needing attention.
 * Reloads when anything changes (live stream), every minute, and when the tab is shown again.
 */
export function useNotifications(enabled = true) {
  const [data, setData] = useState<NotificationData | null>(shared);
  const alive = useRef(true);

  const refresh = useCallback(() => refreshShared(), []);

  const markRead = useCallback(async () => {
    if (shared) publish({ ...shared, unread: 0, newAlerts: 0, items: shared.items.map((i) => ({ ...i, unread: false })), alerts: shared.alerts.map((a) => ({ ...a, isNew: false })) });
    try {
      await auditApi.markRead();
    } catch {
      /* fall through to a reload, which shows the real state */
    }
    await refreshShared();
  }, []);

  useEffect(() => {
    alive.current = true;
    const listener = (d: NotificationData | null) => {
      if (alive.current) setData(d);
    };
    listeners.add(listener);
    if (!enabled) {
      return () => {
        alive.current = false;
        listeners.delete(listener);
      };
    }
    void refreshShared();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refreshShared(), 500);
    };
    const off = subscribeLive(soon);
    const poll = setInterval(() => {
      if (!document.hidden) void refreshShared();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void refreshShared();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      listeners.delete(listener);
      off();
      clearInterval(poll);
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);

  return { data, refresh, markRead };
}

const rtf = typeof Intl !== 'undefined' && 'RelativeTimeFormat' in Intl ? new Intl.RelativeTimeFormat('th', { numeric: 'auto' }) : null;

/** "5 นาทีที่แล้ว" */
export function timeAgo(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (!rtf) return new Date(iso).toLocaleString('th-TH');
  if (abs < 60) return 'เมื่อสักครู่';
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86400), 'day');
}
