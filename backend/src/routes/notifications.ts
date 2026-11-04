import { Router, Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../services/mysql';

/**
 * Bell notifications, per signed-in user:
 *  - activity: other people's changes to registers this user may open (read/unread tracked per user)
 *  - alerts: conditions that need attention right now (computed from the data, so they disappear when fixed).
 *    An alert counts on the bell only while it is NEW to this user (never seen, or its count went up since);
 *    it stays listed under "ต้องดำเนินการ" until the data is fixed.
 * Each user also chooses which registers notify them (notification_prefs).
 */
export const notificationsRouter = Router();

const db = () => getPool();

const MENU_OF_RESOURCE: Record<string, string> = {
  orders: 'orders', contracts: 'contracts', incoming: 'incoming', guarantees: 'guarantees', progress: 'progress', notes: 'summary',
};

export interface Alert {
  key: string;
  tone: 'bad' | 'warn';
  text: string;
  count: number;
  /** Register to open when the alert is clicked */
  tab: string;
  /** Not seen yet by this user (or the count grew since) */
  isNew?: boolean;
}

interface Prefs {
  /** Registers whose changes appear in the bell; empty = all the user may open */
  muted: string[];
  /** Count "ต้องดำเนินการ" alerts on the bell */
  badgeAlerts: boolean;
}

const DEFAULT_PREFS: Prefs = { muted: [], badgeAlerts: true };

let prefsTable: Promise<void> | null = null;
function ensurePrefsTable(): Promise<void> {
  prefsTable ??= db()
    .query(
      `CREATE TABLE IF NOT EXISTS notification_prefs (
        login_name  VARCHAR(100) NOT NULL PRIMARY KEY,
        alerts_seen TEXT NULL,
        prefs       TEXT NULL,
        updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) DEFAULT CHARSET=utf8mb4 COMMENT='การแจ้งเตือน: เรื่องที่ผู้ใช้เห็นแล้วและการตั้งค่า'`
    )
    .then(() => undefined)
    .catch((e) => {
      prefsTable = null;
      throw e;
    });
  return prefsTable;
}

const parse = <T>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string') return fallback;
  try {
    return { ...fallback, ...(JSON.parse(s) as T) };
  } catch {
    return fallback;
  }
};

async function readPrefs(username: string): Promise<{ prefs: Prefs; seen: Record<string, number> }> {
  await ensurePrefsTable();
  const [rows] = await db().query<RowDataPacket[]>('SELECT alerts_seen, prefs FROM notification_prefs WHERE login_name = ?', [username]);
  return { prefs: parse<Prefs>(rows[0]?.prefs, DEFAULT_PREFS), seen: parse<Record<string, number>>(rows[0]?.alerts_seen, {}) };
}

async function computeAlerts(menus: string[]): Promise<Alert[]> {
  const alerts: Alert[] = [];
  if (menus.includes('guarantees')) {
    const [g] = await db().query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(returned = 0 AND return_due_date < CURDATE()), 0) AS overdue,
              COALESCE(SUM(returned = 0 AND return_due_date >= CURDATE() AND return_due_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)), 0) AS due_soon
         FROM contract_guarantees WHERE deleted_at IS NULL`);
    const overdue = Number(g[0].overdue);
    const soon = Number(g[0].due_soon);
    if (overdue > 0) alerts.push({ key: 'guarantee-overdue', tone: 'bad', text: `หลักประกันสัญญาเลยกำหนดคืน ${overdue} รายการ`, count: overdue, tab: 'guarantees' });
    if (soon > 0) alerts.push({ key: 'guarantee-soon', tone: 'warn', text: `หลักประกันสัญญาครบกำหนดคืนภายใน 30 วัน ${soon} รายการ`, count: soon, tab: 'guarantees' });
  }
  for (const [menu, table, label] of [['orders', 'purchase_orders', 'ใบสั่ง'], ['contracts', 'contracts', 'สัญญา']] as const) {
    if (!menus.includes(menu)) continue;
    const [r] = await db().query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM ${table} WHERE deleted_at IS NULL AND inspected_date IS NULL AND doc_date IS NOT NULL AND doc_date < DATE_SUB(CURDATE(), INTERVAL 30 DAY)`);
    const n = Number(r[0].n);
    if (n > 0) alerts.push({ key: `${menu}-not-inspected`, tone: 'warn', text: `${label}ลงวันที่เกิน 30 วันแล้วแต่ยังไม่ตรวจรับ ${n} รายการ`, count: n, tab: menu });
  }
  return alerts;
}

