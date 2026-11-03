import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeLive } from '../procure/live';
import { auditApi, type NotificationData } from './api';

const POLL_MS = 60_000;

/**
 * The bell's data: other people's changes (with unread tracking) and conditions needing attention.
 * Reloads when anything changes (live stream), every minute, and when the tab is shown again.
 */
export function useNotifications(enabled = true) {
  const [data, setData] = useState<NotificationData | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await auditApi.notifications();
      if (alive.current) setData(next);
    } catch {
      /* the bell just keeps its last content; the connection pill already tells the user about outages */
    }
  }, []);

  const markRead = useCallback(async () => {
    setData((d) => (d ? { ...d, unread: 0, items: d.items.map((i) => ({ ...i, unread: false })) } : d));
    try {
      await auditApi.markRead();
    } catch {
      void refresh();
    }
  }, [refresh]);

  useEffect(() => {
    alive.current = true;
    if (!enabled) return;
    void refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 500);
    };
    const off = subscribeLive(soon);
    const poll = setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      off();
      clearInterval(poll);
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refresh]);

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
