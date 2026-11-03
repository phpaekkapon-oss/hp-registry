import { Router, Request, Response, NextFunction } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../services/mysql';
import { PERMISSIONS, isSessionActive, requirePermission } from '../services/auth';
import { onChange, publishChange, type ChangeEvent } from '../services/events';
import { RESOURCE_TH, audit, auditMany, describeRow } from '../services/audit';

/**
 * Procurement registry API (ทะเบียนคุมใบสั่ง/สัญญา) backed by MySQL.
 *
 *   GET    /procure/lookups                 dropdown values + known vendors (name -> tax ID)
 *   GET    /procure/incoming-options        incoming letters to link an order/contract to (หนังสือรับ)
 *   GET    /procure/link-options            orders/contracts a letter, guarantee or progress project can point at
 *   GET    /procure/:resource/:id/related   an order/contract's case file: letters, guarantees, progress, totals
 *   GET    /procure/:resource/next-no?fy=   next free number for orders/contracts, e.g. 7/2570
 *   GET    /procure/summary?fy=2570
 *   PUT    /procure/notes
 *   GET|POST /procure/progress          GET|PUT|DELETE /procure/progress/:id
 *   GET|POST /procure/:resource         GET|PUT|DELETE /procure/:resource/:id
 *      resource = orders | contracts | incoming | guarantees
 *
 * Roles: any signed-in user may read; create/edit need `create`/`edit`, delete needs `delete`.
 * Tax IDs are masked server-side for roles without `viewPII` (sole proprietors' tax ID = national ID).
 */
export const procureRouter = Router();

/** Current fiscal year (พ.ศ.): October starts the next one. Used when a request does not say which year. */
const currentFiscalYear = (): number => {
  const now = new Date();
  return now.getFullYear() + 543 + (now.getMonth() >= 9 ? 1 : 0);
};

// ---------------------------------------------------------------------------
// Field definitions (whitelist + coercion). Anything not listed here is ignored.
// ---------------------------------------------------------------------------

type FieldType = 's' | 'd' | 'n' | 'i' | 'b';
interface Field {
  k: string;
  t: FieldType;
  max?: number;
  required?: boolean;
}

const s = (k: string, max = 255, required = false): Field => ({ k, t: 's', max, required });
const d = (k: string): Field => ({ k, t: 'd' });
const n = (k: string): Field => ({ k, t: 'n' });
const i = (k: string): Field => ({ k, t: 'i' });
const b = (k: string): Field => ({ k, t: 'b' });

const ORDER_FIELDS: Field[] = [
  i('fiscal_year'), s('responsible', 100), d('received_date'), s('owner_group'), s('agency_type', 100), s('ministry', 150),
  s('agency_name'), s('district', 100), s('province', 100), s('job_title', 1000, true), n('quantity'), s('unit', 50),
  n('budget_amount'), s('budget_source', 150), s('output_code', 50), s('main_activity', 50), s('status', 150), s('method', 100),
  s('doc_no', 50), d('doc_date'), d('vendor_received_date'), s('delivery_due', 100), n('median_price'), n('agreed_price'),
  s('vendor_tax_id', 20), s('vendor_name'), s('project_no', 50), s('approval_no', 50), d('approval_date'),
  s('inspect_report_no', 50), d('inspect_report_date'), d('inspected_date'), d('disbursed_date'), s('note', 1000),
];

interface Resource {
  table: string;
  fields: Field[];
  orderBy: string;
  /** Text columns searched by ?q= */
  search: string[];
  /** Whether rows have a fiscal_year column (guarantees do not) */
  fiscalYear: boolean;
  maskTaxId?: boolean;
}

const RESOURCES: Record<string, Resource> = {
  orders: {
    table: 'purchase_orders', fields: ORDER_FIELDS, orderBy: 'id ASC', fiscalYear: true, maskTaxId: true,
    search: ['job_title', 'vendor_name', 'doc_no', 'responsible', 'project_no', 'owner_group'],
  },
  contracts: {
    table: 'contracts', fields: ORDER_FIELDS, orderBy: 'id ASC', fiscalYear: true, maskTaxId: true,
    search: ['job_title', 'vendor_name', 'doc_no', 'responsible', 'project_no', 'owner_group'],
  },
  incoming: {
    table: 'incoming_docs', orderBy: 'reg_no ASC, id ASC', fiscalYear: true,
    fields: [i('fiscal_year'), i('reg_no'), s('doc_no', 100), d('doc_date'), s('from_name'), s('subject', 1000), n('amount'), s('category')],
    search: ['doc_no', 'from_name', 'subject', 'category'],
  },
  guarantees: {
    table: 'contract_guarantees', orderBy: 'seq_no ASC, id ASC', fiscalYear: false,
    fields: [
      i('seq_no'), b('returned'), d('received_date'), s('detail', 1000), s('title', 1000), s('contract_ref', 500),
      s('project_no', 50), s('vendor_name'), d('return_due_date'), s('return_note', 500),
    ],
    search: ['detail', 'title', 'contract_ref', 'vendor_name', 'project_no'],
  },
};

class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

/** Coerce a client value to the column type; `undefined` = field not sent, `null` = clear it */
function coerce(f: Field, v: unknown): string | number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || (typeof v === 'string' && v.trim() === '')) {
    if (f.required) throw new HttpError(400, `กรุณากรอก ${f.k}`);
    return f.t === 'b' ? 0 : null;
  }
  switch (f.t) {
    case 's': {
      const text = String(v).trim();
      if (text.length > (f.max ?? 255)) throw new HttpError(400, `${f.k} ยาวเกิน ${f.max} ตัวอักษร`);
      return text;
    }
    case 'd': {
      const text = String(v).trim();
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
      const dt = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      if (!m || !dt || dt.getUTCMonth() !== +m[2] - 1 || +m[1] < 1990 || +m[1] > 2200) throw new HttpError(400, `${f.k}: รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD, ค.ศ.)`);
      return text;
    }
    case 'n':
    case 'i': {
      const num = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
      if (!Number.isFinite(num) || Math.abs(num) >= 1e13) throw new HttpError(400, `${f.k}: ตัวเลขไม่ถูกต้อง`);
      return f.t === 'i' ? Math.trunc(num) : Math.round(num * 100) / 100;
    }
    case 'b':
      return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
  }
}

function pick(fields: Field[], body: unknown, forCreate: boolean): Record<string, string | number | null> {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'ข้อมูลไม่ถูกต้อง');
  const input = body as Record<string, unknown>;
  const out: Record<string, string | number | null> = {};
  for (const f of fields) {
    // On create a missing required field is an error; on update it is simply left alone
    if (forCreate && f.required && (input[f.k] === undefined || input[f.k] === null)) throw new HttpError(400, `กรุณากรอก ${f.k}`);
    const v = coerce(f, input[f.k]);
    if (v !== undefined) out[f.k] = v;
  }
  return out;
}

