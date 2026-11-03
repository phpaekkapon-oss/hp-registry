import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { EnterpriseRecord, EnterpriseRole } from '../types';
import { getPool } from './mysql';
import { effectiveMenus, MENU_IDS, normalizeMenus } from './menus';
import { HosError, hosConfigured, verifyHosPassword } from './hosxp';
import { getSecuritySettings } from './settings';

/**
 * Server-side authentication, sessions and authorization.
 *
 * - Passwords are stored as scrypt hashes (never in plain text).
 * - Sessions live on the server; the browser only holds an opaque, HttpOnly cookie.
 * - Roles are enforced here. The UI hides things for convenience, but this is the real gate.
 *
 * The user store below is a deliberately small seam: swap `findUser` / `verifyPassword`
 * for LDAP/AD, ThaiD or an OIDC provider without touching routes or the frontend.
 */

export interface AuthUser {
  username: string;
  displayName: string;
  role: EnterpriseRole;
  organization: string;
  /** Job title (HOSxP position, or the one an admin typed in user management); null for the built-in accounts */
  position: string | null;
  /** Menu ids this user may open (admins: everything, plus 'usermgmt') */
  menus: string[];
  /** builtin = the few accounts in code, hosxp = password checked in HOSxP, local = member added here with its own password */
  source: 'builtin' | 'hosxp' | 'local';
}

interface StoredUser extends AuthUser {
  salt: string;
  hash: string;
}

interface Session {
  user: AuthUser;
  createdAt: number;
  lastSeen: number;
  ip: string;
  userAgent: string;
  /** Has Google Authenticator on (cached so the 2FA policy can be checked on every request) */
  hasTotp: boolean;
  /** Screen lock (PIN): while true every API call except unlock/logout is refused */
  locked: boolean;
  pinFails: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { sid: string; user: AuthUser; locked: boolean; /** The 2FA policy requires setup first (grace period over) */ setup2fa: boolean };
    }
  }
}

const IS_PROD = process.env.NODE_ENV === 'production';
export const SESSION_COOKIE = 'his_sid';
/** Sign out after this long without activity (admin setting, default 30 minutes) */
const idleMs = () => getSecuritySettings().logoutMinutes * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // and never keep a session longer than a work day
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const scrypt = (password: string, salt: string) => crypto.scryptSync(password, salt, 64);

/** Hash for a member's own password (stored in app_users.pw_salt / pw_hash, never the password itself) */
export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: scrypt(password, salt).toString('hex') };
}

/** At least 8 characters with a letter and a digit; returns the problem, or null when fine */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 8) return 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร';
  if (password.length > 128) return 'รหัสผ่านยาวเกินไป';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'รหัสผ่านต้องมีทั้งตัวอักษรภาษาอังกฤษและตัวเลข';
  return null;
}

