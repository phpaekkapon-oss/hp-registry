import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { PERMISSIONS, requireUnlocked, setUserTotp, twofaStatus, revokeOtherSessions, sessionsOf, destroySession, clearSessionCookie, loadAppUser, lockSession, recordPinFailure, requireAuth, requireMenu, requirePermission, requireSession, unlockSession } from '../services/auth';
import { writeAudit } from '../services/audit';
import { getPool } from '../services/mysql';
import type { RowDataPacket } from 'mysql2/promise';
import { clientIp, finishLogin, securityInfo } from './auth';
import {
  PROVIDER_LABEL, decryptSecret, encryptSecret, getProviders, getSecuritySettings, providerReady,
  saveProviders, saveSecuritySettings, type ProviderConfig, type ProviderId,
} from '../services/settings';
import {
  forgetTrustedDevices, generateBackupCodes, securityRows, AVATAR_MAX_BYTES, PIN_PATTERN, clearAvatar, getAvatar, setAvatar, sniffImage, beginTotp, clearPin, disableTotp, enableTotp, resetSecurity, securityState, setPin, verifyPin, verifyTotp, weakPin,
} from '../services/userSecurity';

/**
 * Screen-lock PIN, Google Authenticator, admin security settings, and ThaID / Provider ID sign-in.
 * Mounted under /api/auth next to the password login.
 */
export const securityRouter = Router();

const actor = (req: Request) => ({ username: req.auth!.user.username, name: req.auth!.user.displayName });
const fail = (res: Response, status: number, code: string, message: string) => res.status(status).json({ success: false, code, message });
const MAX_PIN_FAILS = 5;

// ---------------------------------------------------------------------------
// Public: which external sign-in buttons the login page shows
// ---------------------------------------------------------------------------

securityRouter.get('/config', (_req: Request, res: Response) => {
  const p = getProviders();
  res.json({
    success: true,
    data: {
      // ready = fully configured; the login page warns (instead of leaving the page) when it is not
      providers: (Object.keys(p) as ProviderId[]).filter((id) => p[id].enabled).map((id) => ({ id, label: PROVIDER_LABEL[id], ready: providerReady(p[id]) })),
      trustDeviceDays: getSecuritySettings().trustDeviceDays,
    },
  });
});

// ---------------------------------------------------------------------------
// Screen lock
// ---------------------------------------------------------------------------

// POST /api/auth/lock : the browser reports that the person has been idle
securityRouter.post('/lock', requireAuth, async (req: Request, res: Response) => {
  if (!(await securityState(req.auth!.user.username)).hasPin) return fail(res, 400, 'NO_PIN', 'ยังไม่ได้ตั้ง PIN');
  lockSession(req.auth!.sid);
  res.json({ success: true });
});

// POST /api/auth/unlock {pin}
securityRouter.post('/unlock', requireSession, async (req: Request, res: Response) => {
  const pin = (req.body as { pin?: unknown } | undefined)?.pin;
  if (typeof pin !== 'string' || !PIN_PATTERN.test(pin)) return fail(res, 400, 'INVALID_INPUT', 'PIN ต้องเป็นตัวเลข 4-6 หลัก');
  if (await verifyPin(req.auth!.user.username, pin)) {
    unlockSession(req.auth!.sid);
    return res.json({ success: true });
  }
  const fails = recordPinFailure(req.auth!.sid);
  await writeAudit(actor(req), clientIp(req), { action: 'login_failed', resource: 'auth', recordId: req.auth!.user.username, summary: `ปลดล็อกหน้าจอไม่สำเร็จ (PIN ผิด ครั้งที่ ${fails})` });
  if (fails >= MAX_PIN_FAILS) {
    destroySession(req.auth!.sid);
    clearSessionCookie(res);
    return res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: 'ใส่ PIN ผิดหลายครั้ง ระบบออกจากระบบให้อัตโนมัติ กรุณาเข้าสู่ระบบใหม่' });
  }
  return fail(res, 401, 'BAD_PIN', `PIN ไม่ถูกต้อง (เหลืออีก ${MAX_PIN_FAILS - fails} ครั้ง)`);
});

