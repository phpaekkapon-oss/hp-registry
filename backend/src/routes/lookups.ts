import { Router, Request, Response } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { requireAuth, requireMenu, requirePermission } from '../services/auth';
import { getPool } from '../services/mysql';
import { writeAudit } from '../services/audit';
import { clientIp } from './auth';

/**
 * Admin page for the dropdown choices (ref_lookup): ผู้รับผิดชอบ, กลุ่ม, แหล่งเงิน, วิธีจัดซื้อ, สถานะ, หน่วยนับ.
 *
 *   GET    /system/lookups            every kind with its values and how many records use each one
 *   POST   /system/lookups            { kind, value }                      add at the end
 *   PUT    /system/lookups/order      { kind, ids: number[] }              new order
 *   PUT    /system/lookups/:id        { value, applyToRecords?: boolean }  rename (optionally in the records too)
 *   DELETE /system/lookups/:id                                             remove the choice (records keep their text)
 */
export const lookupsRouter = Router();
lookupsRouter.use(requireAuth, requirePermission('manageUsers'), requireMenu('usermgmt'));

export const LOOKUP_KINDS = ['staff', 'group', 'fund', 'method', 'status', 'unit'] as const;
type Kind = (typeof LOOKUP_KINDS)[number];

const KIND_TH: Record<Kind, string> = {
  staff: 'ผู้รับผิดชอบ', group: 'กลุ่ม/ฝ่ายเจ้าของเรื่อง', fund: 'แหล่งที่มาของงบประมาณ',
  method: 'วิธีการจัดซื้อจัดจ้าง', status: 'สถานะการจัดซื้อจัดจ้าง', unit: 'หน่วยนับ',
};

/** Where each kind is stored in the registers (table, column) */
const USED_IN: Record<Kind, [string, string][]> = {
  staff: [['purchase_orders', 'responsible'], ['contracts', 'responsible'], ['progress_projects', 'operator']],
  group: [['purchase_orders', 'owner_group'], ['contracts', 'owner_group']],
  fund: [['purchase_orders', 'budget_source'], ['contracts', 'budget_source']],
  method: [['purchase_orders', 'method'], ['contracts', 'method'], ['progress_projects', 'method']],
  status: [['purchase_orders', 'status'], ['contracts', 'status']],
  unit: [['purchase_orders', 'unit'], ['contracts', 'unit']],
};

const db = () => getPool();
const isKind = (k: unknown): k is Kind => typeof k === 'string' && (LOOKUP_KINDS as readonly string[]).includes(k);
const fail = (res: Response, status: number, message: string) => res.status(status).json({ success: false, message });
const log = (req: Request, action: 'create' | 'update' | 'delete', id: number | string, summary: string, before?: unknown, after?: unknown) =>
  writeAudit({ username: req.auth!.user.username, name: req.auth!.user.displayName }, clientIp(req), { action, resource: 'lookups', recordId: id, summary, before, after });

function cleanValue(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  return s && s.length <= 255 ? s : null;
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (e) {
      if ((e as { code?: string }).code === 'ER_DUP_ENTRY') return fail(res, 409, 'มีตัวเลือกนี้อยู่แล้ว');
      console.error('[lookups]', req.method, req.originalUrl, e);
      fail(res, 500, 'เกิดข้อผิดพลาดในการประมวลผล');
    }
  };

async function loadRow(id: number) {
  const [rows] = await db().query<RowDataPacket[]>('SELECT id, kind, value, sort_order FROM ref_lookup WHERE id = ?', [id]);
  return rows[0] as { id: number; kind: Kind; value: string; sort_order: number } | undefined;
}

