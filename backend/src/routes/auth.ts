import { Router, Request, Response } from 'express';
import {
  clearLoginFailures,
  clearSessionCookie,
  createSession,
  destroySession,
  lockoutSecondsRemaining,
  recordLoginFailure,
  setSessionCookie,
  authenticate,
  hashPassword,
  passwordProblem,
  requireAuth,
  revokeOtherSessions,
  verifyLocalPassword,
  twofaStatus,
  COOKIE_SECURE,
  type AuthUser,
} from '../services/auth';
import crypto from 'crypto';
import { getSecuritySettings, signToken, verifyToken } from '../services/settings';
import { BACKUP_CODE_PATTERN, consumeBackupCode, securityState, verifyTotp } from '../services/userSecurity';

import { writeAudit } from '../services/audit';
import { getPool } from '../services/mysql';
import type { RowDataPacket } from 'mysql2/promise';

export const authRouter = Router();

const SOURCE_TH = { builtin: 'บัญชีในตัว', hosxp: 'HOSxP', local: 'บัญชีสมาชิก' } as const;

export const clientIp = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'unknown';

/** What the browser needs to know about this person's lock/2FA settings and the idle times */
export async function securityInfo(user: AuthUser) {
  const s = await securityState(user.username);
  const cfg = getSecuritySettings();
  const { avatarAt, trustEpoch: _epoch, ...flags } = s;
  return {
    ...flags,
    /** Has the admin's 2FA policy asked this person to set it up (and is the grace period over)? */
    twofa: twofaStatus(user, s.totpEnabled),
    trustDeviceDays: cfg.trustDeviceDays,
    lockMinutes: cfg.lockMinutes,
    logoutMinutes: cfg.logoutMinutes,
    /** Versioned by the change time so the browser caches it until the photo changes */
    avatarUrl: avatarAt ? `/api/auth/avatar/${encodeURIComponent(user.username)}?v=${avatarAt}` : null,
  };
}

/** Start the session once every check has passed (always a fresh session id: prevents session fixation) */
export async function finishLogin(req: Request, res: Response, user: AuthUser, method: string) {
  destroySession(req.auth?.sid);
  const hasTotp = (await securityState(user.username)).totpEnabled;
  setSessionCookie(res, createSession(user, { ip: clientIp(req), userAgent: String(req.headers['user-agent'] ?? ''), hasTotp }));
  await writeAudit({ username: user.username, name: user.displayName }, clientIp(req), { action: 'login', resource: 'auth', recordId: user.username, summary: `เข้าสู่ระบบ (${method})` });
  return { user, security: await securityInfo(user), locked: false };
}

/** Password was right but the account has Google Authenticator: the code must follow within 5 minutes */
interface Ticket {
  user: AuthUser;
  expires: number;
  tries: number;
  ip: string;
}
const tickets = new Map<string, Ticket>();
setInterval(() => {
  const now = Date.now();
  for (const [k, t] of tickets) if (t.expires < now) tickets.delete(k);
}, 60_000).unref();