// ---------------------------------------------------------------------------
// My PIN and Google Authenticator
// ---------------------------------------------------------------------------

securityRouter.get('/security', requireUnlocked, async (req: Request, res: Response) => {
  res.json({ success: true, data: await securityInfo(req.auth!.user) });
});

// PUT /api/auth/pin {pin, currentPin?}
securityRouter.put('/pin', requireAuth, async (req: Request, res: Response) => {
  const { pin, currentPin } = (req.body ?? {}) as { pin?: unknown; currentPin?: unknown };
  const me = req.auth!.user.username;
  if (typeof pin !== 'string' || !PIN_PATTERN.test(pin)) return fail(res, 400, 'INVALID_INPUT', 'PIN ต้องเป็นตัวเลข 4-6 หลัก');
  if (weakPin(pin)) return fail(res, 400, 'WEAK_PIN', 'PIN เดาง่ายเกินไป (เช่น 1234 หรือเลขซ้ำ) กรุณาเลือกใหม่');
  const had = (await securityState(me)).hasPin;
  if (had && !(typeof currentPin === 'string' && (await verifyPin(me, currentPin)))) return fail(res, 401, 'BAD_PIN', 'PIN เดิมไม่ถูกต้อง');
  await setPin(me, pin);
  await writeAudit(actor(req), clientIp(req), { action: 'security', resource: 'auth', recordId: me, summary: had ? 'เปลี่ยน PIN ล็อกหน้าจอ' : 'ตั้ง PIN ล็อกหน้าจอ' });
  res.json({ success: true, data: await securityInfo(req.auth!.user) });
});

// DELETE /api/auth/pin {pin}
securityRouter.delete('/pin', requireAuth, async (req: Request, res: Response) => {
  const pin = (req.body as { pin?: unknown } | undefined)?.pin;
  const me = req.auth!.user.username;
  if (typeof pin !== 'string' || !(await verifyPin(me, pin))) return fail(res, 401, 'BAD_PIN', 'PIN ไม่ถูกต้อง');
  await clearPin(me);
  await writeAudit(actor(req), clientIp(req), { action: 'security', resource: 'auth', recordId: me, summary: 'ยกเลิก PIN ล็อกหน้าจอ' });
  res.json({ success: true, data: await securityInfo(req.auth!.user) });
});

// POST /api/auth/totp/setup : new secret + otpauth:// link for the QR code (not active until confirmed)
securityRouter.post('/totp/setup', requireUnlocked, async (req: Request, res: Response) => {
  if ((await securityState(req.auth!.user.username)).totpEnabled) return fail(res, 409, 'ALREADY_ENABLED', 'เปิดใช้ Google Authenticator อยู่แล้ว ต้องปิดก่อนจึงจะตั้งใหม่ได้');
  res.json({ success: true, data: await beginTotp(req.auth!.user.username) });
});

// POST /api/auth/totp/enable {code}
securityRouter.post('/totp/enable', requireUnlocked, async (req: Request, res: Response) => {
  const code = String((req.body as { code?: unknown } | undefined)?.code ?? '').replace(/\s/g, '');
  const me = req.auth!.user.username;
  if (!(await enableTotp(me, code))) return fail(res, 400, 'BAD_TOTP', 'รหัสไม่ถูกต้อง ตรวจสอบเวลาของโทรศัพท์แล้วลองใหม่');
  setUserTotp(me, true);
  const backupCodes = await generateBackupCodes(me);
  await writeAudit(actor(req), clientIp(req), { action: 'security', resource: 'auth', recordId: me, summary: 'เปิดใช้ Google Authenticator' });
  res.json({ success: true, data: { ...(await securityInfo(req.auth!.user)), backupCodes } });
});

