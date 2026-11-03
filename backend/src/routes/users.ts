import { Router, Request, Response } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../services/mysql';
import { hashPassword, passwordProblem, requirePermission, revokeSessionsFor } from '../services/auth';
import { MENUS, ROLES, normalizeMenus, type Role } from '../services/menus';
import { hosConfigured } from '../services/hosxp';
import { syncFromHos } from '../services/userSync';
import { publishChange } from '../services/events';
import { audit, auditMany } from '../services/audit';

/** User management: sync people from HOSxP and decide who may sign in, with which role and menus */
export const usersRouter = Router();
usersRouter.use(requirePermission('manageUsers'));

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const db = () => getPool();

/** Tell other admins' open pages that the user list changed */
const announceUsers = (req: Request, ids: number[] = []) =>
  publishChange({ resource: 'users', action: 'update', ids, by: req.auth!.user.username, byName: req.auth!.user.displayName });

const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ success: false, message: e.message });
      console.error('[users]', req.method, req.originalUrl, e);
      res.status(500).json({ success: false, message: (e as Error).message?.slice(0, 200) || 'เกิดข้อผิดพลาดในการประมวลผล' });
    }
  };

function present(r: RowDataPacket) {
  let menus: string[] = [];
  try {
    menus = r.menus ? normalizeMenus(JSON.parse(r.menus)) : [];
  } catch {
    menus = [];
  }
  return {
    loginName: r.login_name as string,
    displayName: r.display_name as string | null,
    doctorCode: r.doctor_code as string | null,
    groupName: r.group_name as string | null,
    department: r.department as string | null,
    positionName: r.position_name as string | null,
    positionCustom: r.position_custom as string | null,
    licenseNo: r.license_no as string | null,
    hosDisabled: Boolean(r.hos_disabled),
    hosMissing: Boolean(r.hos_missing),
    role: r.role as Role,
    isEnabled: Boolean(r.is_enabled),
    menus,
    note: r.note as string | null,
    lastLogin: r.last_login ? new Date(r.last_login).toISOString() : null,
    syncedAt: r.synced_at ? new Date(r.synced_at).toISOString() : null,
    source: (r.source === 'local' ? 'local' : 'hosxp') as 'local' | 'hosxp',
    passwordChangedAt: r.pw_changed_at ? new Date(r.pw_changed_at).toISOString() : null,
  };
}

// GET /api/users/meta : menu list, roles, counts and the last sync
usersRouter.get('/meta', handle(async (_req, res) => {
  const [log] = await db().query<RowDataPacket[]>(
    'SELECT started_at, finished_at, run_by, status, users_fetched, users_added, users_missing, doctors_fetched, message FROM user_sync_log ORDER BY id DESC LIMIT 1');
  const [counts] = await db().query<RowDataPacket[]>(
    "SELECT COUNT(*) AS total, SUM(is_enabled = 1) AS enabled, SUM(hos_disabled = 1) AS hos_disabled, SUM(hos_missing = 1) AS missing, SUM(source = 'local') AS local FROM app_users");
  const [groups] = await db().query<RowDataPacket[]>(
    'SELECT group_name AS g, COUNT(*) AS n FROM app_users WHERE group_name IS NOT NULL GROUP BY group_name ORDER BY n DESC');
  const c = counts[0];
  const last = log[0];
  res.json({
    success: true,
    data: {
      menus: MENUS,
      roles: ROLES,
      hosConfigured: hosConfigured(),
      counts: {
        total: Number(c.total ?? 0),
        enabled: Number(c.enabled ?? 0),
        hosDisabled: Number(c.hos_disabled ?? 0),
        missing: Number(c.missing ?? 0),
        local: Number(c.local ?? 0),
      },
      groups: groups.map((g) => ({ name: g.g as string, count: Number(g.n) })),
      lastSync: last
        ? {
            startedAt: new Date(last.started_at).toISOString(),
            finishedAt: last.finished_at ? new Date(last.finished_at).toISOString() : null,
            runBy: last.run_by as string | null,
            status: last.status as 'running' | 'ok' | 'error',
            usersFetched: last.users_fetched as number | null,
            usersAdded: last.users_added as number | null,
            usersMissing: last.users_missing as number | null,
            doctorsFetched: last.doctors_fetched as number | null,
            message: last.message as string | null,
          }
        : null,
    },
  });
}));

