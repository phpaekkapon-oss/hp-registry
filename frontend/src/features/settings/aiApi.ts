import { apiFetch, resolveApiUrl } from '../../services/apiClient';

export interface AiKeyInfo {
  id: string;
  label: string;
  last4: string;
  addedAt: string;
  addedBy: string;
}

export interface AiSettings {
  enabled: boolean;
  models: string[];
  keys: AiKeyInfo[];
}

export interface AiAttempt {
  id: number;
  at: string;
  requestId: string;
  purpose: string;
  model: string;
  keyLast4: string;
  ok: boolean;
  httpStatus: number | null;
  latencyMs: number;
  tokens: number | null;
  error: string | null;
  runBy: string;
}

export interface AiTestResult {
  model: string;
  ok: boolean;
  latencyMs: number;
  error: string | null;
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

export const aiApi = {
  settings: () => call<AiSettings>('GET', '/api/ai/settings'),
  save: (enabled: boolean, models: string[]) => call<AiSettings>('PUT', '/api/ai/settings', { enabled, models }),
  addKey: (key: string, label: string) => call<AiSettings>('POST', '/api/ai/keys', { key, label }),
  removeKey: (id: string) => call<AiSettings>('DELETE', `/api/ai/keys/${encodeURIComponent(id)}`),
  test: () => call<AiTestResult[]>('POST', '/api/ai/test'),
  logs: (limit = 50) => call<AiAttempt[]>('GET', `/api/ai/logs?limit=${limit}`),
  /** Live attempts as they happen (Server-Sent Events) */
  live: (onAttempt: (a: AiAttempt) => void): (() => void) => {
    const source = new EventSource(resolveApiUrl('/api/ai/live'));
    source.onmessage = (e) => {
      try {
        onAttempt(JSON.parse(e.data) as AiAttempt);
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => source.close();
  },
};