// POST /api/auth/totp/disable {code}
securityRouter.post('/totp/disable', requireAuth, async (req: Request, res: Response) => {
  const code = String((req.body as { code?: unknown } | undefined)?.code ?? '').replace(/\s/g, '');
  const me = req.auth!.user.username;
  if (twofaStatus(req.auth!.user, false).required) return fail(res, 409, 'REQUIRED', 'ผู้ดูแลระบบกำหนดให้บัญชีนี้ต้องใช้ Google Authenticator จึงปิดไม่ได้');
  if (!(await verifyTotp(me, code))) return fail(res, 400, 'BAD_TOTP', 'รหัสไม่ถูกต้อง');
  await disableTotp(me);
  setUserTotp(me, false);
  await writeAudit(actor(req), clientIp(req), { action: 'security', resource: 'auth', recordId: me, summary: 'ปิด Google Authenticator' });
  res.json({ success: true, data: await securityInfo(req.auth!.user) });
});

// POST /api/auth/totp/backup-codes : ten new one-time recovery codes (the old ones stop working)
securityRouter.post('/totp/backup-codes', requireUnlocked, async (req: Request, res: Response) => {
  const me = req.auth!.user.username;
  if (!(await securityState(me)).totpEnabled) return fail(res, 400, 'NO_TOTP', 'ต้องเปิดใช้ Google Authenticator ก่อน');
  const codes = await generateBackupCodes(me);
  await writeAudit(actor(req), clientIp(req), { action: 'security', resource: 'auth', recordId: me, summary: 'สร้างรหัสกู้คืน 2FA ชุดใหม่' });
  res.json({ success: true, data: { ...(await securityInfo(req.auth!.user)), backupCodes: codes } });
});

// DELETE /api/auth/trusted-devices : every browser has to pass 2FA again
securityRouter.delete('/trusted-devices', requireAuth, async (req: Request, res: Response) => {
  await forgetTrustedDevices(req.auth!.user.username);
  await writeAudit(actor(req), clientIp(req), { action: 'security', resource: 'auth', recordId: req.auth!.user.username, summary: 'ล้างอุปกรณ์ที่จำไว้ (2FA)' });
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Devices signed in with this account
// ---------------------------------------------------------------------------

securityRouter.get('/sessions', requireAuth, (req: Request, res: Response) => {
  res.json({ success: true, data: sessionsOf(req.auth!.user.username, req.auth!.sid) });
});

// DELETE /api/auth/sessions/:ref (one other device) or /api/auth/sessions (all other devices)
securityRouter.delete(['/sessions', '/sessions/:ref'], requireAuth, async (req: Request, res: Response) => {
  const ref = req.params.ref ? String(req.params.ref) : null;
  const n = revokeOtherSessions(req.auth!.user.username, req.auth!.sid, ref);
  if (n > 0) await writeAudit(actor(req), clientIp(req), { action: 'security', resource: 'auth', recordId: req.auth!.user.username, summary: ref ? 'ออกจากระบบอุปกรณ์อื่น 1 เครื่อง' : `ออกจากระบบอุปกรณ์อื่นทั้งหมด (${n} เครื่อง)` });
  res.json({ success: true, data: { revoked: n } });
});

// ---------------------------------------------------------------------------
// Profile photo (the browser sends a small square JPEG; the server only checks size and type)
// ---------------------------------------------------------------------------

securityRouter.put('/avatar', requireAuth, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: AVATAR_MAX_BYTES }), async (req: Request, res: Response) => {
  const body = req.body as Buffer | undefined;
  if (!Buffer.isBuffer(body) || body.length === 0) return fail(res, 400, 'INVALID_INPUT', 'กรุณาเลือกไฟล์รูปภาพ (JPG, PNG หรือ WebP)');
  const mime = sniffImage(body);
  if (!mime) return fail(res, 400, 'INVALID_INPUT', 'ไฟล์ไม่ใช่รูปภาพที่รองรับ (JPG, PNG หรือ WebP)');
  await setAvatar(req.auth!.user.username, body, mime, req.auth!.user.username);
  await writeAudit(actor(req), clientIp(req), { action: 'security', resource: 'auth', recordId: req.auth!.user.username, summary: 'เปลี่ยนรูปโปรไฟล์' });
  res.json({ success: true, data: await securityInfo(req.auth!.user) });
});

