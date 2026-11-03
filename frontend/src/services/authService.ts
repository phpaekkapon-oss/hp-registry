/**
 * Client for the server-side session API (/api/auth/*).
 * The browser never sees the session id: it lives in an HttpOnly cookie.
 */
import type { EnterpriseRole } from './enterpriseService';
import { apiFetch } from './apiClient';

export interface AuthUser {
  username: string;
  displayName: string;
  role: EnterpriseRole;
  organization: string;
  /** Job title shown beside the name and printed on reports (null for the built-in accounts) */
  position: string | null;
  /** Menu ids this user may open (see backend/src/services/menus.ts) */
  menus: string[];
  source: 'builtin' | 'hosxp' | 'local';
}

/** This person's PIN / authenticator state and the idle times set by the admin */
export interface SecurityInfo {
  hasPin: boolean;
  totpEnabled: boolean;
  /** Idle minutes before the screen locks (people with a PIN) */
  lockMinutes: number;
  /** Idle minutes before signing out completely */
  logoutMinutes: number;
  /** Profile photo address (changes when the photo changes), null if none */
  avatarUrl: string | null;
  /** Recovery codes left (one-time codes for when the phone is lost) */
  backupLeft: number;
  /** The admin's 2FA policy as it applies to this person */
  twofa: { required: boolean; enforced: boolean; deadline: string | null };
  /** Days a browser that passed 2FA is trusted (0 = asked every time) */
  trustDeviceDays: number;
}

export interface SessionInfo {
  user: AuthUser;
  security: SecurityInfo;
  locked: boolean;
}

export type LoginResult =
  | ({ ok: true } & SessionInfo)
  | { ok: false; message: string; locked?: boolean; unreachable?: boolean; totpTicket?: string };

export interface ProviderButton {
  id: 'thaid' | 'providerid';
  label: string;
}

/** Everything stored on this device that may contain patient data or drafts */
const SENSITIVE_STORAGE_KEYS = [
  'his_egov_users_db_v1',
  'his_egov_outbox_queue_v1',
  'his_egov_user_form_draft_v1',
];
const CACHE_OWNER_KEY = 'his_egov_cache_owner';

export function clearLocalCaches(): void {
  try {
    for (const key of SENSITIVE_STORAGE_KEYS) localStorage.removeItem(key);
    localStorage.removeItem(CACHE_OWNER_KEY);
  } catch {
    // Storage may be unavailable (private mode); nothing to clear
  }
}

/** If a different person signs in on the same device, drop the previous person's cached data. */
export function claimLocalCache(username: string): void {
  try {
    const owner = localStorage.getItem(CACHE_OWNER_KEY);
    if (owner && owner !== username) clearLocalCaches();
    localStorage.setItem(CACHE_OWNER_KEY, username);
  } catch {
    // ignore
  }
}

const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function readLogin(res: Response): Promise<LoginResult> {
  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    if (body.data?.totpRequired) return { ok: false, message: '', totpTicket: body.data.ticket as string };
    return { ok: true, ...(body.data as SessionInfo) };
  }
  return {
    ok: false,
    message: body.message ?? 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
    locked: res.status === 429 && body.code === 'LOCKED',
    // The ticket is gone (expired / too many tries): the caller must go back to the password step
    totpTicket: undefined,
  };
}

const UNREACHABLE: LoginResult = { ok: false, unreachable: true, message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่' };

export const authService = {
  /** @returns the session, `null` if there is no session, `undefined` if the server cannot be reached */
  async me(): Promise<SessionInfo | null | undefined> {
    try {
      const res = await fetch('/api/auth/me');
      if (res.status === 401) return null;
      if (!res.ok) return undefined;
      return (await res.json()).data as SessionInfo;
    } catch {
      return undefined;
    }
  },

  async login(username: string, password: string): Promise<LoginResult> {
    try {
      return await readLogin(await fetch('/api/auth/login', json({ username, password })));
    } catch {
      return UNREACHABLE;
    }
  },

  /** Second step for accounts protected by Google Authenticator */
  async loginTotp(ticket: string, code: string, remember = false): Promise<LoginResult & { expired?: boolean }> {
    try {
      const res = await fetch('/api/auth/login/totp', json({ ticket, code, remember }));
      const result = await readLogin(res.clone());
      if (result.ok) return result;
      const body = await res.json().catch(() => ({}));
      return { ...result, totpTicket: body.code === 'BAD_TOTP' ? ticket : undefined, expired: body.code === 'TICKET_EXPIRED' };
    } catch {
      return UNREACHABLE;
    }
  },

  /** Sign-in buttons the admin has switched on (ThaID, Provider ID) and how long a browser may be remembered after 2FA */
  async publicConfig(): Promise<{ providers: ProviderButton[]; trustDeviceDays: number }> {
    try {
      const res = await fetch('/api/auth/config');
      if (!res.ok) return { providers: [], trustDeviceDays: 0 };
      const d = (await res.json()).data;
      return { providers: (d.providers ?? []) as ProviderButton[], trustDeviceDays: Number(d.trustDeviceDays ?? 0) };
    } catch {
      return { providers: [], trustDeviceDays: 0 };
    }
  },

  async logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // The server session will expire on its own; local state is cleared regardless
    }
  },

  async lock(): Promise<boolean> {
    try {
      return (await apiFetch('/api/auth/lock', { method: 'POST' })).ok;
    } catch {
      return false;
    }
  },

  /** @returns null when unlocked, otherwise the message to show (`ended` = too many wrong PINs, the session is gone) */
  async unlock(pin: string): Promise<{ ok: true } | { ok: false; message: string; ended?: boolean }> {
    try {
      const res = await fetch('/api/auth/unlock', json({ pin }));
      if (res.ok) return { ok: true };
      const body = await res.json().catch(() => ({}));
      return { ok: false, message: body.message ?? 'ปลดล็อกไม่สำเร็จ', ended: res.status === 401 && body.code === 'UNAUTHENTICATED' };
    } catch {
      return { ok: false, message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่' };
    }
  },
};

/** First consonant for avatars. Thai leading vowels (เ แ โ ใ ไ) are not a sensible initial on their own. */
export function initialOf(name: string): string {
  return Array.from(name.replace(/^[เแโใไ]+/, ''))[0] ?? '?';
}
