import crypto from 'crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from './mysql';

/**
 * System settings kept in the database (app_settings), plus AES-GCM helpers so secrets
 * (OAuth client secrets, TOTP seeds) are never stored in plain text.
 * The key comes from SECRETS_KEY in backend/.env (falls back to a key derived from the DB password).
 */

const KEY = crypto.scryptSync(process.env.SECRETS_KEY || process.env.DB_PASSWORD || 'hp-registry', 'hp-registry-settings', 32);

/** Signed, tamper-proof tokens (used for the "remember this device" cookie) */
const SIGN_KEY = crypto.createHmac('sha256', KEY).update('signed-tokens').digest();
export function signToken(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', SIGN_KEY).update(body).digest('base64url')}`;
}
export function verifyToken<T = Record<string, unknown>>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SIGN_KEY).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptSecret(stored: string): string | null {
  try {
    const [v, iv, tag, data] = stored.split(':');
    if (v !== 'v1') return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export interface SecuritySettings {
  /** Idle minutes before the screen locks (only for people who set a PIN) */
  lockMinutes: number;
  /** Idle minutes before the person is signed out completely */
  logoutMinutes: number;
  /** Public address of this site, used to build the ThaID/ProviderID redirect URI (e.g. https://procure.example.go.th) */
  publicUrl: string;
  /** Who must use Google Authenticator: nobody, admins only, or everybody */
  twofaPolicy: 'off' | 'admins' | 'all';
  /** Days a person may keep using the system without it after the policy starts (0 = must set it up at once) */
  twofaGraceDays: number;
  /** Days a browser that passed 2FA is trusted (0 = ask every time) */
  trustDeviceDays: number;
  /** When the policy was switched on (ISO): the grace period counts from here */
  twofaSince: string;
}

export const DEFAULT_SECURITY: SecuritySettings = { lockMinutes: 5, logoutMinutes: 30, publicUrl: '', twofaPolicy: 'off', twofaGraceDays: 7, trustDeviceDays: 0, twofaSince: '' };

export interface ProviderConfig {
  enabled: boolean;
  clientId: string;
  /** AES-GCM encrypted */
  clientSecretEnc: string;
  authUrl: string;
  tokenUrl: string;
  /** Optional: asked for the citizen ID when the token response does not carry it */
  userinfoUrl: string;
  scope: string;
  /** Name of the field holding the 13-digit citizen ID in the token/userinfo response */
  pidField: string;
}

export type ProviderId = 'thaid' | 'providerid';
export type ProviderSettings = Record<ProviderId, ProviderConfig>;

export const PROVIDER_LABEL: Record<ProviderId, string> = { thaid: 'ThaID', providerid: 'Provider ID' };

export const DEFAULT_PROVIDERS: ProviderSettings = {
  thaid: {
    enabled: false, clientId: '', clientSecretEnc: '',
    authUrl: 'https://imauth.bora.dopa.go.th/api/v2/oauth2/auth/',
    tokenUrl: 'https://imauth.bora.dopa.go.th/api/v2/oauth2/token/',
    userinfoUrl: '', scope: 'pid', pidField: 'pid',
  },
  providerid: {
    enabled: false, clientId: '', clientSecretEnc: '', authUrl: '', tokenUrl: '', userinfoUrl: '', scope: '', pidField: 'pid',
  },
};

let security: SecuritySettings = { ...DEFAULT_SECURITY };
let providers: ProviderSettings = structuredClone(DEFAULT_PROVIDERS);

async function read<T>(key: string): Promise<T | null> {
  const [rows] = await getPool().query<RowDataPacket[]>('SELECT svalue FROM app_settings WHERE skey = ?', [key]);
  if (!rows[0]) return null;
  try {
    return JSON.parse(rows[0].svalue) as T;
  } catch {
    return null;
  }
}

async function write(key: string, value: unknown, by: string): Promise<void> {
  await getPool().query(
    'INSERT INTO app_settings (skey, svalue, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE svalue = VALUES(svalue), updated_by = VALUES(updated_by)',
    [key, JSON.stringify(value), by]);
}

/** Load settings into memory (the session layer reads them on every request, so they must be synchronous) */
export async function loadSettings(): Promise<void> {
  security = { ...DEFAULT_SECURITY, ...((await read<Partial<SecuritySettings>>('security')) ?? {}) };
  const stored = (await read<Partial<ProviderSettings>>('providers')) ?? {};
  providers = {
    thaid: { ...DEFAULT_PROVIDERS.thaid, ...stored.thaid },
    providerid: { ...DEFAULT_PROVIDERS.providerid, ...stored.providerid },
  };
}

export const getSecuritySettings = (): SecuritySettings => security;
export const getProviders = (): ProviderSettings => providers;

export async function saveSecuritySettings(next: SecuritySettings, by: string): Promise<void> {
  await write('security', next, by);
  security = next;
}

export async function saveProviders(next: ProviderSettings, by: string): Promise<void> {
  await write('providers', next, by);
  providers = next;
}

/** A provider is usable only when it is switched on and has everything the sign-in flow needs */
export const providerReady = (p: ProviderConfig): boolean => p.enabled && Boolean(p.clientId && p.clientSecretEnc && p.authUrl && p.tokenUrl);

loadSettings().catch((e) => console.error('[settings] could not load, using defaults:', (e as Error).message));