securityRouter.delete('/avatar', requireAuth, async (req: Request, res: Response) => {
  await clearAvatar(req.auth!.user.username);
  await writeAudit(actor(req), clientIp(req), { action: 'security', resource: 'auth', recordId: req.auth!.user.username, summary: 'ลบรูปโปรไฟล์' });
  res.json({ success: true, data: await securityInfo(req.auth!.user) });
});

securityRouter.get('/avatar/:username', requireAuth, async (req: Request, res: Response) => {
  const name = String(req.params.username);
  // Your own photo, or any photo for an admin (user management shows people)
  if (name !== req.auth!.user.username && !PERMISSIONS[req.auth!.user.role].manageUsers) return fail(res, 403, 'FORBIDDEN', 'ไม่มีสิทธิ์ดูรูปนี้');
  const img = await getAvatar(name);
  if (!img) return res.status(404).end();
  res.set({ 'Content-Type': img.mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" });
  res.send(img.data);
});

// ---------------------------------------------------------------------------
// Admin: idle times, ThaID / Provider ID, recovery
// ---------------------------------------------------------------------------

const adminOnly = [requireAuth, requirePermission('manageUsers'), requireMenu('usermgmt')];

const redirectUri = (req: Request, id: ProviderId) => `${(getSecuritySettings().publicUrl || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '')}/api/auth/oauth/${id}/callback`;

function adminView(req: Request) {
  const p = getProviders();
  return {
    security: getSecuritySettings(),
    providers: (Object.keys(p) as ProviderId[]).map((id) => ({
      id,
      label: PROVIDER_LABEL[id],
      enabled: p[id].enabled,
      clientId: p[id].clientId,
      hasSecret: Boolean(p[id].clientSecretEnc),
      ready: providerReady(p[id]),
      authUrl: p[id].authUrl,
      tokenUrl: p[id].tokenUrl,
      userinfoUrl: p[id].userinfoUrl,
      scope: p[id].scope,
      pidField: p[id].pidField,
      redirectUri: redirectUri(req, id),
    })),
  };
}

securityRouter.get('/admin/settings', ...adminOnly, (req: Request, res: Response) => {
  res.json({ success: true, data: adminView(req) });
});

const cleanUrl = (v: unknown, what: string): string => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s && !/^https?:\/\/[^\s]+$/i.test(s)) throw new Error(`${what} ต้องขึ้นต้นด้วย http:// หรือ https://`);
  return s;
};