// GET /api/users : everyone (a few hundred rows; the browser filters)
usersRouter.get('/', handle(async (_req, res) => {
  const [rows] = await db().query<RowDataPacket[]>(
    `SELECT login_name, display_name, doctor_code, group_name, department, position_name, position_custom, license_no, hos_disabled,
            hos_missing, role, is_enabled, menus, note, last_login, synced_at, source, pw_changed_at
       FROM app_users ORDER BY is_enabled DESC, display_name`);
  res.json({ success: true, data: rows.map(present) });
}));

// POST /api/users/sync
usersRouter.post('/sync', handle(async (req, res) => {
  if (!hosConfigured()) throw new HttpError(400, 'ยังไม่ได้ตั้งค่าการเชื่อมต่อ HOSxP (HOS_DB_* ใน backend/.env)');
  try {
    const result = await syncFromHos(req.auth!.user.username);
    announceUsers(req);
    await audit(req, { action: 'sync', resource: 'users', summary: `ซิงก์ผู้ใช้จาก HOSxP: ${result.usersFetched} คน (ใหม่ ${result.usersAdded}) แพทย์/บุคลากร ${result.doctorsFetched}`, after: result });
    res.json({ success: true, data: result });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code && /^(ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND|ER_ACCESS_DENIED_ERROR)$/.test(code)) {
      throw new HttpError(503, 'เชื่อมต่อฐานข้อมูล HOSxP ไม่ได้');
    }
    throw e;
  }
}));

interface Change {
  role?: Role;
  isEnabled?: boolean;
  menus?: string[];
  note?: string | null;
  positionCustom?: string | null;
}

function parseChange(body: unknown): Change {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'ข้อมูลไม่ถูกต้อง');
  const b = body as Record<string, unknown>;
  const out: Change = {};
  if (b.role !== undefined) {
    if (typeof b.role !== 'string' || !ROLES.includes(b.role as Role)) throw new HttpError(400, 'ระดับสิทธิ์ไม่ถูกต้อง');
    out.role = b.role as Role;
  }
  if (b.isEnabled !== undefined) out.isEnabled = b.isEnabled === true;
  if (b.menus !== undefined) {
    if (!Array.isArray(b.menus)) throw new HttpError(400, 'รายการเมนูไม่ถูกต้อง');
    out.menus = normalizeMenus(b.menus);
  }
  if (b.note !== undefined) out.note = b.note === null ? null : String(b.note).trim().slice(0, 255) || null;
  if (b.positionCustom !== undefined) out.positionCustom = b.positionCustom === null ? null : String(b.positionCustom).trim().slice(0, 250) || null;
  return out;
}

async function apply(logins: string[], change: Change, req: Request): Promise<number> {
  const actor = req.auth!.user.username;
  const sets: string[] = [];
  const values: unknown[] = [];
  if (change.role !== undefined) { sets.push('role = ?'); values.push(change.role); }
  if (change.isEnabled !== undefined) { sets.push('is_enabled = ?'); values.push(change.isEnabled ? 1 : 0); }
  if (change.menus !== undefined) { sets.push('menus = ?'); values.push(JSON.stringify(change.menus)); }
  if (change.note !== undefined) { sets.push('note = ?'); values.push(change.note); }
  if (change.positionCustom !== undefined) { sets.push('position_custom = ?'); values.push(change.positionCustom); }
  if (sets.length === 0) throw new HttpError(400, 'ไม่มีข้อมูลที่ต้องแก้ไข');
  const AUDITED = 'login_name, display_name, role, is_enabled, menus, note, position_custom';
  const [beforeRows] = await db().query<RowDataPacket[]>(`SELECT ${AUDITED} FROM app_users WHERE login_name IN (?)`, [logins]);
  const [result] = await db().query<ResultSetHeader>(
    `UPDATE app_users SET ${sets.join(', ')}, updated_by = ? WHERE login_name IN (?)`, [...values, actor, logins]);
  const [afterRows] = await db().query<RowDataPacket[]>(`SELECT ${AUDITED} FROM app_users WHERE login_name IN (?)`, [logins]);
  const after = new Map(afterRows.map((r) => [r.login_name as string, r]));
  const changed = beforeRows.filter((b) => JSON.stringify(b) !== JSON.stringify(after.get(b.login_name)));
  await auditMany(req, changed.map((b) => ({
    action: 'permission' as const, resource: 'users', recordId: b.login_name as string,
    summary: `ปรับสิทธิ์ ${b.display_name ?? b.login_name}${logins.length > 1 ? ` (พร้อมกัน ${logins.length} คน)` : ''}`,
    before: b, after: after.get(b.login_name),
  })));
  // Their current sessions carry the old menus: end them so the change applies at the next sign-in
  revokeSessionsFor(logins);
  return result.affectedRows;
}