/** Registers this user may open and has not muted */
const watchedResources = (menus: string[], prefs: Prefs) =>
  Object.entries(MENU_OF_RESOURCE).filter(([r, menu]) => menus.includes(menu) && !prefs.muted.includes(r)).map(([r]) => r);

async function lastSeenId(username: string): Promise<number> {
  const [state] = await db().query<RowDataPacket[]>('SELECT last_seen_id FROM notification_state WHERE login_name = ?', [username]);
  if (state.length > 0) return Number(state[0].last_seen_id);
  // First visit: start from "now" so a new user is not flooded with the whole history
  const [[maxRow]] = (await db().query('SELECT COALESCE(MAX(id), 0) AS m FROM audit_log')) as unknown as [[RowDataPacket]];
  const maxId = Number(maxRow.m);
  await db().query('INSERT INTO notification_state (login_name, last_seen_id) VALUES (?, ?)', [username, maxId]);
  return maxId;
}

const toItem = (r: RowDataPacket, lastSeen: number) => ({
  id: Number(r.id),
  at: new Date(r.at).toISOString(),
  actor: r.actor as string,
  actorName: (r.actor_name as string) || (r.actor as string),
  action: r.action as string,
  resource: r.resource as string,
  recordId: r.record_id as string | null,
  summary: r.summary as string,
  unread: Number(r.id) > lastSeen,
});

// GET /api/notifications : what the bell shows
notificationsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const user = req.auth!.user;
    const [lastSeen, { prefs, seen }] = await Promise.all([lastSeenId(user.username), readPrefs(user.username)]);
    const resources = watchedResources(user.menus, prefs);
    let items: ReturnType<typeof toItem>[] = [];
    let unread = 0;
    if (resources.length > 0) {
      const [rows] = await db().query<RowDataPacket[]>(
        `SELECT id, at, actor, actor_name, action, resource, record_id, summary FROM audit_log
          WHERE action IN ('create', 'update', 'delete') AND resource IN (?) AND actor <> ?
          ORDER BY id DESC LIMIT 30`, [resources, user.username]);
      const [[u]] = (await db().query(
        `SELECT COUNT(*) AS n FROM audit_log WHERE id > ? AND action IN ('create', 'update', 'delete') AND resource IN (?) AND actor <> ?`,
        [lastSeen, resources, user.username])) as unknown as [[RowDataPacket]];
      unread = Number(u.n);
      items = rows.map((r) => toItem(r, lastSeen));
    }
    const alerts = (await computeAlerts(user.menus)).map((a) => ({ ...a, isNew: (seen[a.key] ?? 0) < a.count }));
    const newAlerts = prefs.badgeAlerts ? alerts.filter((a) => a.isNew).length : 0;
    res.json({ success: true, data: { unread, newAlerts, items, alerts, prefs } });
  } catch (e) {
    console.error('[notifications]', e);
    res.status(500).json({ success: false, message: 'โหลดการแจ้งเตือนไม่สำเร็จ' });
  }
});