securityRouter.put('/admin/settings', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as {
      lockMinutes?: unknown; logoutMinutes?: unknown; publicUrl?: unknown; twofaPolicy?: unknown; twofaGraceDays?: unknown; trustDeviceDays?: unknown;
      providers?: Record<string, Partial<ProviderConfig> & { clientSecret?: string }>;
    };
    const lock = Number(body.lockMinutes ?? getSecuritySettings().lockMinutes);
    const logout = Number(body.logoutMinutes ?? getSecuritySettings().logoutMinutes);
    if (!Number.isInteger(lock) || lock < 1 || lock > 240) throw new Error('เวลาล็อกหน้าจอต้องเป็น 1-240 นาที');
    if (!Number.isInteger(logout) || logout < 2 || logout > 720) throw new Error('เวลาออกจากระบบต้องเป็น 2-720 นาที');
    if (logout <= lock) throw new Error('เวลาออกจากระบบต้องมากกว่าเวลาล็อกหน้าจอ');
    const publicUrl = cleanUrl(body.publicUrl ?? getSecuritySettings().publicUrl, 'ที่อยู่เว็บ');

    const current = getProviders();
    const next = structuredClone(current);
    for (const id of Object.keys(next) as ProviderId[]) {
      const inc = body.providers?.[id];
      if (!inc) continue;
      const p = next[id];
      if (typeof inc.clientId === 'string') p.clientId = inc.clientId.trim().slice(0, 200);
      if (typeof inc.clientSecret === 'string' && inc.clientSecret.trim()) p.clientSecretEnc = encryptSecret(inc.clientSecret.trim());
      if (inc.authUrl !== undefined) p.authUrl = cleanUrl(inc.authUrl, `${PROVIDER_LABEL[id]}: Authorize URL`);
      if (inc.tokenUrl !== undefined) p.tokenUrl = cleanUrl(inc.tokenUrl, `${PROVIDER_LABEL[id]}: Token URL`);
      if (inc.userinfoUrl !== undefined) p.userinfoUrl = cleanUrl(inc.userinfoUrl, `${PROVIDER_LABEL[id]}: Userinfo URL`);
      if (typeof inc.scope === 'string') p.scope = inc.scope.trim().slice(0, 200);
      if (typeof inc.pidField === 'string') p.pidField = inc.pidField.trim().slice(0, 50) || 'pid';
      if (typeof inc.enabled === 'boolean') p.enabled = inc.enabled;
    }
    const cur = getSecuritySettings();
    const policy = body.twofaPolicy === undefined ? cur.twofaPolicy : body.twofaPolicy;
    if (policy !== 'off' && policy !== 'admins' && policy !== 'all') throw new Error('นโยบาย 2FA ไม่ถูกต้อง');
    const grace = Number(body.twofaGraceDays ?? cur.twofaGraceDays);
    const trustDays = Number(body.trustDeviceDays ?? cur.trustDeviceDays);
    if (![0, 1, 3, 7, 14, 30].includes(grace)) throw new Error('ระยะผ่อนผันต้องเป็น 0, 3, 7, 14 หรือ 30 วัน');
    if (![0, 1, 7, 30].includes(trustDays)) throw new Error('จำเครื่องได้ 0, 1, 7 หรือ 30 วัน');
    // The grace period counts from when the policy started (or was changed to a stricter group)
    const since = policy === 'off' ? '' : policy !== cur.twofaPolicy || !cur.twofaSince ? new Date().toISOString() : cur.twofaSince;
    await saveSecuritySettings({ lockMinutes: lock, logoutMinutes: logout, publicUrl, twofaPolicy: policy, twofaGraceDays: grace, trustDeviceDays: trustDays, twofaSince: since }, req.auth!.user.username);
    await saveProviders(next, req.auth!.user.username);
    const summary = `แก้ไขตั้งค่าความปลอดภัย (นโยบาย 2FA ${policy}, ผ่อนผัน ${grace} วัน, จำเครื่อง ${trustDays} วัน; ล็อกหน้าจอ ${lock} นาที, ออกจากระบบ ${logout} นาที; ThaID ${next.thaid.enabled ? 'เปิด' : 'ปิด'}, Provider ID ${next.providerid.enabled ? 'เปิด' : 'ปิด'})`;
    await writeAudit(actor(req), clientIp(req), { action: 'security', resource: 'auth', recordId: 'settings', summary });
    res.json({ success: true, data: adminView(req) });
  } catch (e) {
    fail(res, 400, 'INVALID_INPUT', (e as Error).message);
  }
});

// GET /api/auth/admin/twofa : policy, who has 2FA, and who still has to set it up
securityRouter.get('/admin/twofa', ...adminOnly, async (_req: Request, res: Response) => {
  const cfg = getSecuritySettings();
  const [rows] = await getPool().query<RowDataPacket[]>('SELECT login_name, display_name, role FROM app_users WHERE is_enabled = 1 AND hos_disabled = 0 ORDER BY display_name LIMIT 2000');
  const people = [
    { username: 'admin', displayName: 'ผู้ดูแลระบบ (บัญชีในตัว)', role: 'Admin' as const, source: 'builtin' as const },
    { username: 'doctor', displayName: 'แพทย์ผู้รักษา (บัญชีในตัว)', role: 'Doctor' as const, source: 'builtin' as const },
    { username: 'staff', displayName: 'เจ้าหน้าที่เวชระเบียน (บัญชีในตัว)', role: 'Staff' as const, source: 'builtin' as const },
    ...rows.map((r) => ({ username: r.login_name as string, displayName: (r.display_name as string) || (r.login_name as string), role: r.role as 'Admin' | 'Doctor' | 'Staff', source: 'hosxp' as const })),
  ];
  const sec = await securityRows();
  const users = people.map((p) => {
    const s = sec.get(p.username);
    const enabled = Boolean(s?.totpEnabled);
    return { ...p, totpEnabled: enabled, hasPin: Boolean(s?.hasPin), lastTotpAt: s?.lastTotpAt ? new Date(s.lastTotpAt).toISOString() : null, required: twofaStatus({ ...p, organization: '', position: null, menus: [] }, enabled).required };
  });
  res.json({
    success: true,
    data: {
      policy: cfg.twofaPolicy, graceDays: cfg.twofaGraceDays, trustDeviceDays: cfg.trustDeviceDays, since: cfg.twofaSince || null,
      counts: { enabled: users.filter((u) => u.totpEnabled).length, pending: users.filter((u) => u.required).length, total: users.length },
      // Those with 2FA, then those who still must set it up
      users: users.filter((u) => u.totpEnabled || u.required).sort((a, b) => Number(b.totpEnabled) - Number(a.totpEnabled) || a.displayName.localeCompare(b.displayName, 'th')).slice(0, 300),
    },
  });
});