const selfGuard = (req: Request, logins: string[], change: Change) => {
  const me = req.auth!.user.username.toLowerCase();
  if (!logins.some((l) => l.toLowerCase() === me)) return;
  if (change.isEnabled === false || (change.role !== undefined && change.role !== 'Admin')) {
    throw new HttpError(400, 'ไม่สามารถปิดสิทธิ์หรือลดระดับสิทธิ์ของบัญชีตัวเองได้');
  }
};

// ---------------------------------------------------------------------------
// Group templates: role + menus for everyone in a HOSxP user group
// ---------------------------------------------------------------------------

function parseTemplate(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const group = typeof b.groupName === 'string' ? b.groupName.trim() : '';
  if (!group || group.length > 250) throw new HttpError(400, 'ชื่อกลุ่มไม่ถูกต้อง');
  if (typeof b.role !== 'string' || !ROLES.includes(b.role as Role)) throw new HttpError(400, 'ระดับสิทธิ์ไม่ถูกต้อง');
  const role = b.role as Role;
  // Admins always see everything, so store the full list for them
  const menus = role === 'Admin' ? MENUS.map((m) => m.id as string) : normalizeMenus(b.menus);
  return { group, role, menus, autoApply: b.autoApply === true };
}

// GET /api/users/templates : one row per group (from HOSxP) with its template, if any
usersRouter.get('/templates', handle(async (_req, res) => {
  const [groups] = await db().query<RowDataPacket[]>(
    `SELECT group_name, COUNT(*) AS members, SUM(hos_disabled = 0) AS active, SUM(is_enabled = 1) AS enabled
       FROM app_users WHERE group_name IS NOT NULL GROUP BY group_name`);
  const [templates] = await db().query<RowDataPacket[]>('SELECT group_name, role, menus, auto_apply, updated_at, updated_by FROM group_templates');
  const byGroup = new Map(templates.map((t) => [t.group_name as string, t]));
  const names = new Set<string>([...groups.map((g) => g.group_name as string), ...byGroup.keys()]);
  const stat = new Map(groups.map((g) => [g.group_name as string, g]));
  const rows = [...names].map((name) => {
    const t = byGroup.get(name);
    const g = stat.get(name);
    let menus: string[] = [];
    try {
      menus = t?.menus ? normalizeMenus(JSON.parse(t.menus)) : [];
    } catch {
      menus = [];
    }
    return {
      groupName: name,
      members: Number(g?.members ?? 0),
      active: Number(g?.active ?? 0),
      enabled: Number(g?.enabled ?? 0),
      template: t
        ? { role: t.role as Role, menus, autoApply: Boolean(t.auto_apply), updatedAt: new Date(t.updated_at).toISOString(), updatedBy: t.updated_by as string | null }
        : null,
    };
  });
  rows.sort((a, b) => b.active - a.active || a.groupName.localeCompare(b.groupName, 'th'));
  res.json({ success: true, data: rows });
}));

// PUT /api/users/templates { groupName, role, menus, autoApply }
usersRouter.put('/templates', handle(async (req, res) => {
  const t = parseTemplate(req.body);
  await db().query(
    `INSERT INTO group_templates (group_name, role, menus, auto_apply, updated_by) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE role = VALUES(role), menus = VALUES(menus), auto_apply = VALUES(auto_apply), updated_by = VALUES(updated_by)`,
    [t.group, t.role, JSON.stringify(t.menus), t.autoApply ? 1 : 0, req.auth!.user.username]);
  await audit(req, { action: 'template', resource: 'users', recordId: t.group, summary: `บันทึกเทมเพลตสิทธิ์กลุ่ม ${t.group}`, after: { role: t.role, menus: t.menus, autoApply: t.autoApply } });
  res.json({ success: true });
}));

// POST /api/users/templates/delete { groupName }
usersRouter.post('/templates/delete', handle(async (req, res) => {
  const group = String((req.body as { groupName?: unknown } | undefined)?.groupName ?? '').trim();
  if (!group) throw new HttpError(400, 'ชื่อกลุ่มไม่ถูกต้อง');
  const [r] = await db().query<ResultSetHeader>('DELETE FROM group_templates WHERE group_name = ?', [group]);
  if (r.affectedRows === 0) throw new HttpError(404, 'ไม่พบเทมเพลตของกลุ่มนี้');
  await audit(req, { action: 'template', resource: 'users', recordId: group, summary: `ลบเทมเพลตสิทธิ์กลุ่ม ${group}` });
  res.json({ success: true });
}));