/** Checks a local member's password against its stored hash (constant time) */
export function verifyLocalPassword(password: string, salt: string | null, hash: string | null): boolean {
  const candidate = scrypt(password, salt ?? DUMMY_SALT);
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const USER_DEFINITIONS: { username: string; displayName: string; role: EnterpriseRole; env: string; devPassword: string }[] = [
  { username: 'admin', displayName: 'ผู้ดูแลระบบ', role: 'Admin', env: 'ADMIN_PASSWORD', devPassword: 'Admin@12345' },
  { username: 'doctor', displayName: 'แพทย์ผู้รักษา', role: 'Doctor', env: 'DOCTOR_PASSWORD', devPassword: 'Doctor@12345' },
  { username: 'staff', displayName: 'เจ้าหน้าที่เวชระเบียน', role: 'Staff', env: 'STAFF_PASSWORD', devPassword: 'Staff@12345' },
];

const users = new Map<string, StoredUser>();

for (const def of USER_DEFINITIONS) {
  let password = process.env[def.env];
  if (!password) {
    if (IS_PROD) {
      throw new Error(`[auth] ${def.env} must be set in production. Refusing to start with a default password.`);
    }
    password = def.devPassword;
    console.warn(`[auth] ${def.env} not set: using the DEVELOPMENT password for "${def.username}". Never do this in production.`);
  }
  const salt = crypto.randomBytes(16).toString('hex');
  users.set(def.username, {
    username: def.username,
    displayName: def.displayName,
    role: def.role,
    organization: 'กระทรวงสาธารณสุข',
    position: null,
    menus: effectiveMenus(def.role, MENU_IDS),
    source: 'builtin',
    salt,
    hash: scrypt(password, salt).toString('hex'),
  });
}

// Used so that "unknown user" costs the same time as "wrong password"
const DUMMY_SALT = crypto.randomBytes(16).toString('hex');

export function verifyCredentials(username: string, password: string): AuthUser | null {
  const stored = users.get(username.trim().toLowerCase());
  const candidate = scrypt(password, stored?.salt ?? DUMMY_SALT);
  if (!stored) return null;
  const expected = Buffer.from(stored.hash, 'hex');
  if (candidate.length !== expected.length || !crypto.timingSafeEqual(candidate, expected)) return null;
  const { salt: _salt, hash: _hash, ...user } = stored;
  return user;
}

export type AuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false; reason: 'bad_credentials' | 'no_access' | 'hos_unavailable' };

/**
 * Sign-in order:
 *  1. the few built-in accounts (admin/doctor/staff) so the system can never lock everyone out;
 *  2. members added in user management (people not in HOSxP, e.g. finance/procurement staff): their own hashed password;
 *  3. HOSxP accounts: the password is checked against HOSxP (nothing is stored here), and the account
 *     must have been enabled by an admin in user management.
 */
export async function authenticate(username: string, password: string): Promise<AuthResult> {
  const builtin = verifyCredentials(username, password);
  if (builtin) return { ok: true, user: builtin };
  if (users.has(username.trim().toLowerCase())) return { ok: false, reason: 'bad_credentials' };

  const login = username.trim();
  const [local] = await getPool().query<import('mysql2/promise').RowDataPacket[]>(
    "SELECT pw_salt, pw_hash FROM app_users WHERE login_name = ? AND source = 'local' LIMIT 1", [login]);
  if (local[0]) {
    if (!verifyLocalPassword(password, local[0].pw_salt, local[0].pw_hash)) return { ok: false, reason: 'bad_credentials' };
    const member = await loadAppUser(login);
    if (!member) return { ok: false, reason: 'no_access' };
    await getPool().query('UPDATE app_users SET last_login = NOW() WHERE login_name = ?', [member.username]);
    return { ok: true, user: member };
  }

  if (!hosConfigured()) return { ok: false, reason: 'bad_credentials' };

  try {
    const check = await verifyHosPassword(login, password);
    if (check === 'bad') return { ok: false, reason: 'bad_credentials' };
    if (check === 'disabled') return { ok: false, reason: 'no_access' };
  } catch (e) {
    console.error('[auth] HOSxP unavailable:', e instanceof HosError ? e.message : (e as Error).message);
    return { ok: false, reason: 'hos_unavailable' };
  }

  const user = await loadAppUser(login);
  if (!user) return { ok: false, reason: 'no_access' };
  await getPool().query('UPDATE app_users SET last_login = NOW() WHERE login_name = ?', [user.username]);
  return { ok: true, user };
}

/** A HOSxP account that an admin has enabled in user management, or null (unknown, not enabled, or closed in HOSxP) */
export async function loadAppUser(login: string): Promise<AuthUser | null> {
  const [rows] = await getPool().query<import('mysql2/promise').RowDataPacket[]>(
    'SELECT login_name, display_name, role, is_enabled, menus, hos_disabled, position_name, position_custom, source FROM app_users WHERE login_name = ? LIMIT 1',
    [login]
  );
  const row = rows[0];
  if (!row || !row.is_enabled || row.hos_disabled) return null;
  let ticked: unknown = [];
  try {
    ticked = row.menus ? JSON.parse(row.menus) : [];
  } catch {
    ticked = [];
  }
  const role = row.role as EnterpriseRole;
  return {
    username: row.login_name,
    displayName: row.display_name || row.login_name,
    role,
    organization: 'กระทรวงสาธารณสุข',
    position: (row.position_custom as string | null)?.trim() || (row.position_name as string | null)?.trim() || null,
    menus: effectiveMenus(role, normalizeMenus(ticked)),
    source: row.source === 'local' ? 'local' : 'hosxp',
  };
}