lookupsRouter.get('/', wrap(async (_req, res) => {
  const [rows] = await db().query<RowDataPacket[]>('SELECT id, kind, value FROM ref_lookup ORDER BY kind, sort_order, id');
  const data = Object.fromEntries(LOOKUP_KINDS.map((k) => [k, { label: KIND_TH[k], items: [] as { id: number; value: string; usage: number }[] }]));
  for (const k of LOOKUP_KINDS) {
    // How many live records use each text, so the admin knows what a rename or delete touches
    const usage = new Map<string, number>();
    for (const [table, col] of USED_IN[k]) {
      const [u] = await db().query<RowDataPacket[]>(`SELECT ${col} AS v, COUNT(*) AS n FROM ${table} WHERE ${col} IS NOT NULL AND deleted_at IS NULL GROUP BY ${col}`);
      for (const r of u) usage.set(r.v, (usage.get(r.v) ?? 0) + Number(r.n));
    }
    data[k].items = rows.filter((r) => r.kind === k).map((r) => ({ id: r.id as number, value: r.value as string, usage: usage.get(r.value) ?? 0 }));
  }
  res.json({ success: true, data });
}));

lookupsRouter.post('/', wrap(async (req, res) => {
  const { kind } = req.body ?? {};
  const value = cleanValue(req.body?.value);
  if (!isKind(kind)) return fail(res, 400, 'ประเภทตัวเลือกไม่ถูกต้อง');
  if (!value) return fail(res, 400, 'กรุณากรอกตัวเลือก (ไม่เกิน 255 ตัวอักษร)');
  const [r] = await db().query<ResultSetHeader>(
    'INSERT INTO ref_lookup (kind, value, sort_order) SELECT ?, ?, COALESCE(MAX(sort_order), 0) + 1 FROM ref_lookup WHERE kind = ?', [kind, value, kind]);
  await log(req, 'create', r.insertId, `เพิ่มตัวเลือก ${KIND_TH[kind]}: ${value}`, undefined, { kind, value });
  res.json({ success: true, data: { id: r.insertId } });
}));

lookupsRouter.put('/order', wrap(async (req, res) => {
  const { kind, ids } = req.body ?? {};
  if (!isKind(kind) || !Array.isArray(ids) || !ids.every((x) => Number.isInteger(x))) return fail(res, 400, 'ข้อมูลไม่ถูกต้อง');
  const conn = await db().getConnection();
  try {
    await conn.beginTransaction();
    for (const [i, id] of (ids as number[]).entries()) {
      await conn.query('UPDATE ref_lookup SET sort_order = ? WHERE id = ? AND kind = ?', [i + 1, id, kind]);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  await log(req, 'update', kind, `เรียงลำดับตัวเลือก ${KIND_TH[kind]} ใหม่`);
  res.json({ success: true });
}));

lookupsRouter.put('/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const row = Number.isInteger(id) ? await loadRow(id) : undefined;
  if (!row) return fail(res, 404, 'ไม่พบตัวเลือกนี้');
  const value = cleanValue(req.body?.value);
  if (!value) return fail(res, 400, 'กรุณากรอกตัวเลือก (ไม่เกิน 255 ตัวอักษร)');
  if (value === row.value) return res.json({ success: true, data: { updatedRecords: 0 } });
  const applyToRecords = req.body?.applyToRecords === true;

  const conn = await db().getConnection();
  let updatedRecords = 0;
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE ref_lookup SET value = ? WHERE id = ?', [value, id]);
    if (applyToRecords) {
      for (const [table, col] of USED_IN[row.kind]) {
        const [r] = await conn.query<ResultSetHeader>(`UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`, [value, row.value]);
        updatedRecords += r.affectedRows;
      }
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  await log(req, 'update', id,
    `แก้ไขตัวเลือก ${KIND_TH[row.kind]}: ${row.value} → ${value}${applyToRecords ? ` (ปรับในทะเบียน ${updatedRecords} รายการ)` : ''}`,
    { value: row.value }, { value });
  res.json({ success: true, data: { updatedRecords } });
}));

lookupsRouter.delete('/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const row = Number.isInteger(id) ? await loadRow(id) : undefined;
  if (!row) return fail(res, 404, 'ไม่พบตัวเลือกนี้');
  await db().query('DELETE FROM ref_lookup WHERE id = ?', [id]);
  await log(req, 'delete', id, `ลบตัวเลือก ${KIND_TH[row.kind]}: ${row.value}`, { kind: row.kind, value: row.value });
  res.json({ success: true });
}));