// POST /api/users/templates/apply { groupName, enable }
// Copies the template's role and menus onto everyone in the group whose HOSxP account is still active.
// Their own later changes are kept: this is a one-time copy, not a live link.
usersRouter.post('/templates/apply', handle(async (req, res) => {
  const b = (req.body ?? {}) as { groupName?: unknown; enable?: unknown };
  const group = typeof b.groupName === 'string' ? b.groupName.trim() : '';
  if (!group) throw new HttpError(400, 'ชื่อกลุ่มไม่ถูกต้อง');
  const [tpl] = await db().query<RowDataPacket[]>('SELECT role, menus FROM group_templates WHERE group_name = ?', [group]);
  if (tpl.length === 0) throw new HttpError(404, 'กลุ่มนี้ยังไม่มีเทมเพลต');
  const [members] = await db().query<RowDataPacket[]>(
    'SELECT login_name FROM app_users WHERE group_name = ? AND hos_disabled = 0 AND hos_missing = 0', [group]);
  const me = req.auth!.user.username.toLowerCase();
  const role = tpl[0].role as Role;
  // Never let a template lower the signed-in admin's own access
  const logins = members.map((m) => m.login_name as string).filter((l) => role === 'Admin' || l.toLowerCase() !== me);
  if (logins.length === 0) throw new HttpError(400, 'ไม่มีสมาชิกที่ใช้งานอยู่ในกลุ่มนี้');
  const change: Change = { role, menus: normalizeMenus(JSON.parse(tpl[0].menus ?? '[]')) };
  if (b.enable === true) change.isEnabled = true;
  const updated = await apply(logins, change, req);
  announceUsers(req);
  res.json({ success: true, data: { updated } });
}));

// ---------------------------------------------------------------------------
// Members added by hand: people who are not in HOSxP (e.g. finance, procurement staff)
// ---------------------------------------------------------------------------

const BUILTIN_NAMES = new Set(['admin', 'doctor', 'staff']);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '') || null;

async function localMember(login: string) {
  const [rows] = await db().query<RowDataPacket[]>('SELECT login_name, display_name, source FROM app_users WHERE login_name = ?', [login]);
  if (!rows[0]) throw new HttpError(404, 'ไม่พบผู้ใช้');
  if (rows[0].source !== 'local') throw new HttpError(400, 'บัญชีนี้มาจาก HOSxP แก้ชื่อและรหัสผ่านได้ที่ HOSxP เท่านั้น');
  return rows[0];
}

// POST /api/users/local { loginName, displayName, positionCustom, department, password, role, menus, isEnabled, note }
usersRouter.post('/local', handle(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const login = typeof b.loginName === 'string' ? b.loginName.trim() : '';
  if (!/^[A-Za-z0-9._-]{3,50}$/.test(login)) throw new HttpError(400, 'ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ ตัวเลข หรือ . _ - ยาว 3-50 ตัวอักษร');
  if (BUILTIN_NAMES.has(login.toLowerCase())) throw new HttpError(400, 'ชื่อผู้ใช้นี้สงวนไว้สำหรับระบบ');
  const displayName = text(b.displayName, 250);
  if (!displayName) throw new HttpError(400, 'กรุณากรอกชื่อ-สกุล');
  const problem = passwordProblem(b.password);
  if (problem) throw new HttpError(400, problem);
  const change = parseChange({ role: b.role ?? 'Staff', menus: b.menus ?? [], isEnabled: b.isEnabled, note: b.note ?? null });
  const menus = change.role === 'Admin' ? MENUS.map((m) => m.id as string) : change.menus ?? [];
  const department = text(b.department, 250);

  const [exists] = await db().query<RowDataPacket[]>('SELECT source FROM app_users WHERE login_name = ?', [login]);
  if (exists[0]) throw new HttpError(409, exists[0].source === 'local' ? 'มีสมาชิกชื่อผู้ใช้นี้อยู่แล้ว' : 'ชื่อผู้ใช้นี้มีอยู่ใน HOSxP แล้ว ให้กำหนดสิทธิ์จากรายชื่อเดิมแทน');

  const { salt, hash } = hashPassword(b.password as string);
  await db().query(
    `INSERT INTO app_users (login_name, display_name, department, position_custom, source, pw_salt, pw_hash, pw_changed_at, role, is_enabled, menus, note, updated_by)
     VALUES (?, ?, ?, ?, 'local', ?, ?, NOW(), ?, ?, ?, ?, ?)`,
    [login, displayName, department, text(b.positionCustom, 250), salt, hash, change.role, change.isEnabled ? 1 : 0, JSON.stringify(menus), change.note ?? null, req.auth!.user.username]);
  await audit(req, {
    action: 'create', resource: 'users', recordId: login, summary: `เพิ่มสมาชิก ${displayName} (${login})`,
    after: { login_name: login, display_name: displayName, department, role: change.role, is_enabled: change.isEnabled ? 1 : 0, menus },
  });
  announceUsers(req);
  const [rows] = await db().query<RowDataPacket[]>('SELECT * FROM app_users WHERE login_name = ?', [login]);
  res.json({ success: true, data: present(rows[0]) });
}));