const idParam = (req: Request): number => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'รหัสไม่ถูกต้อง');
  return id;
};

const fyOf = (req: Request): number => {
  const fy = Number(req.query.fy ?? currentFiscalYear());
  return Number.isInteger(fy) && fy > 2500 && fy < 2700 ? fy : currentFiscalYear();
};

// ---------------------------------------------------------------------------
// Period: a fiscal year (ปีงบประมาณ, the fiscal_year column) or a calendar year (ปี พ.ศ., by the row's own date)
// ---------------------------------------------------------------------------

type PeriodMode = 'fiscal' | 'calendar';
const modeOf = (req: Request): PeriodMode => ((req.query.mode ?? (req.body as { mode?: unknown } | undefined)?.mode) === 'calendar' ? 'calendar' : 'fiscal');

/** The date that places a row in a calendar year; falls back to when the row was added so no row is ever hidden */
const CALENDAR_DATE: Record<string, string> = {
  purchase_orders: 'COALESCE(doc_date, received_date, DATE(created_at))',
  contracts: 'COALESCE(doc_date, received_date, DATE(created_at))',
  incoming_docs: 'COALESCE(doc_date, DATE(created_at))',
  contract_guarantees: 'COALESCE(received_date, DATE(created_at))',
  progress_projects: 'COALESCE((SELECT MIN(d.step_date) FROM progress_step_dates d WHERE d.project_id = progress_projects.id), DATE(created_at))',
};
const HAS_FISCAL_COLUMN = new Set(['purchase_orders', 'contracts', 'incoming_docs', 'progress_projects']);

/** SQL condition (and its parameter) selecting the rows of one year of `table` */
function periodWhere(table: string, mode: PeriodMode, year: number): { sql: string; params: unknown[] } {
  if (mode === 'calendar') return { sql: `YEAR(${CALENDAR_DATE[table]}) = ?`, params: [year - 543] };
  // Guarantees have no fiscal year: the fiscal view shows all of them (as before)
  return HAS_FISCAL_COLUMN.has(table) ? { sql: 'fiscal_year = ?', params: [year] } : { sql: '1 = 1', params: [] };
}

/** report_notes is keyed by a number: calendar-year notes live apart from the fiscal-year ones */
const noteYear = (year: number, mode: PeriodMode) => (mode === 'calendar' ? year + 10000 : year);

function maskTaxId(value: unknown): unknown {
  if (typeof value !== 'string' || value.length < 6) return value;
  return value.slice(0, 1) + '•'.repeat(value.length - 3) + value.slice(-2);
}

/** Wraps an async handler: HttpError -> its status, DB failure -> 503, anything else -> 500 */
const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ success: false, message: e.message, ...e.extra });
      const code = (e as { code?: string }).code;
      console.error('[procure]', req.method, req.originalUrl, e);
      if (code && /^(ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND|PROTOCOL_CONNECTION_LOST|ER_ACCESS_DENIED_ERROR|ER_BAD_DB_ERROR)$/.test(code)) {
        return res.status(503).json({ success: false, message: 'เชื่อมต่อฐานข้อมูลไม่ได้' });
      }
      return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการประมวลผล' });
    }
  };

const db = () => getPool();
const who = (req: Request) => req.auth!.user.username;

// ---------------------------------------------------------------------------
// Anti-overwrite (optimistic locking) and recycle bin
// ---------------------------------------------------------------------------

/** Deleted rows stay in the recycle bin this long, then are removed for good */
const TRASH_DAYS = 30;

const sameSecond = (a: unknown, b: unknown) => Math.floor(new Date(a as string).getTime() / 1000) === Math.floor(new Date(b as string).getTime() / 1000);

/**
 * The client sends `expected_updated_at` (the version of the row it opened). If somebody saved the row since,
 * answer 409 with who/when so the user can reload or knowingly overwrite (by sending the current stamp back).
 */
async function assertFresh(resource: string, id: number, current: { updated_at: unknown }, expected: unknown) {
  if (expected === undefined || expected === null || expected === '') return;
  if (sameSecond(current.updated_at, expected)) return;
  const [last] = await db().query<RowDataPacket[]>(
    `SELECT actor, actor_name, at FROM audit_log WHERE resource = ? AND record_id = ? AND action IN ('create', 'update') ORDER BY id DESC LIMIT 1`, [resource, String(id)]);
  throw new HttpError(409, 'มีผู้อื่นแก้ไขรายการนี้ไปแล้ว', {
    code: 'CONFLICT',
    current: {
      updated_at: new Date(current.updated_at as string).toISOString(),
      by: last[0] ? (last[0].actor_name || last[0].actor) : null,
      at: last[0] ? new Date(last[0].at).toISOString() : null,
    },
  });
}

/** Permanently remove rows that have sat in the recycle bin for TRASH_DAYS */
async function purgeTrash() {
  for (const table of ['purchase_orders', 'contracts', 'incoming_docs', 'contract_guarantees', 'progress_projects']) {
    const [r] = await db().query<ResultSetHeader>(`DELETE FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at < DATE_SUB(NOW(), INTERVAL ? DAY)`, [TRASH_DAYS]);
    if (r.affectedRows > 0) console.log(`[trash] purged ${r.affectedRows} row(s) from ${table}`);
  }
}
setTimeout(() => void purgeTrash().catch((e) => console.error('[trash]', e)), 60_000).unref();
setInterval(() => void purgeTrash().catch((e) => console.error('[trash]', e)), 12 * 3600_000).unref();

/** Tell every connected browser that a register changed (they reload it through the normal API) */
const announce = (req: Request, resource: string, action: ChangeEvent['action'], ids: number[]) =>
  publishChange({ resource, action, ids, by: req.auth!.user.username, byName: req.auth!.user.displayName });

// Each register is a menu an admin ticks per user: refuse requests for the ones this user was not given
const MENU_OF_PATH: Record<string, string> = {
  orders: 'orders', contracts: 'contracts', incoming: 'incoming', guarantees: 'guarantees',
  progress: 'progress', summary: 'summary', notes: 'summary',
};
procureRouter.use((req: Request, res: Response, next: NextFunction) => {
  const menus = req.auth?.user.menus ?? [];
  const segment = req.path.split('/')[1] ?? '';
  // Dropdown lookups are shared by every register: anyone with at least one of them may read
  const allowed =
    segment === 'lookups'
      ? Object.values(MENU_OF_PATH).some((m) => menus.includes(m))
      : segment === 'incoming-options' || segment === 'link-options'
      ? ['orders', 'contracts', 'incoming', 'guarantees', 'progress'].some((m) => menus.includes(m))
      : MENU_OF_PATH[segment] === undefined || menus.includes(MENU_OF_PATH[segment]);
  if (!allowed) return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'คุณไม่ได้รับสิทธิ์เข้าถึงเมนูนี้' });
  next();
});