// POST /api/notifications/read : mark every change up to now as read, and the current alerts as seen
notificationsRouter.post('/read', async (req: Request, res: Response) => {
  try {
    const user = req.auth!.user;
    await ensurePrefsTable();
    const alerts = await computeAlerts(user.menus);
    const seen = Object.fromEntries(alerts.map((a) => [a.key, a.count]));
    await Promise.all([
      db().query(
        `INSERT INTO notification_state (login_name, last_seen_id) VALUES (?, (SELECT COALESCE(MAX(id), 0) FROM audit_log))
         ON DUPLICATE KEY UPDATE last_seen_id = VALUES(last_seen_id)`, [user.username]),
      db().query(
        'INSERT INTO notification_prefs (login_name, alerts_seen) VALUES (?, ?) ON DUPLICATE KEY UPDATE alerts_seen = VALUES(alerts_seen)',
        [user.username, JSON.stringify(seen)]),
    ]);
    res.json({ success: true });
  } catch (e) {
    console.error('[notifications]', e);
    res.status(500).json({ success: false, message: 'บันทึกไม่สำเร็จ' });
  }
});

// GET /api/notifications/history?page=1&size=25&resource=&action=&q=&unread=1 : full history (notification centre)
notificationsRouter.get('/history', async (req: Request, res: Response) => {
  try {
    const user = req.auth!.user;
    const [lastSeen, { prefs }] = await Promise.all([lastSeenId(user.username), readPrefs(user.username)]);
    // History shows every register the user may open (muting only quiets the bell)
    const allowed = watchedResources(user.menus, { ...prefs, muted: [] });
    const size = Math.min(Math.max(Number(req.query.size) || 25, 10), 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const resource = typeof req.query.resource === 'string' && allowed.includes(req.query.resource) ? [req.query.resource] : allowed;
    const action = typeof req.query.action === 'string' && ['create', 'update', 'delete'].includes(req.query.action) ? [req.query.action] : ['create', 'update', 'delete'];
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    if (resource.length === 0) return res.json({ success: true, data: { items: [], total: 0, page, size } });

    const where = ['action IN (?)', 'resource IN (?)', 'actor <> ?'];
    const params: unknown[] = [action, resource, user.username];
    if (q) {
      where.push('(summary LIKE ? OR actor_name LIKE ? OR record_id LIKE ?)');
      const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      params.push(like, like, like);
    }
    if (req.query.unread === '1') {
      where.push('id > ?');
      params.push(lastSeen);
    }
    const clause = where.join(' AND ');
    const [[count]] = (await db().query(`SELECT COUNT(*) AS n FROM audit_log WHERE ${clause}`, params)) as unknown as [[RowDataPacket]];
    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT id, at, actor, actor_name, action, resource, record_id, summary FROM audit_log WHERE ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, size, (page - 1) * size]);
    res.json({ success: true, data: { items: rows.map((r) => toItem(r, lastSeen)), total: Number(count.n), page, size } });
  } catch (e) {
    console.error('[notifications]', e);
    res.status(500).json({ success: false, message: 'โหลดประวัติการแจ้งเตือนไม่สำเร็จ' });
  }
});

// PUT /api/notifications/prefs { muted: string[], badgeAlerts: boolean }
notificationsRouter.put('/prefs', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Partial<Prefs>;
  if (!Array.isArray(body.muted) || typeof body.badgeAlerts !== 'boolean') {
    return res.status(400).json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' });
  }
  const prefs: Prefs = { muted: body.muted.filter((m): m is string => typeof m === 'string' && m in MENU_OF_RESOURCE), badgeAlerts: body.badgeAlerts };
  try {
    await ensurePrefsTable();
    await db().query(
      'INSERT INTO notification_prefs (login_name, prefs) VALUES (?, ?) ON DUPLICATE KEY UPDATE prefs = VALUES(prefs)',
      [req.auth!.user.username, JSON.stringify(prefs)]);
    res.json({ success: true, data: prefs });
  } catch (e) {
    console.error('[notifications]', e);
    res.status(500).json({ success: false, message: 'บันทึกการตั้งค่าไม่สำเร็จ' });
  }
});