// PUT /api/users/:login/profile { displayName, department } (members only; HOSxP people come from the sync)
usersRouter.put('/:login/profile', handle(async (req, res) => {
  const login = String(req.params.login);
  const before = await localMember(login);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const displayName = text(b.displayName, 250);
  if (!displayName) throw new HttpError(400, 'กรุณากรอกชื่อ-สกุล');
  const department = text(b.department, 250);
  await db().query('UPDATE app_users SET display_name = ?, department = ?, updated_by = ? WHERE login_name = ?', [displayName, department, req.auth!.user.username, login]);
  await audit(req, { action: 'update', resource: 'users', recordId: login, summary: `แก้ไขข้อมูลสมาชิก ${displayName}`, before: { display_name: before.display_name }, after: { display_name: displayName, department } });
  announceUsers(req);
  res.json({ success: true });
}));

// POST /api/users/:login/password { password } : an admin sets a new password; the member's open sessions end
usersRouter.post('/:login/password', handle(async (req, res) => {
  const login = String(req.params.login);
  const member = await localMember(login);
  const password = (req.body as { password?: unknown } | undefined)?.password;
  const problem = passwordProblem(password);
  if (problem) throw new HttpError(400, problem);
  const { salt, hash } = hashPassword(password as string);
  await db().query('UPDATE app_users SET pw_salt = ?, pw_hash = ?, pw_changed_at = NOW(), updated_by = ? WHERE login_name = ?', [salt, hash, req.auth!.user.username, login]);
  if (login.toLowerCase() !== req.auth!.user.username.toLowerCase()) revokeSessionsFor([login]);
  await audit(req, { action: 'security', resource: 'users', recordId: login, summary: `ตั้งรหัสผ่านใหม่ให้สมาชิก ${member.display_name ?? login}` });
  res.json({ success: true });
}));

// DELETE /api/users/:login (members only; HOSxP people are closed in HOSxP or switched off here)
usersRouter.delete('/:login', handle(async (req, res) => {
  const login = String(req.params.login);
  if (login.toLowerCase() === req.auth!.user.username.toLowerCase()) throw new HttpError(400, 'ไม่สามารถลบบัญชีของตัวเองได้');
  const member = await localMember(login);
  await db().query("DELETE FROM app_users WHERE login_name = ? AND source = 'local'", [login]);
  revokeSessionsFor([login]);
  await audit(req, { action: 'delete', resource: 'users', recordId: login, summary: `ลบสมาชิก ${member.display_name ?? login} (${login})`, before: { login_name: login, display_name: member.display_name } });
  announceUsers(req);
  res.json({ success: true });
}));

// PUT /api/users/:login
usersRouter.put('/:login', handle(async (req, res) => {
  const login = String(req.params.login);
  const change = parseChange(req.body);
  selfGuard(req, [login], change);
  const n = await apply([login], change, req);
  if (n === 0) throw new HttpError(404, 'ไม่พบผู้ใช้');
  announceUsers(req);
  const [rows] = await db().query<RowDataPacket[]>('SELECT * FROM app_users WHERE login_name = ?', [login]);
  res.json({ success: true, data: present(rows[0]) });
}));

// POST /api/users/bulk  { logins: string[], role?, isEnabled?, menus?, note? }
usersRouter.post('/bulk', handle(async (req, res) => {
  const body = (req.body ?? {}) as { logins?: unknown };
  const logins = Array.isArray(body.logins)
    ? [...new Set(body.logins.filter((l): l is string => typeof l === 'string' && l.length > 0 && l.length <= 100))]
    : [];
  if (logins.length === 0 || logins.length > 1000) throw new HttpError(400, 'ต้องเลือกผู้ใช้ 1-1000 คน');
  const change = parseChange(req.body);
  selfGuard(req, logins, change);
  const updated = await apply(logins, change, req);
  announceUsers(req);
  res.json({ success: true, data: { updated } });
}));
