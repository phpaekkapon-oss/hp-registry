import { apiFetch, resolveApiUrl } from '../../services/apiClient';

export interface SystemStatus {
  procure: { ok: boolean; database: string; host: string | null; latencyMs: number | null; tables: number | null; error: string | null };
  hosxp: {
    configured: boolean;
    ok: boolean;
    host: string | null;
    database: string | null;
    user: string | null;
    latencyMs: number | null;
    error: string | null;
    /** The configured account can change data in HOSxP (this app only needs to read) */
    canWrite: boolean | null;
    grants: string[];
  };
  lastSync: { at: string; status: string; users: number | null; by: string | null } | null;
}

export interface BackupFile {
  name: string;
  bytes: number;
  at: string;
}

export interface BackupPolicy {
  autoBackup: boolean;
  /** HH:MM Thailand time */
  time: string;
  /** 0 = never delete by age */
  keepDays: number;
  keepCount: number;
}

export interface BackupOverview {
  files: BackupFile[];
  /** Folder on the server */
  dir: string;
  totalBytes: number;
  policy: BackupPolicy;
  pruneCandidates: string[];
  /** The server makes the daily backup itself (production only) */
  schedulerActive: boolean;
  lastAutoRun: { at: string; ok: boolean; message: string } | null;
}

export interface About {
  version: string;
  startedAt: string;
  uptimeSeconds: number;
  environment: 'production' | 'development';
  node: string;
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.message ?? `เกิดข้อผิดพลาด (${res.status})`);
  return json.data as T;
}

export const systemApi = {
  about: () => call<About>('GET', '/api/system/about'),
  status: () => call<SystemStatus>('GET', '/api/system/status'),
  backups: () => call<BackupOverview>('GET', '/api/system/backups'),
  runBackup: () => call<{ file: string; tables: number; rows: number; bytes: number; removed: number; overview: BackupOverview }>('POST', '/api/system/backups/run'),
  saveBackupPolicy: (p: BackupPolicy) => call<BackupOverview>('PUT', '/api/system/backups/policy', p),
  deleteBackups: (names: string[]) => call<{ removed: number; overview: BackupOverview }>('POST', '/api/system/backups/delete', { names }),
  backupFileUrl: (name: string) => resolveApiUrl(`/api/system/backups/file/${encodeURIComponent(name)}`),
};

export type LookupKind = 'staff' | 'group' | 'fund' | 'method' | 'status' | 'unit';
export interface LookupItem {
  id: number;
  value: string;
  /** Live records that currently use this text */
  usage: number;
}
export type LookupData = Record<LookupKind, { label: string; items: LookupItem[] }>;

async function send<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.message ?? `เกิดข้อผิดพลาด (${res.status})`);
  return json.data as T;
}

export const lookupApi = {
  list: () => send<LookupData>('GET', '/api/system/lookups'),
  add: (kind: LookupKind, value: string) => send<{ id: number }>('POST', '/api/system/lookups', { kind, value }),
  rename: (id: number, value: string, applyToRecords: boolean) => send<{ updatedRecords: number }>('PUT', `/api/system/lookups/${id}`, { value, applyToRecords }),
  reorder: (kind: LookupKind, ids: number[]) => send<void>('PUT', '/api/system/lookups/order', { kind, ids }),
  remove: (id: number) => send<void>('DELETE', `/api/system/lookups/${id}`),
};