// ---------------------------------------------------------------------------
// Live changes (Server-Sent Events)
// ---------------------------------------------------------------------------

procureRouter.get('/events', (req: Request, res: Response) => {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // do not let a reverse proxy buffer the stream
  });
  res.flushHeaders();
  res.write('retry: 4000\n\n');

  const menus = req.auth?.user.menus ?? [];
  const sid = req.auth?.sid;
  const stop = onChange((event) => {
    // User-management changes only go to people who can open that page
    const menu = event.resource === 'users' ? 'usermgmt' : MENU_OF_PATH[event.resource];
    if (menu && menus.includes(menu)) res.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  // Comment line every 25 s keeps proxies from closing an idle stream; also ends it once the session has expired
  const keepAlive = setInterval(() => {
    if (!isSessionActive(sid)) return res.end();
    res.write(': keep-alive\n\n');
  }, 25_000);
  req.on('close', () => {
    clearInterval(keepAlive);
    stop();
  });
});

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

procureRouter.get('/lookups', handle(async (req, res) => {
  const [rows] = await db().query<RowDataPacket[]>('SELECT kind, value FROM ref_lookup ORDER BY kind, sort_order, id');
  const [steps] = await db().query<RowDataPacket[]>('SELECT step_no, name FROM progress_steps_ref ORDER BY step_no');
  const data: Record<string, string[]> = { staff: [], group: [], fund: [], method: [], status: [], unit: [] };
  for (const r of rows) data[r.kind].push(r.value);

  // Vendors already used in orders/contracts, so the form can suggest them and fill in the tax ID
  const [vendors] = await db().query<RowDataPacket[]>(
    `SELECT vendor_name, MAX(vendor_tax_id) AS tax_id FROM (
       SELECT vendor_name, vendor_tax_id FROM purchase_orders WHERE vendor_name IS NOT NULL AND deleted_at IS NULL
       UNION ALL SELECT vendor_name, vendor_tax_id FROM contracts WHERE vendor_name IS NOT NULL AND deleted_at IS NULL
     ) v GROUP BY vendor_name ORDER BY vendor_name`);
  const canSeeTax = PERMISSIONS[req.auth!.user.role].viewPII;
  const vendorTax: Record<string, string> = {};
  for (const v of vendors) if (canSeeTax && v.tax_id) vendorTax[v.vendor_name] = v.tax_id;
  res.json({ success: true, data: { ...data, vendor: vendors.map((v) => v.vendor_name as string), vendorTax, steps } });
}));

// ---------------------------------------------------------------------------
// Links between registers. An order or contract is the centre of a case; other rows point at it:
//   incoming letters (many: the origin, invoices/delivery notes, others), guarantees, progress projects
// ---------------------------------------------------------------------------

type LinkTarget = 'orders' | 'contracts';
const LINK_TABLE: Record<LinkTarget, string> = { orders: 'purchase_orders', contracts: 'contracts' };
const LINK_TH: Record<LinkTarget, string> = { orders: 'ใบสั่งซื้อ/จ้าง', contracts: 'สัญญา' };
const ROLE_TH: Record<string, string> = { origin: 'ต้นเรื่องของ', invoice: 'ใบแจ้งหนี้/ส่งของของ', other: 'เกี่ยวกับ' };
const LINK_ROLES = ['origin', 'invoice', 'other'];
/** Tables whose rows may point at an order/contract, and the API name of each */
const LINKED_FROM: Record<string, string> = { incoming_docs: 'incoming', contract_guarantees: 'guarantees', progress_projects: 'progress' };
const KEY_OF_TABLE: Record<string, LinkTarget> = { purchase_orders: 'orders', contracts: 'contracts' };

/** "รับที่ 12/2570 · สธ 0410/123 · เรื่อง..." : how a letter is shown in lists and exports */
const incomingRef = (d: RowDataPacket) =>
  [d.reg_no ? `รับที่ ${d.reg_no}${d.fiscal_year ? `/${d.fiscal_year}` : ''}` : null, d.doc_no, d.subject].filter(Boolean).join(' · ');

/** Labels for "orders:5"-style references: "ใบสั่งซื้อ/จ้าง 1/2570" */
async function targetLabels(refs: { link_resource: string | null; link_id: number | null }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const res of Object.keys(LINK_TABLE) as LinkTarget[]) {
    const ids = [...new Set(refs.filter((r) => r.link_resource === res && r.link_id).map((r) => r.link_id as number))];
    if (ids.length === 0) continue;
    const [rows] = await db().query<RowDataPacket[]>(`SELECT id, doc_no, deleted_at FROM ${LINK_TABLE[res]} WHERE id IN (?)`, [ids]);
    for (const r of rows) out.set(`${res}:${r.id}`, `${LINK_TH[res]} ${r.doc_no ?? `#${r.id}`}${r.deleted_at ? ' (ถูกลบ)' : ''}`);
  }
  return out;
}

/**
 * Reads the link a form sent (link_ref = "orders:5" or "" to clear; incoming also link_role) into column values.
 * undefined = the form did not send it (leave as is).
 */
async function linkValues(body: unknown, withRole: boolean): Promise<Record<string, string | number | null> | undefined> {
  const b = (body ?? {}) as { link_ref?: unknown; link_role?: unknown };
  if (b.link_ref === undefined) return undefined;
  const ref = typeof b.link_ref === 'string' ? b.link_ref.trim() : '';
  if (!ref) return withRole ? { link_resource: null, link_id: null, link_role: null } : { link_resource: null, link_id: null };
  const m = /^(orders|contracts):(\d+)$/.exec(ref);
  if (!m) throw new HttpError(400, 'การอ้างอิงใบสั่ง/สัญญาไม่ถูกต้อง');
  const [found] = await db().query<RowDataPacket[]>(`SELECT id FROM ${LINK_TABLE[m[1] as LinkTarget]} WHERE id = ? AND deleted_at IS NULL`, [Number(m[2])]);
  if (found.length === 0) throw new HttpError(400, 'ไม่พบใบสั่ง/สัญญาที่อ้างอิง');
  const out: Record<string, string | number | null> = { link_resource: m[1], link_id: Number(m[2]) };
  if (withRole) out.link_role = typeof b.link_role === 'string' && LINK_ROLES.includes(b.link_role) ? b.link_role : 'invoice';
  return out;
}

