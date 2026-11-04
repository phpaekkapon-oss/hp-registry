import { apiFetch } from '../../services/apiClient';

export interface AuditEntry {
  id: number;
  at: string;
  actor: string;
  actorName: string | null;
  action: string;
  resource: string;
  recordId: string | null;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
}

export interface AuditQuery {
  q?: string;
  action?: string;
  resource?: string;
  actor?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface NotificationItem {
  id: number;
  at: string;
  actor: string;
  actorName: string;
  action: string;
  resource: string;
  recordId: string | null;
  summary: string;
  unread: boolean;
}

export interface NotificationAlert {
  key: string;
  tone: 'bad' | 'warn';
  text: string;
  count: number;
  /** Register to open when clicked */
  tab: string;
  /** Not seen yet by this user, or its count went up since */
  isNew?: boolean;
}

export interface NotificationPrefs {
  /** Registers that do not notify this user (history still shows them) */
  muted: string[];
  /** Count new "ต้องดำเนินการ" alerts on the bell */
  badgeAlerts: boolean;
}

export interface NotificationHistory {
  items: NotificationItem[];
  total: number;
  page: number;
  size: number;
}

export interface NotificationData {
  unread: number;
  /** Alerts this user has not seen yet (0 when they chose not to count alerts) */
  newAlerts: number;
  items: NotificationItem[];
  alerts: NotificationAlert[];
  prefs: NotificationPrefs;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: { success?: boolean; data?: T; message?: string } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok || !json?.success) throw new Error(json?.message ?? `เกิดข้อผิดพลาด (${res.status})`);
  return json.data as T;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
};

export const auditApi = {
  list: (query: AuditQuery) => request<{ rows: AuditEntry[]; total: number; actors: string[] }>('GET', `/api/audit${qs({ ...query })}`),
  record: (resource: string, id: number | string) => request<AuditEntry[]>('GET', `/api/audit/record${qs({ resource, id })}`),
  notifications: () => request<NotificationData>('GET', '/api/notifications'),
  markRead: () => request<null>('POST', '/api/notifications/read'),
  notificationHistory: (query: { page: number; size: number; resource?: string; action?: string; q?: string; unread?: boolean }) =>
    request<NotificationHistory>('GET', `/api/notifications/history${qs({ ...query, unread: query.unread ? 1 : undefined })}`),
  saveNotificationPrefs: (prefs: NotificationPrefs) => request<NotificationPrefs>('PUT', '/api/notifications/prefs', prefs),
};
