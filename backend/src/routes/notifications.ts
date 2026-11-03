import { Router, Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../services/mysql';

/**
 * Bell notifications, per signed-in user:
 *  - activity: other people's changes to registers this user may open (read/unread tracked per user)
 *  - alerts: conditions that need attention right now (computed from the data, so they disappear when fixed)
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

// GET /api/notifications
notificationsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const user = req.auth!.user;
    const [[maxRow]] = (await db().query('SELECT COALESCE(MAX(id), 0) AS m FROM audit_log')) as unknown as [[RowDataPacket]];
    const maxId = Number(maxRow.m);
    const [state] = await db().query<RowDataPacket[]>('SELECT last_seen_id FROM notification_state WHERE login_name = ?', [user.username]);
    let lastSeen: number;
    if (state.length === 0) {
      // First visit: start from "now" so a new user is not flooded with the whole history
      lastSeen = maxId;
      await db().query('INSERT INTO notification_state (login_name, last_seen_id) VALUES (?, ?)', [user.username, maxId]);
    } else {
      lastSeen = Number(state[0].last_seen_id);
    }

    const resources = Object.entries(MENU_OF_RESOURCE).filter(([, menu]) => user.menus.includes(menu)).map(([r]) => r);
    let items: unknown[] = [];
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
      items = rows.map((r) => ({
        id: Number(r.id),
        at: new Date(r.at).toISOString(),
        actor: r.actor as string,
        actorName: (r.actor_name as string) || (r.actor as string),
        action: r.action as string,
        resource: r.resource as string,
        recordId: r.record_id as string | null,
        summary: r.summary as string,
        unread: Number(r.id) > lastSeen,
      }));
    }
    const alerts = await computeAlerts(user.menus);
    res.json({ success: true, data: { unread, items, alerts } });
  } catch (e) {
    console.error('[notifications]', e);
    res.status(500).json({ success: false, message: 'โหลดการแจ้งเตือนไม่สำเร็จ' });
  }
});

// POST /api/notifications/read : mark everything up to now as read
notificationsRouter.post('/read', async (req: Request, res: Response) => {
  try {
    await db().query(
      `INSERT INTO notification_state (login_name, last_seen_id) VALUES (?, (SELECT COALESCE(MAX(id), 0) FROM audit_log))
       ON DUPLICATE KEY UPDATE last_seen_id = VALUES(last_seen_id)`, [req.auth!.user.username]);
    res.json({ success: true });
  } catch (e) {
    console.error('[notifications]', e);
    res.status(500).json({ success: false, message: 'บันทึกไม่สำเร็จ' });
  }
});