/** The order/contract form picks "the letter this came from": that is stored on the letter (role origin) */
async function syncOrigin(req: Request, resource: LinkTarget, id: number, body: unknown) {
  const raw = (body as { incoming_id?: unknown } | undefined)?.incoming_id;
  if (raw === undefined) return;
  const letter = raw === null || raw === '' ? null : Number(raw);
  if (letter !== null && (!Number.isInteger(letter) || letter < 1)) throw new HttpError(400, 'หนังสือรับที่อ้างอิงไม่ถูกต้อง');
  const [cleared] = await db().query<ResultSetHeader>(
    "UPDATE incoming_docs SET link_resource = NULL, link_id = NULL, link_role = NULL WHERE link_resource = ? AND link_id = ? AND link_role = 'origin' AND id <> ?",
    [resource, id, letter ?? 0]);
  let set = 0;
  if (letter !== null) {
    const [r] = await db().query<ResultSetHeader>(
      "UPDATE incoming_docs SET link_resource = ?, link_id = ?, link_role = 'origin' WHERE id = ? AND deleted_at IS NULL AND NOT (link_resource <=> ? AND link_id <=> ? AND link_role <=> 'origin')",
      [resource, id, letter, resource, id]);
    set = r.affectedRows;
  }
  if (cleared.affectedRows + set > 0) announce(req, 'incoming', 'update', letter ? [letter] : []);
}

/** Adds both sides of the links to rows about to be sent (worked out on the fly: never stored, never audited) */
async function attachLinks(table: string, rows: RowDataPacket[]): Promise<void> {
  if (rows.length === 0) return;
  const target = KEY_OF_TABLE[table];
  if (target) {
    const ids = rows.map((r) => r.id as number);
    const [letters] = await db().query<RowDataPacket[]>(
      `SELECT id, link_id, link_role, fiscal_year, reg_no, doc_no, subject, amount FROM incoming_docs
        WHERE link_resource = ? AND link_id IN (?) AND deleted_at IS NULL ORDER BY doc_date, reg_no`, [target, ids]);
    const [guarantees] = await db().query<RowDataPacket[]>(
      'SELECT link_id, COUNT(*) AS n, SUM(returned = 0) AS open FROM contract_guarantees WHERE link_resource = ? AND link_id IN (?) AND deleted_at IS NULL GROUP BY link_id', [target, ids]);
    const [progress] = await db().query<RowDataPacket[]>(
      'SELECT link_id, MIN(id) AS id FROM progress_projects WHERE link_resource = ? AND link_id IN (?) AND deleted_at IS NULL GROUP BY link_id', [target, ids]);
    const g = new Map(guarantees.map((x) => [x.link_id as number, x]));
    const p = new Map(progress.map((x) => [x.link_id as number, x.id as number]));
    for (const r of rows) {
      const mine = letters.filter((l) => l.link_id === r.id);
      const origin = mine.find((l) => l.link_role === 'origin');
      const invoices = mine.filter((l) => l.link_role === 'invoice');
      r.incoming_id = origin ? origin.id : null;
      if (origin) {
        r.incoming_reg_no = origin.reg_no;
        r.incoming_fiscal_year = origin.fiscal_year;
        r.incoming_doc_no = origin.doc_no;
        r.incoming_subject = origin.subject;
        r.incoming_ref = incomingRef(origin);
      }
      r.letter_count = mine.length;
      r.invoice_count = invoices.length;
      r.invoice_total = invoices.reduce((sum, l) => sum + Number(l.amount ?? 0), 0);
      r.guarantee_count = Number(g.get(r.id)?.n ?? 0);
      r.guarantee_open = Number(g.get(r.id)?.open ?? 0);
      r.progress_id = p.get(r.id) ?? null;
    }
  } else if (LINKED_FROM[table]) {
    const labels = await targetLabels(rows as { link_resource: string | null; link_id: number | null }[]);
    for (const r of rows) {
      const key = r.link_resource && r.link_id ? `${r.link_resource}:${r.link_id}` : '';
      r.link_ref = key || null;
      const label = key ? labels.get(key) ?? null : null;
      r.link_label = label && table === 'incoming_docs' && r.link_role ? `${ROLE_TH[r.link_role] ?? ''} ${label}`.trim() : label;
    }
  }
}

// Letters to pick from in the order/contract form (newest first), with what each already belongs to
procureRouter.get('/incoming-options', handle(async (_req, res) => {
  const [rows] = await db().query<RowDataPacket[]>(
    `SELECT id, fiscal_year, reg_no, doc_no, doc_date, from_name, subject, amount, link_resource, link_id, link_role FROM incoming_docs
      WHERE deleted_at IS NULL ORDER BY fiscal_year DESC, reg_no DESC, id DESC LIMIT 3000`);
  await attachLinks('incoming_docs', rows);
  res.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id, fiscal_year: r.fiscal_year, reg_no: r.reg_no, doc_no: r.doc_no, doc_date: r.doc_date, from_name: r.from_name, subject: r.subject,
      amount: r.amount === null ? null : Number(r.amount), link_ref: r.link_ref, link_role: r.link_role, linked: r.link_label ? [r.link_label] : [],
    })),
  });
}));