// POST /api/auth/login
authRouter.post('/login', async (req: Request, res: Response) => {
  const { username, password } = (req.body ?? {}) as { username?: unknown; password?: unknown };
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    return res.status(400).json({ success: false, code: 'INVALID_INPUT', message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
  }
  if (username.length > 100 || password.length > 200) {
    return res.status(400).json({ success: false, code: 'INVALID_INPUT', message: 'ข้อมูลที่กรอกยาวเกินกำหนด' });
  }

  const ip = clientIp(req);
  const wait = lockoutSecondsRemaining(ip, username);
  if (wait > 0) {
    res.setHeader('Retry-After', String(wait));
    return res.status(429).json({
      success: false,
      code: 'LOCKED',
      retryAfterSeconds: wait,
      message: `พยายามเข้าสู่ระบบผิดหลายครั้ง กรุณาลองใหม่ในอีก ${Math.ceil(wait / 60)} นาที`,
    });
  }

  let result;
  try {
    result = await authenticate(username, password);
  } catch (e) {
    console.error('[auth] login failed unexpectedly', e);
    return res.status(503).json({ success: false, code: 'UNAVAILABLE', message: 'ระบบยืนยันตัวตนใช้งานไม่ได้ชั่วคราว กรุณาลองใหม่' });
  }
  if (!result.ok) {
    if (result.reason === 'hos_unavailable') {
      return res.status(503).json({ success: false, code: 'UNAVAILABLE', message: 'เชื่อมต่อฐานข้อมูล HOSxP ไม่ได้ กรุณาลองใหม่หรือแจ้งผู้ดูแลระบบ' });
    }
    if (result.reason === 'no_access') {
      // The password was correct, so it is safe to say why access is refused
      return res.status(403).json({ success: false, code: 'NO_ACCESS', message: 'บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งานระบบพัสดุ กรุณาติดต่อผู้ดูแลระบบ' });
    }
    recordLoginFailure(ip, username);
    await writeAudit({ username: username.trim().slice(0, 100), name: '' }, ip, { action: 'login_failed', resource: 'auth', recordId: username.trim().slice(0, 100), summary: 'ล็อกอินไม่สำเร็จ (ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง)' });
    // Same message for "unknown user" and "wrong password"
    return res.status(401).json({ success: false, code: 'BAD_CREDENTIALS', message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }
  const user = result.user;

  clearLoginFailures(ip, username);
  const state = await securityState(user.username);
  // A browser that passed 2FA recently (and was told to be remembered) is not asked again
  const trust = verifyToken<{ u: string; e: number; x: number }>(/(?:^|;\s*)his_td=([^;]+)/.exec(req.headers.cookie ?? '')?.[1]);
  const trusted = getSecuritySettings().trustDeviceDays > 0 && trust?.u === user.username && (trust?.e ?? 0) > Date.now() && trust?.x === state.trustEpoch;
  if (state.totpEnabled && !trusted) {
    const ticket = crypto.randomBytes(24).toString('base64url');
    tickets.set(ticket, { user, expires: Date.now() + 5 * 60_000, tries: 0, ip });
    return res.json({ success: true, data: { totpRequired: true, ticket } });
  }
  return res.json({ success: true, data: await finishLogin(req, res, user, SOURCE_TH[user.source]) });
});

// POST /api/auth/login/totp : second step for accounts with Google Authenticator
authRouter.post('/login/totp', async (req: Request, res: Response) => {
  const { ticket, code, remember } = (req.body ?? {}) as { ticket?: unknown; code?: unknown; remember?: unknown };
  const t = typeof ticket === 'string' ? tickets.get(ticket) : undefined;
  if (!t || t.expires < Date.now()) {
    return res.status(401).json({ success: false, code: 'TICKET_EXPIRED', message: 'หมดเวลายืนยันตัวตน กรุณากรอกรหัสผ่านใหม่อีกครั้ง' });
  }
  t.tries += 1;
  if (t.tries > 5) {
    tickets.delete(ticket as string);
    return res.status(429).json({ success: false, code: 'TICKET_EXPIRED', message: 'ใส่รหัสผิดหลายครั้ง กรุณากรอกรหัสผ่านใหม่อีกครั้ง' });
  }
  const typed = typeof code === 'string' ? code.replace(/\s/g, '') : '';
  // Either the 6-digit code from the app, or one of the one-time recovery codes (xxxx-xxxx)
  const good = /^\d{6}$/.test(typed) ? await verifyTotp(t.user.username, typed) : BACKUP_CODE_PATTERN.test(typed) ? await consumeBackupCode(t.user.username, typed) : false;
  if (!good) {
    await writeAudit({ username: t.user.username, name: t.user.displayName }, clientIp(req), { action: 'login_failed', resource: 'auth', recordId: t.user.username, summary: 'ล็อกอินไม่สำเร็จ (รหัส Google Authenticator ไม่ถูกต้อง)' });
    return res.status(401).json({ success: false, code: 'BAD_TOTP', message: 'รหัสไม่ถูกต้อง (รหัส 6 หลักจาก Google Authenticator หรือรหัสกู้คืน)' });
  }
  tickets.delete(ticket as string);
  const days = getSecuritySettings().trustDeviceDays;
  if (days > 0 && remember === true) {
    const epoch = (await securityState(t.user.username)).trustEpoch;
    res.cookie('his_td', signToken({ u: t.user.username, e: Date.now() + days * 86_400_000, x: epoch }), { httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE, path: '/api/auth', maxAge: days * 86_400_000 });
  }
  return res.json({ success: true, data: await finishLogin(req, res, t.user, `${SOURCE_TH[t.user.source]} + Google Authenticator`) });
});

// POST /api/auth/logout  (idempotent)
authRouter.post('/logout', async (req: Request, res: Response) => {
  if (req.auth) await writeAudit({ username: req.auth.user.username, name: req.auth.user.displayName }, clientIp(req), { action: 'logout', resource: 'auth', recordId: req.auth.user.username, summary: 'ออกจากระบบ' });
  destroySession(req.auth?.sid);
  clearSessionCookie(res);
  res.json({ success: true });
});

// GET /api/auth/me
// Also answers while the screen is locked, so a reload can show the lock screen
// Not signed in is a normal answer here (every page load asks), so it is 200 + data: null rather than a 401
// that browsers print in red in the console
authRouter.get('/me', async (req: Request, res: Response) => {
  if (!req.auth) return res.json({ success: true, data: null });
  res.json({ success: true, data: { user: req.auth!.user, security: await securityInfo(req.auth!.user), locked: req.auth!.locked } });
});

// POST /api/auth/password { current, next } : a member (not from HOSxP) changes their own password.
// Their other signed-in devices are signed out.
authRouter.post('/password', requireAuth, async (req: Request, res: Response) => {
  const user = req.auth!.user;
  if (user.source !== 'local') return res.status(400).json({ success: false, message: 'บัญชีนี้เปลี่ยนรหัสผ่านที่ระบบต้นทาง (HOSxP) หรือติดต่อผู้ดูแลระบบ' });
  const { current, next } = (req.body ?? {}) as { current?: unknown; next?: unknown };
  const [rows] = await getPool().query<RowDataPacket[]>("SELECT pw_salt, pw_hash FROM app_users WHERE login_name = ? AND source = 'local'", [user.username]);
  if (typeof current !== 'string' || !rows[0] || !verifyLocalPassword(current, rows[0].pw_salt, rows[0].pw_hash)) {
    return res.status(400).json({ success: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
  }
  const problem = passwordProblem(next);
  if (problem) return res.status(400).json({ success: false, message: problem });
  if (next === current) return res.status(400).json({ success: false, message: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม' });
  const { salt, hash } = hashPassword(next as string);
  await getPool().query('UPDATE app_users SET pw_salt = ?, pw_hash = ?, pw_changed_at = NOW() WHERE login_name = ?', [salt, hash, user.username]);
  const signedOut = revokeOtherSessions(user.username, req.auth!.sid, null);
  await writeAudit({ username: user.username, name: user.displayName }, clientIp(req), { action: 'security', resource: 'auth', recordId: user.username, summary: 'เปลี่ยนรหัสผ่านของตนเอง' });
  res.json({ success: true, data: { signedOut } });
});