// ---------------------------------------------------------------------------
// Login throttling (per client + username)
// ---------------------------------------------------------------------------

interface AttemptState {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number;
}
const attempts = new Map<string, AttemptState>();
const attemptKey = (ip: string, username: string) => `${ip}|${username.trim().toLowerCase()}`;

/** @returns seconds to wait if currently locked, otherwise 0 */
export function lockoutSecondsRemaining(ip: string, username: string): number {
  const state = attempts.get(attemptKey(ip, username));
  if (!state) return 0;
  const remaining = state.lockedUntil - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

export function recordLoginFailure(ip: string, username: string): void {
  const key = attemptKey(ip, username);
  const now = Date.now();
  const state = attempts.get(key);
  if (!state || now - state.firstFailureAt > LOCKOUT_MS) {
    attempts.set(key, { failures: 1, firstFailureAt: now, lockedUntil: 0 });
    return;
  }
  state.failures += 1;
  if (state.failures >= MAX_FAILED_ATTEMPTS) state.lockedUntil = now + LOCKOUT_MS;
}

export function clearLoginFailures(ip: string, username: string): void {
  attempts.delete(attemptKey(ip, username));
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const sessions = new Map<string, Session>();

setInterval(() => {
  const now = Date.now();
  for (const [sid, s] of sessions) {
    if (now - s.lastSeen > idleMs() || now - s.createdAt > ABSOLUTE_TIMEOUT_MS) sessions.delete(sid);
  }
  for (const [key, a] of attempts) {
    if (a.lockedUntil < now && now - a.firstFailureAt > LOCKOUT_MS) attempts.delete(key);
  }
}, 60_000).unref();

export function createSession(user: AuthUser, origin: { ip: string; userAgent: string; hasTotp?: boolean } = { ip: '', userAgent: '' }): string {
  const sid = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  sessions.set(sid, { user, createdAt: now, lastSeen: now, locked: false, pinFails: 0, hasTotp: Boolean(origin.hasTotp), ip: origin.ip, userAgent: origin.userAgent.slice(0, 300) });
  return sid;
}

/** True while the session exists and has not idled or aged out (used to close long-lived streams) */
export function isSessionActive(sid: string | undefined): boolean {
  const s = sid ? sessions.get(sid) : undefined;
  if (!s) return false;
  const now = Date.now();
  return now - s.lastSeen <= idleMs() && now - s.createdAt <= ABSOLUTE_TIMEOUT_MS;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TwofaStatus {
  /** The policy applies to this person and they have not set it up yet */
  required: boolean;
  /** The grace period is over: nothing else works until it is set up */
  enforced: boolean;
  /** Last day of the grace period (ISO), null when not required */
  deadline: string | null;
}

/** 2FA policy check for one person (admins-only or everybody, with a grace period counted from when the policy started) */
export function twofaStatus(user: AuthUser, hasTotp: boolean): TwofaStatus {
  const cfg = getSecuritySettings();
  const applies = cfg.twofaPolicy === 'all' || (cfg.twofaPolicy === 'admins' && user.role === 'Admin');
  if (!applies || hasTotp) return { required: false, enforced: false, deadline: null };
  const since = cfg.twofaSince ? new Date(cfg.twofaSince).getTime() : Date.now();
  const deadline = since + cfg.twofaGraceDays * DAY_MS;
  return { required: true, enforced: Date.now() > deadline, deadline: new Date(deadline).toISOString() };
}

/** Keep the cached "has 2FA" flag of a person's open sessions in step (after set up, turn off, or an admin reset) */
export function setUserTotp(username: string, hasTotp: boolean): void {
  for (const s of sessions.values()) if (s.user.username === username) s.hasTotp = hasTotp;
}

export function lockSession(sid: string): boolean {
  const s = sessions.get(sid);
  if (!s) return false;
  s.locked = true;
  s.pinFails = 0;
  return true;
}

export function unlockSession(sid: string): void {
  const s = sessions.get(sid);
  if (s) {
    s.locked = false;
    s.pinFails = 0;
  }
}

/** @returns how many wrong PINs this lock screen has seen (the route signs the person out after 5) */
export function recordPinFailure(sid: string): number {
  const s = sessions.get(sid);
  if (!s) return 99;
  s.pinFails += 1;
  return s.pinFails;
}

const sessionRef = (sid: string) => crypto.createHash('sha256').update(sid).digest('hex').slice(0, 16);

export interface SessionSummary {
  /** Opaque reference (never the cookie value) */
  ref: string;
  current: boolean;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastSeen: string;
}

/** Where this person is signed in right now (browser + address + when) */
export function sessionsOf(username: string, currentSid: string | undefined): SessionSummary[] {
  const out: SessionSummary[] = [];
  const now = Date.now();
  for (const [sid, s] of sessions) {
    if (s.user.username !== username) continue;
    if (now - s.lastSeen > idleMs() || now - s.createdAt > ABSOLUTE_TIMEOUT_MS) continue;
    out.push({ ref: sessionRef(sid), current: sid === currentSid, ip: s.ip, userAgent: s.userAgent, createdAt: new Date(s.createdAt).toISOString(), lastSeen: new Date(s.lastSeen).toISOString() });
  }
  return out.sort((a, b) => Number(b.current) - Number(a.current) || b.lastSeen.localeCompare(a.lastSeen));
}

/** Sign out one of this person's other sessions (or all of them with ref = null); never the current one */
export function revokeOtherSessions(username: string, currentSid: string | undefined, ref: string | null): number {
  let n = 0;
  for (const [sid, s] of sessions) {
    if (s.user.username !== username || sid === currentSid) continue;
    if (ref !== null && sessionRef(sid) !== ref) continue;
    sessions.delete(sid);
    n += 1;
  }
  return n;
}

export function destroySession(sid: string | undefined): void {
  if (sid) sessions.delete(sid);
}

/** After an admin changes someone's access, make them sign in again so the change applies immediately */
export function revokeSessionsFor(usernames: string[]): void {
  const wanted = new Set(usernames.map((u) => u.toLowerCase()));
  for (const [sid, s] of sessions) if (wanted.has(s.user.username.toLowerCase())) sessions.delete(sid);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/**
 * Cookies are `Secure` in production. Set COOKIE_SECURE=false only for an internal
 * HTTP-only network, and prefer terminating TLS in front of the app instead.
 */
export const COOKIE_SECURE = IS_PROD && process.env.COOKIE_SECURE !== 'false';

export function setSessionCookie(res: Response, sid: string): void {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
    path: '/',
    maxAge: ABSOLUTE_TIMEOUT_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE, path: '/' });
}

const BACKGROUND_PATH = /\/api\/(notifications|health|procure\/events)\/?$/;

/** Resolves the session (if any) and slides the idle timer. Never rejects a request by itself. */
export function attachSession(req: Request, _res: Response, next: NextFunction): void {
  const sid = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  const session = sid ? sessions.get(sid) : undefined;
  if (sid && session) {
    const now = Date.now();
    if (now - session.lastSeen > idleMs() || now - session.createdAt > ABSOLUTE_TIMEOUT_MS) {
      sessions.delete(sid);
    } else {
      // Background polling (live stream, bell, health check) is not the person working: it must not keep an idle session alive
      if (!BACKGROUND_PATH.test(req.originalUrl.split('?')[0])) session.lastSeen = now;
      req.auth = { sid, user: session.user, locked: session.locked, setup2fa: twofaStatus(session.user, session.hasTotp).enforced };
    }
  }
  next();
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

export interface Permissions {
  create: boolean;
  edit: boolean;
  delete: boolean;
  viewPII: boolean;
  reset: boolean;
  /** Open user management, sync from HOSxP, grant access */
  manageUsers: boolean;
}

export const PERMISSIONS: Record<EnterpriseRole, Permissions> = {
  Admin: { create: true, edit: true, delete: true, viewPII: true, reset: true, manageUsers: true },
  Doctor: { create: true, edit: true, delete: false, viewPII: true, reset: false, manageUsers: false },
  Staff: { create: false, edit: false, delete: false, viewPII: false, reset: false, manageUsers: false },
};

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: 'กรุณาเข้าสู่ระบบ' });
    return;
  }
  if (req.auth.locked) {
    res.status(423).json({ success: false, code: 'LOCKED', message: 'หน้าจอถูกล็อก กรุณาใส่ PIN เพื่อปลดล็อก' });
    return;
  }
  if (req.auth.setup2fa) {
    res.status(428).json({ success: false, code: 'SETUP_2FA', message: 'ผู้ดูแลระบบกำหนดให้ใช้ Google Authenticator กรุณาตั้งค่า 2FA ก่อนใช้งาน' });
    return;
  }
  next();
}