// Orders and contracts to pick from when linking a letter, guarantee or progress project (newest first)
procureRouter.get('/link-options', handle(async (_req, res) => {
  const out: RowDataPacket[] = [];
  for (const res2 of Object.keys(LINK_TABLE) as LinkTarget[]) {
    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT id, fiscal_year, doc_no, doc_date, job_title, vendor_name, agreed_price, project_no FROM ${LINK_TABLE[res2]}
        WHERE deleted_at IS NULL ORDER BY fiscal_year DESC, id DESC LIMIT 3000`);
    await attachLinks(LINK_TABLE[res2], rows);
    for (const r of rows) {
      out.push({
        ref: `${res2}:${r.id}`, resource: res2, kind: LINK_TH[res2], id: r.id, fiscal_year: r.fiscal_year, doc_no: r.doc_no, doc_date: r.doc_date,
        job_title: r.job_title, vendor_name: r.vendor_name, project_no: r.project_no,
        agreed_price: r.agreed_price === null ? null : Number(r.agreed_price), invoice_total: r.invoice_total, invoice_count: r.invoice_count,
      } as RowDataPacket);
    }
  }
  res.json({ success: true, data: out });
}));

// ---------------------------------------------------------------------------
// Summary report (รายงานสรุป)
// ---------------------------------------------------------------------------

const METHOD_BUCKETS = [
  { key: 'open', label: 'วิธีประกาศเชิญชวนทั่วไป', test: /ประกาศเชิญชวน|ทั่วไป|e-?bidding/i },
  { key: 'select', label: 'วิธีคัดเลือก', test: /คัดเลือก/ },
  { key: 'specific', label: 'วิธีเฉพาะเจาะจง', test: /เฉพาะเจาะจง|เจาะจง/ },
  { key: 'contest', label: 'วิธีประกวดแบบ', test: /ประกวดแบบ/ },
  { key: 'other', label: 'อื่น ๆ', test: /.*/ },
] as const;

procureRouter.get('/summary', handle(async (req, res) => {
  const fy = fyOf(req);
  const mode = modeOf(req);
  const bucketize = async (table: string) => {
    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT method, COUNT(*) AS cnt, COALESCE(SUM(COALESCE(agreed_price, budget_amount, 0)), 0) AS amount
         FROM ${table} WHERE ${periodWhere(table, mode, fy).sql} AND deleted_at IS NULL GROUP BY method`, periodWhere(table, mode, fy).params);
    const buckets = METHOD_BUCKETS.map((m) => ({ key: m.key, label: m.label, count: 0, amount: 0 }));
    for (const r of rows) {
      const idx = METHOD_BUCKETS.findIndex((m) => m.test.test(r.method ?? ''));
      buckets[idx].count += Number(r.cnt);
      buckets[idx].amount += Number(r.amount);
    }
    return buckets;
  };
  const byStatus = async (table: string) => {
    const [rows] = await db().query<RowDataPacket[]>(
      `SELECT COALESCE(status, 'ไม่ระบุ') AS status, COUNT(*) AS cnt FROM ${table} WHERE ${periodWhere(table, mode, fy).sql} AND deleted_at IS NULL GROUP BY status ORDER BY cnt DESC`, periodWhere(table, mode, fy).params);
    return rows.map((r) => ({ status: r.status as string, count: Number(r.cnt) }));
  };
  const [orders, contracts, orderStatus, contractStatus] = await Promise.all([
    bucketize('purchase_orders'), bucketize('contracts'), byStatus('purchase_orders'), byStatus('contracts'),
  ]);
  const [g] = await db().query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(returned = 0), 0) AS pending,
            COALESCE(SUM(returned = 0 AND return_due_date < CURDATE()), 0) AS overdue,
            COALESCE(SUM(returned = 0 AND return_due_date >= CURDATE() AND return_due_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)), 0) AS due_soon
       FROM contract_guarantees WHERE ${periodWhere('contract_guarantees', mode, fy).sql} AND deleted_at IS NULL`, periodWhere('contract_guarantees', mode, fy).params);
  // Row counts for the tab badges
  const tablesForCounts = ['purchase_orders', 'contracts', 'incoming_docs', 'contract_guarantees', 'progress_projects'] as const;
  const parts = tablesForCounts.map((tb) => periodWhere(tb, mode, fy));
  const [cnt] = await db().query<RowDataPacket[]>(
    `SELECT ${tablesForCounts.map((tb, i) => `(SELECT COUNT(*) FROM ${tb} WHERE ${parts[i].sql} AND deleted_at IS NULL) AS c${i}`).join(', ')}`,
    parts.flatMap((p) => p.params));
  cnt[0].orders = cnt[0].c0; cnt[0].contracts = cnt[0].c1; cnt[0].incoming = cnt[0].c2; cnt[0].guarantees = cnt[0].c3; cnt[0].progress = cnt[0].c4;
  const counts = { orders: Number(cnt[0].orders), contracts: Number(cnt[0].contracts), incoming: Number(cnt[0].incoming), guarantees: Number(cnt[0].guarantees), progress: Number(cnt[0].progress) };
  const [noteRows] = await db().query<RowDataPacket[]>('SELECT kind, content FROM report_notes WHERE fiscal_year = ?', [noteYear(fy, mode)]);
  const notes = { problem: '', suggestion: '' };
  for (const r of noteRows) notes[r.kind as 'problem' | 'suggestion'] = r.content;
  res.json({
    success: true,
    data: {
      fiscalYear: fy,
      counts,
      orders, contracts, orderStatus, contractStatus,
      guarantees: { total: Number(g[0].total), pending: Number(g[0].pending), overdue: Number(g[0].overdue), dueSoon: Number(g[0].due_soon) },
      notes,
    },
  });
}));

procureRouter.put('/notes', requirePermission('edit'), handle(async (req, res) => {
  const { fiscal_year, kind, content } = (req.body ?? {}) as Record<string, unknown>;
  const fy = noteYear(Number(fiscal_year ?? currentFiscalYear()), modeOf(req));
  if (!Number.isInteger(fy) || (kind !== 'problem' && kind !== 'suggestion')) throw new HttpError(400, 'ข้อมูลไม่ถูกต้อง');
  const text = String(content ?? '').slice(0, 20000);
  const [oldNote] = await db().query<RowDataPacket[]>('SELECT content FROM report_notes WHERE fiscal_year = ? AND kind = ?', [fy, kind]);
  await db().query(
    `INSERT INTO report_notes (fiscal_year, kind, content, updated_by) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE content = VALUES(content), updated_by = VALUES(updated_by)`, [fy, kind, text, who(req)]);
  announce(req, 'notes', 'update', []);
  if ((oldNote[0]?.content ?? '') !== text) {
    await audit(req, {
      action: 'update', resource: 'notes', recordId: `${fy}/${kind}`,
      summary: `แก้ไข${kind === 'problem' ? 'ปัญหา/อุปสรรค' : 'ข้อเสนอแนะ'} ปีงบประมาณ ${fy}`,
      before: oldNote.length ? { content: oldNote[0].content } : null, after: { content: text },
    });
  }
  res.json({ success: true });
}));

// ---------------------------------------------------------------------------
// Progress timeline (ความก้าวหน้า): a project with a date per step (1-17)
// ---------------------------------------------------------------------------

const PROGRESS_FIELDS: Field[] = [i('fiscal_year'), i('seq_no'), s('project', 1000, true), s('method', 100), s('operator', 100)];

type StepMap = Record<string, string | null>;

function parseSteps(input: unknown): [number, string | null][] {
  if (input === undefined) return [];
  if (!input || typeof input !== 'object') throw new HttpError(400, 'steps ไม่ถูกต้อง');
  return Object.entries(input as StepMap).map(([k, v]) => {
    const no = Number(k);
    if (!Number.isInteger(no) || no < 1 || no > 17) throw new HttpError(400, 'หมายเลขขั้นตอนต้องอยู่ระหว่าง 1-17');
    return [no, coerce({ k: `step ${no}`, t: 'd' }, v) as string | null];
  });
}

async function loadProgress(fy: number, onlyId?: number, mode: PeriodMode = 'fiscal') {
  const pw = periodWhere('progress_projects', mode, fy);
  const [projects] = await db().query<RowDataPacket[]>(
    `SELECT id, fiscal_year, seq_no, project, method, operator, link_resource, link_id, updated_at FROM progress_projects
      WHERE ${pw.sql} AND deleted_at IS NULL ${onlyId ? 'AND id = ?' : ''} ORDER BY seq_no, id`, onlyId ? [...pw.params, onlyId] : pw.params);
  if (projects.length === 0) return [];
  await attachLinks('progress_projects', projects);
  const [dates] = await db().query<RowDataPacket[]>(
    'SELECT project_id, step_no, step_date FROM progress_step_dates WHERE project_id IN (?)', [projects.map((p) => p.id)]);
  return projects.map((p) => {
    const steps: StepMap = {};
    for (const r of dates) if (r.project_id === p.id) steps[String(r.step_no)] = r.step_date;
    return { ...p, steps };
  });
}

async function saveSteps(projectId: number, steps: [number, string | null][]) {
  for (const [no, date] of steps) {
    if (date === null) await db().query('DELETE FROM progress_step_dates WHERE project_id = ? AND step_no = ?', [projectId, no]);
    else await db().query('INSERT INTO progress_step_dates (project_id, step_no, step_date) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE step_date = VALUES(step_date)', [projectId, no, date]);
  }
}

procureRouter.get('/progress', handle(async (req, res) => {
  const data = await loadProgress(fyOf(req), undefined, modeOf(req));
  res.json({ success: true, count: data.length, data });
}));

procureRouter.post('/progress', requirePermission('create'), handle(async (req, res) => {
  const values = { ...pick(PROGRESS_FIELDS, req.body, true), ...(await linkValues(req.body, false)) };
  const steps = parseSteps((req.body as { steps?: unknown }).steps);
  values.fiscal_year ??= currentFiscalYear();
  const cols = Object.keys(values);
  const [r] = await db().query<ResultSetHeader>(
    `INSERT INTO progress_projects (${cols.join(', ')}, created_by) VALUES (${cols.map(() => '?').join(', ')}, ?)`, [...Object.values(values), who(req)]);
  await saveSteps(r.insertId, steps);
  announce(req, 'progress', 'create', [r.insertId]);
  const [row] = await loadProgress(Number(values.fiscal_year), r.insertId);
  await audit(req, { action: 'create', resource: 'progress', recordId: r.insertId, summary: `เพิ่มโครงการความก้าวหน้า ${describeRow('progress', row)}`, after: row });
  res.status(201).json({ success: true, data: row });
}));

procureRouter.put('/progress/:id', requirePermission('edit'), handle(async (req, res) => {
  const id = idParam(req);
  const values = { ...pick(PROGRESS_FIELDS, req.body, false), ...(await linkValues(req.body, false)) };
  const steps = parseSteps((req.body as { steps?: unknown }).steps);
  const cols = Object.keys(values);
  const [fyBefore] = await db().query<RowDataPacket[]>('SELECT fiscal_year FROM progress_projects WHERE id = ? AND deleted_at IS NULL', [id]);
  if (fyBefore.length === 0) throw new HttpError(404, 'ไม่พบรายการ');
  const [beforeRow] = await loadProgress(fyBefore[0].fiscal_year, id);
  await assertFresh('progress', id, beforeRow as unknown as { updated_at: unknown },(req.body as { expected_updated_at?: unknown }).expected_updated_at);
  if (cols.length > 0) await db().query(`UPDATE progress_projects SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...Object.values(values), id]);
  await saveSteps(id, steps);
  const [fyRow] = await db().query<RowDataPacket[]>('SELECT fiscal_year FROM progress_projects WHERE id = ?', [id]);
  announce(req, 'progress', 'update', [id]);
  let [row] = await loadProgress(fyRow[0].fiscal_year, id);
  const strip = (p: unknown) => JSON.stringify({ ...(p as object), updated_at: 0 });
  if (strip(beforeRow) !== strip(row)) {
    // Step dates live in another table, so stamp the project row to make the change visible to the anti-overwrite check
    await db().query('UPDATE progress_projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    [row] = await loadProgress(fyRow[0].fiscal_year, id);
    await audit(req, { action: 'update', resource: 'progress', recordId: id, summary: `แก้ไขความก้าวหน้า ${describeRow('progress', row)}`, before: beforeRow, after: row });
  }
  res.json({ success: true, data: row });
}));

