import { apiFetch } from '../../services/apiClient';
import type { SecurityInfo } from '../../services/authService';

export interface ProviderAdmin {
  id: 'thaid' | 'providerid';
  label: string;
  enabled: boolean;
  clientId: string;
  /** The secret itself is never sent back; this only says whether one is stored */
  hasSecret: boolean;
  /** Switched on AND every required field filled in: only then does the sign-in actually work */
  ready: boolean;
  authUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  scope: string;
  pidField: string;
  /** Address to register with the provider as the callback */
  redirectUri: string;
}

export type TwofaPolicy = 'off' | 'admins' | 'all';

export interface TwofaUser {
  username: string;
  displayName: string;
  role: 'Admin' | 'Doctor' | 'Staff';
  source: 'builtin' | 'hosxp';
  totpEnabled: boolean;
  hasPin: boolean;
  lastTotpAt: string | null;
  /** Policy asks this person for 2FA and they have not set it up */
  required: boolean;
}

export interface TwofaOverview {
  policy: TwofaPolicy;
  graceDays: number;
  trustDeviceDays: number;
  since: string | null;
  counts: { enabled: number; pending: number; total: number };
  users: TwofaUser[];
}

export interface SecurityLogRow {
  id: number;
  at: string;
  actor: string;
  actorName: string;
  action: string;
  summary: string;
}

export interface SessionRow {
  ref: string;
  current: boolean;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastSeen: string;
}

export interface AdminSecurity {
  security: { lockMinutes: number; logoutMinutes: number; publicUrl: string; twofaPolicy: TwofaPolicy; twofaGraceDays: number; trustDeviceDays: number };
  providers: ProviderAdmin[];
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

export const securityApi = {
  state: () => call<SecurityInfo>('GET', '/api/auth/security'),
  setPin: (pin: string, currentPin?: string) => call<SecurityInfo>('PUT', '/api/auth/pin', { pin, currentPin }),
  removePin: (pin: string) => call<SecurityInfo>('DELETE', '/api/auth/pin', { pin }),
  totpSetup: () => call<{ secret: string; uri: string }>('POST', '/api/auth/totp/setup'),
  totpEnable: (code: string) => call<SecurityInfo & { backupCodes: string[] }>('POST', '/api/auth/totp/enable', { code }),
  newBackupCodes: () => call<SecurityInfo & { backupCodes: string[] }>('POST', '/api/auth/totp/backup-codes'),
  clearTrustedDevices: () => call<null>('DELETE', '/api/auth/trusted-devices'),
  totpDisable: (code: string) => call<SecurityInfo>('POST', '/api/auth/totp/disable', { code }),

  /** The browser has already cropped and shrunk the photo (see AvatarSection) */
  uploadAvatar: async (blob: Blob): Promise<SecurityInfo> => {
    const res = await apiFetch('/api/auth/avatar', { method: 'PUT', headers: { 'Content-Type': blob.type || 'image/jpeg' }, body: blob });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(json?.message ?? (res.status === 413 ? 'ไฟล์ใหญ่เกินไป' : `อัปโหลดไม่สำเร็จ (${res.status})`));
    return json.data as SecurityInfo;
  },
  removeAvatar: () => call<SecurityInfo>('DELETE', '/api/auth/avatar'),

  /** Members added by an admin (not from HOSxP) change their own password */
  changePassword: (current: string, next: string) => call<{ signedOut: number }>('POST', '/api/auth/password', { current, next }),

  sessions: () => call<SessionRow[]>('GET', '/api/auth/sessions'),
  /** One other device, or every other device when `ref` is null */
  revokeSessions: (ref: string | null) => call<{ revoked: number }>('DELETE', ref ? `/api/auth/sessions/${ref}` : '/api/auth/sessions'),

  adminGet: () => call<AdminSecurity>('GET', '/api/auth/admin/settings'),
  adminSave: (body: {
    lockMinutes?: number;
    logoutMinutes?: number;
    publicUrl?: string;
    twofaPolicy?: TwofaPolicy;
    twofaGraceDays?: number;
    trustDeviceDays?: number;
    providers?: Record<string, Partial<ProviderAdmin> & { clientSecret?: string }>;
  }) => call<AdminSecurity>('PUT', '/api/auth/admin/settings', body),
  adminReset: (username: string, only?: 'totp') => call<{ reset: boolean }>('POST', '/api/auth/admin/reset-security', { username, only }),
  twofaOverview: () => call<TwofaOverview>('GET', '/api/auth/admin/twofa'),
  securityLog: () => call<SecurityLogRow[]>('GET', '/api/auth/admin/security-log'),
};