// GET /api/auth/admin/security-log : latest security events (settings, resets, failed sign-ins)
securityRouter.get('/admin/security-log', ...adminOnly, async (_req: Request, res: Response) => {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT id, at, actor, actor_name, action, summary FROM audit_log WHERE resource = 'auth' AND action IN ('security', 'login_failed') ORDER BY id DESC LIMIT 50");
  res.json({ success: true, data: rows.map((r) => ({ id: Number(r.id), at: new Date(r.at).toISOString(), actor: r.actor as string, actorName: (r.actor_name as string) || (r.actor as string), action: r.action as string, summary: r.summary as string })) });
});

// POST /api/auth/admin/reset-security {username} : the person forgot the PIN / lost the phone
securityRouter.post('/admin/reset-security', ...adminOnly, async (req: Request, res: Response) => {
  const username = String((req.body as { username?: unknown } | undefined)?.username ?? '').trim();
  const only = (req.body as { only?: unknown } | undefined)?.only === 'totp' ? 'totp' : 'all';
  if (!username) return fail(res, 400, 'INVALID_INPUT', 'กรุณาระบุชื่อผู้ใช้');
  const had = await resetSecurity(username, only);
  setUserTotp(username, false);
  await writeAudit(actor(req), clientIp(req), { action: 'security', resource: 'auth', recordId: username, summary: `${only === 'totp' ? 'รีเซ็ต Google Authenticator' : 'รีเซ็ต PIN และ Google Authenticator'} ของ ${username}${had ? '' : ' (ไม่มีข้อมูลให้รีเซ็ต)'}` });
  res.json({ success: true, data: { reset: had } });
});

// ---------------------------------------------------------------------------
// ThaID / Provider ID (OAuth 2.0 authorization code flow)
// The citizen ID returned by the provider is matched with the HOSxP login name (which is the citizen ID).
// ---------------------------------------------------------------------------

const OAUTH_COOKIE = 'his_oauth';
const pendingStates = new Map<string, { provider: ProviderId; at: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingStates) if (now - v.at > 10 * 60_000) pendingStates.delete(k);
}, 60_000).unref();

const backToLogin = (res: Response, message?: string) => res.redirect(message ? `/?login_error=${encodeURIComponent(message)}` : '/');