procureRouter.delete('/progress/:id', requirePermission('delete'), handle(async (req, res) => {
  const id = idParam(req);
  const [fyOld] = await db().query<RowDataPacket[]>('SELECT fiscal_year FROM progress_projects WHERE id = ? AND deleted_at IS NULL', [id]);
  const [oldRow] = fyOld.length ? await loadProgress(fyOld[0].fiscal_year, id) : [];
  const [r] = await db().query<ResultSetHeader>('UPDATE progress_projects SET deleted_at = NOW(), deleted_by = ? WHERE id = ? AND deleted_at IS NULL', [who(req), id]);
  if (r.affectedRows === 0) throw new HttpError(404, 'ไม่พบรายการ');
  announce(req, 'progress', 'delete', [id]);
  await audit(req, { action: 'delete', resource: 'progress', recordId: id, summary: `ลบความก้าวหน้า ${describeRow('progress', oldRow)} (กู้คืนได้ภายใน ${TRASH_DAYS} วัน)`, before: oldRow });
  res.json({ success: true });
}));

// Recycle bin for progress projects
procureRouter.get('/progress/trash', requirePermission('delete'), handle(async (_req, res) => {
  const [rows] = await db().query<RowDataPacket[]>(
    'SELECT id, fiscal_year, seq_no, project, method, operator, deleted_at, deleted_by FROM progress_projects WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500');
  res.json({ success: true, count: rows.length, data: rows });
}));

procureRouter.post('/progress/:id/restore', requirePermission('delete'), handle(async (req, res) => {
  const id = idParam(req);
  const [r] = await db().query<ResultSetHeader>('UPDATE progress_projects SET deleted_at = NULL, deleted_by = NULL WHERE id = ? AND deleted_at IS NOT NULL', [id]);
  if (r.affectedRows === 0) throw new HttpError(404, 'ไม่พบรายการในถังขยะ');
  const [fy] = await db().query<RowDataPacket[]>('SELECT fiscal_year FROM progress_projects WHERE id = ?', [id]);
  const [row] = await loadProgress(fy[0].fiscal_year, id);
  announce(req, 'progress', 'create', [id]);
  await audit(req, { action: 'create', resource: 'progress', recordId: id, summary: `กู้คืนความก้าวหน้า ${describeRow('progress', row)}`, after: row });
  res.json({ success: true, data: row });
}));