/** Signed in and unlocked; allowed even while 2FA setup is pending (the person must be able to set it up) */
export function requireUnlocked(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: 'กรุณาเข้าสู่ระบบ' });
    return;
  }
  if (req.auth.locked) {
    res.status(423).json({ success: false, code: 'LOCKED', message: 'หน้าจอถูกล็อก กรุณาใส่ PIN เพื่อปลดล็อก' });
    return;
  }
  next();
}

/** Signed in, even if the screen is locked (used by unlock and by reading the session state) */
export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: 'กรุณาเข้าสู่ระบบ' });
    return;
  }
  next();
}

export function requirePermission(permission: keyof Permissions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: 'กรุณาเข้าสู่ระบบ' });
      return;
    }
    if (req.auth.locked) {
      res.status(423).json({ success: false, code: 'LOCKED', message: 'หน้าจอถูกล็อก กรุณาใส่ PIN เพื่อปลดล็อก' });
    return;
    }
    if (!PERMISSIONS[req.auth.user.role][permission]) {
      res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'สิทธิ์ของคุณไม่เพียงพอสำหรับการดำเนินการนี้' });
      return;
    }
    next();
  };
}

/** The user must have been given this menu (admins always have every menu) */
export function requireMenu(menu: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: 'กรุณาเข้าสู่ระบบ' });
      return;
    }
    if (req.auth.locked) {
      res.status(423).json({ success: false, code: 'LOCKED', message: 'หน้าจอถูกล็อก กรุณาใส่ PIN เพื่อปลดล็อก' });
    return;
    }
    if (!req.auth.user.menus.includes(menu)) {
      res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'คุณไม่ได้รับสิทธิ์เข้าถึงเมนูนี้' });
      return;
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Server-side PDPA redaction (same masking format the UI uses, so it is idempotent there)
// ---------------------------------------------------------------------------

export function redactRecord(record: EnterpriseRecord, role: EnterpriseRole): EnterpriseRecord {
  if (PERMISSIONS[role].viewPII) return record;
  const idParts = record.nationalId.split('-');
  const [emailUser, emailDomain] = record.email.split('@');
  return {
    ...record,
    nationalId:
      idParts.length === 5
        ? `${idParts[0]}-••••-•••••-${idParts[3]}-${idParts[4]}`
        : record.nationalId.slice(0, 3) + '••••••' + record.nationalId.slice(-2),
    phone: record.phone.slice(0, 7) + '•••-••' + record.phone.slice(-2),
    email: emailDomain ? `${emailUser.slice(0, 2)}••••@${emailDomain}` : record.email,
    clinicalNote: 'ข้อมูลลับทางการแพทย์ (ซ่อนตามสิทธิ์)',
  };
}