securityRouter.get('/oauth/:provider/start', (req: Request, res: Response) => {
  const id = req.params.provider as ProviderId;
  const p = getProviders()[id];
  if (!p || !p.enabled) return backToLogin(res, 'การเข้าสู่ระบบด้วยวิธีนี้ยังไม่เปิดใช้งาน');
  if (!providerReady(p)) return backToLogin(res, `${PROVIDER_LABEL[id]} ยังตั้งค่าไม่ครบ (ผู้ดูแลระบบต้องกรอก Client ID, Client Secret และ URL ในหน้าตั้งค่าความปลอดภัย)`);
  const state = crypto.randomBytes(24).toString('base64url');
  pendingStates.set(state, { provider: id, at: Date.now() });
  // The cookie ties the answer to the browser that started the flow (a forged link cannot sign someone in as another person)
  res.cookie(OAUTH_COOKIE, state, { httpOnly: true, sameSite: 'lax', path: '/api/auth/oauth', maxAge: 10 * 60_000, secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false' });
  const url = new URL(p.authUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', p.clientId);
  url.searchParams.set('redirect_uri', redirectUri(req, id));
  if (p.scope) url.searchParams.set('scope', p.scope);
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

/** Read a field from a JSON object, or from the payload of a JWT (id_token) inside it */
function findPid(obj: Record<string, unknown> | null, field: string): string | null {
  if (!obj) return null;
  for (const key of [field, 'pid', 'cid', 'citizen_id', 'national_id']) {
    const v = obj[key];
    if (typeof v === 'string' || typeof v === 'number') return String(v);
  }
  const idToken = obj.id_token;
  if (typeof idToken === 'string' && idToken.split('.').length === 3) {
    try {
      return findPid(JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8')), field);
    } catch {
      return null;
    }
  }
  return null;
}

securityRouter.get('/oauth/:provider/callback', async (req: Request, res: Response) => {
  const id = req.params.provider as ProviderId;
  const p = getProviders()[id];
  const { code, state, error } = req.query as Record<string, string | undefined>;
  const cookieState = /(?:^|;\s*)his_oauth=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
  res.clearCookie(OAUTH_COOKIE, { path: '/api/auth/oauth' });
  const pending = state ? pendingStates.get(state) : undefined;
  if (state) pendingStates.delete(state);
  if (error) return backToLogin(res, `${PROVIDER_LABEL[id] ?? 'ผู้ให้บริการ'}: ยกเลิกหรือปฏิเสธการเข้าสู่ระบบ`);
  if (!p || !providerReady(p) || !code || !pending || pending.provider !== id || cookieState !== state) {
    return backToLogin(res, 'การเข้าสู่ระบบไม่สมบูรณ์หรือหมดอายุ กรุณาลองใหม่');
  }

  try {
    const secret = decryptSecret(p.clientSecretEnc);
    if (!secret) throw new Error('อ่าน Client Secret ไม่ได้ กรุณาบันทึกค่าใหม่ในหน้าตั้งค่า');
    const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(req, id) });
    const tokenRes = await fetch(p.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', Authorization: `Basic ${Buffer.from(`${p.clientId}:${secret}`).toString('base64')}` },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    const token = (await tokenRes.json().catch(() => null)) as Record<string, unknown> | null;
    if (!tokenRes.ok || !token) throw new Error(`${PROVIDER_LABEL[id]} ปฏิเสธคำขอ (${tokenRes.status})`);

    let pid = findPid(token, p.pidField);
    if (!pid && p.userinfoUrl && typeof token.access_token === 'string') {
      const info = await fetch(p.userinfoUrl, { headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
      pid = findPid((await info.json().catch(() => null)) as Record<string, unknown> | null, p.pidField);
    }
    if (!pid || !/^\d{13}$/.test(pid)) throw new Error(`ไม่ได้รับเลขประจำตัวประชาชนจาก ${PROVIDER_LABEL[id]}`);

    const user = await loadAppUser(pid);
    if (!user) {
      await writeAudit({ username: pid.slice(0, 3) + '*********' + pid.slice(-1), name: '' }, clientIp(req), { action: 'login_failed', resource: 'auth', recordId: id, summary: `ล็อกอินด้วย ${PROVIDER_LABEL[id]} ไม่สำเร็จ (ไม่พบบัญชีที่ได้รับอนุญาตตรงกับเลขประจำตัวนี้)` });
      return backToLogin(res, 'ยืนยันตัวตนสำเร็จ แต่ไม่พบบัญชีผู้ใช้ที่ได้รับสิทธิ์ในระบบนี้ กรุณาติดต่อผู้ดูแลระบบ');
    }
    await finishLogin(req, res, user, PROVIDER_LABEL[id]);
    return res.redirect('/');
  } catch (e) {
    console.error('[oauth]', id, (e as Error).message);
    return backToLogin(res, (e as Error).message || 'เข้าสู่ระบบไม่สำเร็จ');
  }
});