// ---------------------------------------------------------------------------
// Generic CRUD: orders | contracts | incoming | guarantees
// ---------------------------------------------------------------------------

function resourceOf(req: Request): Resource {
  const r = RESOURCES[String(req.params.resource)];
  if (!r) throw new HttpError(404, 'ไม่พบข้อมูลที่ร้องขอ');
  return r;
}

function present(r: Resource, row: RowDataPacket, req: Request) {
  const out: Record<string, unknown> = { ...row };
  if (r.maskTaxId && !PERMISSIONS[req.auth!.user.role].viewPII) out.vendor_tax_id = maskTaxId(out.vendor_tax_id);
  if ('returned' in out) out.returned = Boolean(out.returned);
  return out;
}

procureRouter.get('/:resource', handle(async (req, res) => {
  const r = resourceOf(req);
  const where: string[] = [];
  const params: unknown[] = [];
  if (r.fiscalYear || modeOf(req) === 'calendar') {
    const pw = periodWhere(r.table, modeOf(req), fyOf(req));
    where.push(pw.sql);
    params.push(...pw.params);
  }
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  if (q) {
    where.push(`(${r.search.map((c) => `${c} LIKE ?`).join(' OR ')})`);
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    params.push(...r.search.map(() => like));
  }
  const [rows] = await db().query<RowDataPacket[]>(
    `SELECT * FROM ${r.table} WHERE ${['deleted_at IS NULL', ...where].join(' AND ')} ORDER BY ${r.orderBy} LIMIT 5000`, params);
  await attachLinks(r.table, rows);
  res.json({ success: true, count: rows.length, data: rows.map((row) => present(r, row, req)) });
}));

// Next number in the "N/FY" series: highest N already used for that fiscal year + 1
procureRouter.get('/:resource/next-no', handle(async (req, res) => {
  const r = resourceOf(req);
  if (r.table !== 'purchase_orders' && r.table !== 'contracts') throw new HttpError(404, 'ไม่พบข้อมูลที่ร้องขอ');
  const fy = fyOf(req);
  const [rows] = await db().query<RowDataPacket[]>(
    `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(doc_no, '/', 1) AS UNSIGNED)), 0) AS last_no
       FROM ${r.table} WHERE fiscal_year = ? AND doc_no REGEXP '^[0-9]+/[0-9]+$'`, [fy]);
  res.json({ success: true, data: { docNo: `${Number(rows[0].last_no) + 1}/${fy}` } });
}));

// Recycle bin: rows deleted within the last TRASH_DAYS days
procureRouter.get('/:resource/trash', requirePermission('delete'), handle(async (req, res) => {
  const r = resourceOf(req);
  const [rows] = await db().query<RowDataPacket[]>(`SELECT * FROM ${r.table} WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500`);
  res.json({ success: true, count: rows.length, data: rows.map((row) => present(r, row, req)) });
}));

procureRouter.post('/:resource/:id/restore', requirePermission('delete'), handle(async (req, res) => {
  const r = resourceOf(req);
  const id = idParam(req);
  const key = String(req.params.resource);
  const [result] = await db().query<ResultSetHeader>(`UPDATE ${r.table} SET deleted_at = NULL, deleted_by = NULL WHERE id = ? AND deleted_at IS NOT NULL`, [id]);
  if (result.affectedRows === 0) throw new HttpError(404, 'ไม่พบรายการในถังขยะ');
  const [rows] = await db().query<RowDataPacket[]>(`SELECT * FROM ${r.table} WHERE id = ?`, [id]);
  announce(req, key, 'create', [id]);
  await audit(req, { action: 'create', resource: key, recordId: id, summary: `กู้คืน${RESOURCE_TH[key]} ${describeRow(key, rows[0])}`, after: rows[0] });
  res.json({ success: true, data: present(r, rows[0], req) });
}));

// Case file of an order/contract: everything linked to it, plus money billed so far
procureRouter.get('/:resource/:id/related', handle(async (req, res) => {
  const resource = String(req.params.resource) as LinkTarget;
  if (!LINK_TABLE[resource]) throw new HttpError(404, 'ไม่พบข้อมูลที่ร้องขอ');
  const id = idParam(req);
  const [own] = await db().query<RowDataPacket[]>(`SELECT id, agreed_price, budget_amount FROM ${LINK_TABLE[resource]} WHERE id = ? AND deleted_at IS NULL`, [id]);
  if (own.length === 0) throw new HttpError(404, 'ไม่พบรายการ');
  const [letters] = await db().query<RowDataPacket[]>(
    `SELECT id, fiscal_year, reg_no, doc_no, doc_date, from_name, subject, amount, category, link_role FROM incoming_docs
      WHERE link_resource = ? AND link_id = ? AND deleted_at IS NULL ORDER BY doc_date, reg_no`, [resource, id]);
  const [guarantees] = await db().query<RowDataPacket[]>(
    `SELECT id, seq_no, returned, received_date, detail, contract_ref, return_due_date, return_note FROM contract_guarantees
      WHERE link_resource = ? AND link_id = ? AND deleted_at IS NULL ORDER BY received_date`, [resource, id]);
  const [progress] = await db().query<RowDataPacket[]>(
    `SELECT p.id, p.fiscal_year, p.project, COUNT(d.step_no) AS steps_done, MAX(d.step_date) AS last_date
       FROM progress_projects p LEFT JOIN progress_step_dates d ON d.project_id = p.id
      WHERE p.link_resource = ? AND p.link_id = ? AND p.deleted_at IS NULL GROUP BY p.id`, [resource, id]);
  const agreed = own[0].agreed_price === null ? (own[0].budget_amount === null ? null : Number(own[0].budget_amount)) : Number(own[0].agreed_price);
  const billed = letters.filter((l) => l.link_role === 'invoice').reduce((s, l) => s + Number(l.amount ?? 0), 0);
  res.json({
    success: true,
    data: {
      letters: letters.map((l) => ({ ...l, amount: l.amount === null ? null : Number(l.amount) })),
      guarantees: guarantees.map((g) => ({ ...g, returned: Boolean(g.returned) })),
      progress: progress.map((p) => ({ ...p, steps_done: Number(p.steps_done) })),
      totals: { agreed, billed, remaining: agreed === null ? null : Math.round((agreed - billed) * 100) / 100, invoices: letters.filter((l) => l.link_role === 'invoice').length },
    },
  });
}));

procureRouter.get('/:resource/:id', handle(async (req, res) => {
  const r = resourceOf(req);
  const [rows] = await db().query<RowDataPacket[]>(`SELECT * FROM ${r.table} WHERE id = ? AND deleted_at IS NULL`, [idParam(req)]);
  if (rows.length === 0) throw new HttpError(404, 'ไม่พบรายการ');
  await attachLinks(r.table, rows);
  res.json({ success: true, data: present(r, rows[0], req) });
}));

