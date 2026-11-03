import { Router, Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../services/mysql';
import { requireAuth, requirePermission } from '../services/auth';

/** Audit trail: admins read everything; anyone with a register's menu can read the history of one of its rows */
export const auditRouter = Router();

const db = () => getPool();

const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (e) {
      console.error('[audit]', req.method, req.originalUrl, e);
      res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการประมวลผล' });
    }
  };

const MENU_OF_RESOURCE: Record<string, string> = {
  orders: 'orders', contracts: 'contracts', incoming: 'incoming', guarantees: 'guarantees', progress: 'progress', notes: 'summary',
};

function parseJson(text: unknown): unknown {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function present(r: RowDataPacket) {
  return {
    id: Number(r.id),
    at: new Date(r.at).toISOString(),
    actor: r.actor as string,
    actorName: r.actor_name as string | null,
    action: r.action as string,
    resource: r.resource as string,
    recordId: r.record_id as string | null,
    summary: r.summary as string,
    before: parseJson(r.before_json),
    after: parseJson(r.after_json),
    ip: r.ip as string | null,
  };
}

const text = (v: unknown, max = 100) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

// GET /api/audit?q=&action=&resource=&actor=&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=&offset=
auditRouter.get('/', requirePermission('manageUsers'), handle(async (req, res) => {
  const where: string[] = [];
  const params: unknown[] = [];
  const action = text(req.query.action, 30);
  const resource = text(req.query.resource, 30);
  const actor = text(req.query.actor);
  const q = text(req.query.q);
  const from = day(req.query.from);
  const to = day(req.query.to);
  if (action) { where.push('action = ?'); params.push(action); }
  if (resource) { where.push('resource = ?'); params.push(resource); }
  if (actor) { where.push('actor = ?'); params.push(actor); }
  if (from) { where.push('at >= ?'); params.push(`${from} 00:00:00`); }
  if (to) { where.push('at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(`${to} 00:00:00`); }
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    where.push('(summary LIKE ? OR actor LIKE ? OR actor_name LIKE ? OR record_id LIKE ?)');
    params.push(like, like, like, like);
  }
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 300));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await db().query<RowDataPacket[]>(`SELECT * FROM audit_log ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [count] = await db().query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM audit_log ${clause}`, params);
  const [actors] = await db().query<RowDataPacket[]>('SELECT DISTINCT actor FROM audit_log ORDER BY actor LIMIT 500');
  res.json({ success: true, data: { rows: rows.map(present), total: Number(count[0].n), actors: actors.map((a) => a.actor as string) } });
}));

// GET /api/audit/record?resource=orders&id=12 : history of one row
auditRouter.get('/record', requireAuth, handle(async (req, res) => {
  const resource = text(req.query.resource, 30);
  const id = text(req.query.id);
  const menu = MENU_OF_RESOURCE[resource];
  if (!menu || !id) return res.status(400).json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' });
  if (!req.auth!.user.menus.includes(menu)) return res.status(403).json({ success: false, message: 'คุณไม่ได้รับสิทธิ์เข้าถึงเมนูนี้' });
  const [rows] = await db().query<RowDataPacket[]>(
    'SELECT * FROM audit_log WHERE resource = ? AND record_id = ? ORDER BY id DESC LIMIT 200', [resource, id]);
  res.json({ success: true, data: rows.map(present) });
}));
