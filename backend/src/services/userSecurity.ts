import crypto from 'crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from './mysql';
import { decryptSecret, encryptSecret } from './settings';

/** Per-user PIN (screen lock) and Google Authenticator (TOTP, RFC 6238). Works for built-in and HOSxP accounts alike. */

const db = () => getPool();

export interface UserSecurityState {
  hasPin: boolean;
  totpEnabled: boolean;
  /** When the profile photo was last changed (ms since epoch), null if none */
  avatarAt: number | null;
  /** Unused recovery codes left */
  backupLeft: number;
  /** Changes when "forget remembered devices" is used */
  trustEpoch: number;
}

function parseCodes(raw: unknown): string[] {
  try {
    const v = raw ? JSON.parse(String(raw)) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function securityState(username: string): Promise<UserSecurityState> {
  const [rows] = await db().query<RowDataPacket[]>('SELECT pin_hash, totp_enabled, backup_codes, trust_epoch FROM user_security WHERE username = ?', [username]);
  const [photo] = await db().query<RowDataPacket[]>('SELECT updated_at FROM user_profiles WHERE username = ? AND avatar IS NOT NULL', [username]);
  return { hasPin: Boolean(rows[0]?.pin_hash), totpEnabled: Boolean(rows[0]?.totp_enabled), avatarAt: photo[0]?.updated_at ? new Date(photo[0].updated_at).getTime() : null, backupLeft: parseCodes(rows[0]?.backup_codes).length, trustEpoch: Number(rows[0]?.trust_epoch ?? 0) };
}

// ---------------------------------------------------------------------------
// PIN
// ---------------------------------------------------------------------------

export const PIN_PATTERN = /^\d{4,6}$/;

/** Rejects the PINs everybody tries first */
export function weakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;
  return ['1234', '4321', '12345', '54321', '123456', '654321', '0123', '2580'].includes(pin);
}

const hashPin = (pin: string, salt: string) => crypto.scryptSync(pin, salt, 32).toString('hex');

export async function setPin(username: string, pin: string): Promise<void> {
  const salt = crypto.randomBytes(16).toString('hex');
  await db().query(
    'INSERT INTO user_security (username, pin_hash, pin_set_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE pin_hash = VALUES(pin_hash), pin_set_at = NOW()',
    [username, `${salt}:${hashPin(pin, salt)}`]);
}

export async function verifyPin(username: string, pin: string): Promise<boolean> {
  const [rows] = await db().query<RowDataPacket[]>('SELECT pin_hash FROM user_security WHERE username = ?', [username]);
  const stored = rows[0]?.pin_hash as string | undefined;
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const a = Buffer.from(hashPin(pin, salt), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function clearPin(username: string): Promise<void> {
  await db().query('UPDATE user_security SET pin_hash = NULL, pin_set_at = NULL WHERE username = ?', [username]);
}

// ---------------------------------------------------------------------------
// TOTP
// ---------------------------------------------------------------------------

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

const STEP_SECONDS = 30;

function codeAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const bin = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

/** @returns the time step the code belongs to (±1 step of clock drift allowed), or null if it is wrong */
export function matchTotp(secret: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 1000 / STEP_SECONDS);
  for (const step of [current, current - 1, current + 1]) {
    const expected = Buffer.from(codeAt(secret, step));
    const given = Buffer.from(code);
    if (crypto.timingSafeEqual(expected, given)) return step;
  }
  return null;
}

export const otpauthUri = (username: string, secret: string) =>
  `otpauth://totp/${encodeURIComponent(`ระบบงานพัสดุ:${username}`)}?secret=${secret}&issuer=${encodeURIComponent('ระบบงานพัสดุ')}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;

/** Create (or replace) a pending secret; it only protects the account once the user proves it works with {@link enableTotp} */
export async function beginTotp(username: string): Promise<{ secret: string; uri: string }> {
  const secret = base32Encode(crypto.randomBytes(20));
  await db().query(
    'INSERT INTO user_security (username, totp_secret, totp_enabled, totp_last_step) VALUES (?, ?, 0, NULL) ON DUPLICATE KEY UPDATE totp_secret = VALUES(totp_secret), totp_enabled = 0, totp_last_step = NULL',
    [username, encryptSecret(secret)]);
  return { secret, uri: otpauthUri(username, secret) };
}

async function loadTotp(username: string): Promise<{ secret: string; enabled: boolean; lastStep: number | null } | null> {
  const [rows] = await db().query<RowDataPacket[]>('SELECT totp_secret, totp_enabled, totp_last_step FROM user_security WHERE username = ?', [username]);
  const r = rows[0];
  if (!r?.totp_secret) return null;
  const secret = decryptSecret(r.totp_secret);
  if (!secret) return null;
  return { secret, enabled: Boolean(r.totp_enabled), lastStep: r.totp_last_step === null ? null : Number(r.totp_last_step) };
}

/** Check a code for an account (a code can be used only once) */
export async function verifyTotp(username: string, code: string, opts: { pending?: boolean } = {}): Promise<boolean> {
  const t = await loadTotp(username);
  if (!t || (!opts.pending && !t.enabled)) return false;
  const step = matchTotp(t.secret, code);
  if (step === null || (t.lastStep !== null && step <= t.lastStep)) return false;
  await db().query('UPDATE user_security SET totp_last_step = ? WHERE username = ?', [step, username]);
  return true;
}

export async function enableTotp(username: string, code: string): Promise<boolean> {
  if (!(await verifyTotp(username, code, { pending: true }))) return false;
  await db().query('UPDATE user_security SET totp_enabled = 1 WHERE username = ?', [username]);
  return true;
}

export async function disableTotp(username: string): Promise<void> {
  await db().query('UPDATE user_security SET totp_secret = NULL, totp_enabled = 0, totp_last_step = NULL, backup_codes = NULL, trust_epoch = trust_epoch + 1 WHERE username = ?', [username]);
}

// ---------------------------------------------------------------------------
// Recovery codes: ten one-time codes for when the phone is lost
// ---------------------------------------------------------------------------

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const BACKUP_CODE_PATTERN = /^[a-z2-9]{4}-?[a-z2-9]{4}$/i;
const hashCode = (code: string) => crypto.createHash('sha256').update(code.replace(/-/g, '').toLowerCase()).digest('hex');

/** Replace the recovery codes; the plain codes are returned once and only their hashes are kept */
export async function generateBackupCodes(username: string): Promise<string[]> {
  const codes = Array.from({ length: 10 }, () => {
    const raw = Array.from(crypto.randomBytes(8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
  await db().query('UPDATE user_security SET backup_codes = ? WHERE username = ?', [JSON.stringify(codes.map(hashCode)), username]);
  return codes;
}

/** Use a recovery code (each works once). */
export async function consumeBackupCode(username: string, code: string): Promise<boolean> {
  if (!BACKUP_CODE_PATTERN.test(code)) return false;
  const [rows] = await db().query<RowDataPacket[]>('SELECT backup_codes FROM user_security WHERE username = ?', [username]);
  const list = parseCodes(rows[0]?.backup_codes);
  const h = hashCode(code);
  const i = list.findIndex((x) => x.length === h.length && crypto.timingSafeEqual(Buffer.from(x), Buffer.from(h)));
  if (i < 0) return false;
  list.splice(i, 1);
  await db().query('UPDATE user_security SET backup_codes = ? WHERE username = ?', [JSON.stringify(list), username]);
  return true;
}

/** Make every "remember this device" cookie of this person invalid */
export async function forgetTrustedDevices(username: string): Promise<void> {
  await db().query('INSERT INTO user_security (username, trust_epoch) VALUES (?, 1) ON DUPLICATE KEY UPDATE trust_epoch = trust_epoch + 1', [username]);
}

export interface SecurityUserRow {
  username: string;
  totpEnabled: boolean;
  hasPin: boolean;
  /** Last time a code was accepted (ms since epoch), null if never */
  lastTotpAt: number | null;
}

export async function securityRows(): Promise<Map<string, SecurityUserRow>> {
  const [rows] = await db().query<RowDataPacket[]>('SELECT username, totp_enabled, pin_hash, totp_last_step FROM user_security');
  return new Map(rows.map((r) => [r.username as string, { username: r.username as string, totpEnabled: Boolean(r.totp_enabled), hasPin: Boolean(r.pin_hash), lastTotpAt: r.totp_last_step === null ? null : Number(r.totp_last_step) * 30_000 }]));
}

/** Admin recovery: forget the PIN and the authenticator (the person sets them up again) */
export async function resetSecurity(username: string, only: 'all' | 'totp' = 'all'): Promise<boolean> {
  // The profile photo is not a credential: it stays
  const totp = 'totp_secret = NULL, totp_enabled = 0, totp_last_step = NULL, backup_codes = NULL, trust_epoch = trust_epoch + 1';
  const sql = only === 'totp'
    ? `UPDATE user_security SET ${totp} WHERE username = ? AND totp_secret IS NOT NULL`
    : `UPDATE user_security SET pin_hash = NULL, pin_set_at = NULL, ${totp} WHERE username = ? AND (pin_hash IS NOT NULL OR totp_secret IS NOT NULL)`;
  const [r] = await db().query<import('mysql2/promise').ResultSetHeader>(sql, [username]);
  return r.affectedRows > 0;
}

// ---------------------------------------------------------------------------
// Profile photo
// ---------------------------------------------------------------------------

export const AVATAR_MAX_BYTES = 300 * 1024;

/** The image type from its first bytes (the Content-Type header alone is not trusted) */
export function sniffImage(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

export async function setAvatar(username: string, data: Buffer, mime: string, by: string): Promise<void> {
  await db().query(
    'INSERT INTO user_profiles (username, avatar, avatar_mime, avatar_bytes, updated_by) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE avatar = VALUES(avatar), avatar_mime = VALUES(avatar_mime), avatar_bytes = VALUES(avatar_bytes), updated_by = VALUES(updated_by), updated_at = NOW()',
    [username, data, mime, data.length, by]);
}

export async function getAvatar(username: string): Promise<{ data: Buffer; mime: string } | null> {
  const [rows] = await db().query<RowDataPacket[]>('SELECT avatar, avatar_mime FROM user_profiles WHERE username = ?', [username]);
  return rows[0]?.avatar ? { data: rows[0].avatar as Buffer, mime: (rows[0].avatar_mime as string) || 'image/jpeg' } : null;
}

export async function clearAvatar(username: string): Promise<void> {
  await db().query('DELETE FROM user_profiles WHERE username = ?', [username]);
}