procureRouter.post('/:resource', requirePermission('create'), handle(async (req, res) => {
  const r = resourceOf(req);
  const values = { ...pick(r.fields, req.body, true), ...(LINKED_FROM[r.table] ? await linkValues(req.body, r.table === 'incoming_docs') : undefined) };
  if (r.fiscalYear) values.fiscal_year ??= currentFiscalYear();
  const cols = Object.keys(values);
  const [result] = await db().query<ResultSetHeader>(
    `INSERT INTO ${r.table} (${cols.join(', ')}, created_by) VALUES (${cols.map(() => '?').join(', ')}, ?)`, [...Object.values(values), who(req)]);
  if (KEY_OF_TABLE[r.table]) await syncOrigin(req, KEY_OF_TABLE[r.table], result.insertId, req.body);
  const [rows] = await db().query<RowDataPacket[]>(`SELECT * FROM ${r.table} WHERE id = ?`, [result.insertId]);
  announce(req, String(req.params.resource), 'create', [result.insertId]);
  await audit(req, { action: 'create', resource: String(req.params.resource), recordId: result.insertId, summary: `เพิ่ม${RESOURCE_TH[String(req.params.resource)]} ${describeRow(String(req.params.resource), rows[0])}`, after: rows[0] });
  await attachLinks(r.table, rows);
  res.status(201).json({ success: true, data: present(r, rows[0], req) });
}));

procureRouter.put('/:resource/:id', requirePermission('edit'), handle(async (req, res) => {
  const r = resourceOf(req);
  const id = idParam(req);
  const values = { ...pick(r.fields, req.body, false), ...(LINKED_FROM[r.table] ? await linkValues(req.body, r.table === 'incoming_docs') : undefined) };
  // A masked tax ID echoed back by a role that cannot see it must not overwrite the real one
  if (r.maskTaxId && !PERMISSIONS[req.auth!.user.role].viewPII) delete values.vendor_tax_id;
  const cols = Object.keys(values);
  if (cols.length === 0 && (req.body as { incoming_id?: unknown })?.incoming_id === undefined) throw new HttpError(400, 'ไม่มีข้อมูลที่ต้องแก้ไข');
  const [beforeRows] = await db().query<RowDataPacket[]>(`SELECT * FROM ${r.table} WHERE id = ? AND deleted_at IS NULL`, [id]);
  if (beforeRows.length === 0) throw new HttpError(404, 'ไม่พบรายการ');
  await assertFresh(String(req.params.resource), id, beforeRows[0] as { updated_at: unknown }, (req.body as { expected_updated_at?: unknown }).expected_updated_at);
  // The stamp is part of the WHERE so two saves racing each other cannot both win silently
  const [result] = cols.length === 0
    ? [{ affectedRows: 1 } as ResultSetHeader]
    : await db().query<ResultSetHeader>(`UPDATE ${r.table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND updated_at = ?`, [...Object.values(values), id, beforeRows[0].updated_at]);
  if (result.affectedRows === 0) throw new HttpError(409, 'มีผู้อื่นแก้ไขรายการนี้ไปแล้ว', { code: 'CONFLICT', current: { updated_at: null, by: null, at: null } });
  if (KEY_OF_TABLE[r.table]) await syncOrigin(req, KEY_OF_TABLE[r.table], id, req.body);
  const [rows] = await db().query<RowDataPacket[]>(`SELECT * FROM ${r.table} WHERE id = ?`, [id]);
  announce(req, String(req.params.resource), 'update', [id]);
  if (JSON.stringify(beforeRows[0]) !== JSON.stringify(rows[0])) {
    await audit(req, { action: 'update', resource: String(req.params.resource), recordId: id, summary: `แก้ไข${RESOURCE_TH[String(req.params.resource)]} ${describeRow(String(req.params.resource), rows[0])}`, before: beforeRows[0], after: rows[0] });
  }
  await attachLinks(r.table, rows);
  res.json({ success: true, data: present(r, rows[0], req) });
}));

// Delete several rows at once (checkbox selection in the list)
procureRouter.post('/:resource/bulk-delete', requirePermission('delete'), handle(async (req, res) => {
  const r = resourceOf(req);
  const raw = (req.body as { ids?: unknown } | undefined)?.ids;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 500) throw new HttpError(400, 'ต้องเลือกรายการ 1-500 รายการ');
  const ids = [...new Set(raw.map(Number))];
  if (ids.some((n) => !Number.isInteger(n) || n < 1)) throw new HttpError(400, 'รหัสไม่ถูกต้อง');
  const [oldRows] = await db().query<RowDataPacket[]>(`SELECT * FROM ${r.table} WHERE id IN (?) AND deleted_at IS NULL`, [ids]);
  const [result] = await db().query<ResultSetHeader>(`UPDATE ${r.table} SET deleted_at = NOW(), deleted_by = ? WHERE id IN (?) AND deleted_at IS NULL`, [who(req), ids]);
  announce(req, String(req.params.resource), 'delete', ids);
  const bulkKey = String(req.params.resource);
  await auditMany(req, oldRows.map((row) => ({ action: 'delete' as const, resource: bulkKey, recordId: row.id as number, summary: `ลบ${RESOURCE_TH[bulkKey]} ${describeRow(bulkKey, row)} (ลบหลายรายการ ${oldRows.length}; กู้คืนได้ภายใน ${TRASH_DAYS} วัน)`, before: row })));
  res.json({ success: true, data: { deleted: result.affectedRows } });
}));

procureRouter.delete('/:resource/:id', requirePermission('delete'), handle(async (req, res) => {
  const r = resourceOf(req);
  const id = idParam(req);
  const [oldRows] = await db().query<RowDataPacket[]>(`SELECT * FROM ${r.table} WHERE id = ? AND deleted_at IS NULL`, [id]);
  const [result] = await db().query<ResultSetHeader>(`UPDATE ${r.table} SET deleted_at = NOW(), deleted_by = ? WHERE id = ? AND deleted_at IS NULL`, [who(req), id]);
  if (result.affectedRows === 0) throw new HttpError(404, 'ไม่พบรายการ');
  announce(req, String(req.params.resource), 'delete', [id]);
  await audit(req, { action: 'delete', resource: String(req.params.resource), recordId: id, summary: `ลบ${RESOURCE_TH[String(req.params.resource)]} ${describeRow(String(req.params.resource), oldRows[0])} (กู้คืนได้ภายใน ${TRASH_DAYS} วัน)`, before: oldRows[0] });
  res.json({ success: true });
}));
