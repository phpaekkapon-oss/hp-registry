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
}

export interface NotificationData {
  unread: number;
  items: NotificationItem[];
  alerts: NotificationAlert[];
}

async function request<T>(method: string, url: string): Promise<T> {
  const res = await apiFetch(url, { method });
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
};
