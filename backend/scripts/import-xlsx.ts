/**
 * Import the existing Excel registry into MySQL.
 *   npm run db:import -w backend -- "<path to .xlsx>" [--replace]
 *
 * Without --replace the import refuses to run if the tables already contain rows.
 *
 * Date handling: the workbook was typed with Thai (พ.ศ.) years in a Gregorian-calendar Excel, so a
 * cell holding 2569 is really พ.ศ. 2569 (= 2026), and some cells show 1969 (a year-2569 date that
 * Excel wrapped by 600 years) which is also 2026. Both are normalised to real Gregorian dates.
 */
import 'dotenv/config';
import path from 'path';
import ExcelJS from 'exceljs';
import { mysql, dbConfig, connect } from '../src/services/mysql';

const FISCAL_YEAR = 2570;
const args = process.argv.slice(2);
const replace = args.includes('--replace');
const file = path.resolve(args.find((a) => !a.startsWith('--')) ?? '../[ปีงบ 2570] O16_ทะเบียนคุมใบสั่ง_สัญญา.xlsx');

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------

type Cell = ExcelJS.Cell;

function raw(cell: Cell): unknown {
  const v = cell.value as unknown;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: unknown };
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if ('result' in o) return o.result;
    if ('text' in o) return o.text;
    return null;
  }
  return v;
}

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
const arabicDigits = (s: string) => s.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));

function text(cell: Cell): string | null {
  const v = raw(cell);
  if (v === null || v === undefined) return null;
  const s = (v instanceof Date ? isoDate(v) : String(v)).replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return s === '' || s === '-' ? null : s;
}

function num(cell: Cell): number | null {
  const v = raw(cell);
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, '').trim());
    return v.trim() !== '' && Number.isFinite(n) ? n : null;
  }
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');

function ymd(y: number, m: number, d: number): string {
  if (y > 2400) y -= 543; // พ.ศ. -> ค.ศ.
  else if (y >= 1900 && y < 2000) y += 57; // 1969 artefact = พ.ศ. 2569 wrapped by 600 years
  return `${y}-${pad(m)}-${pad(d)}`;
}

function isoDate(d: Date): string {
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function date(cell: Cell): string | null {
  const v = raw(cell);
  return v instanceof Date ? isoDate(v) : null;
}

/** "25/3/2569/คืนแล้ว" -> due date + note; a real date cell -> date only */
function dueAndNote(cell: Cell): { due: string | null; note: string | null } {
  const v = raw(cell);
  if (v instanceof Date) return { due: isoDate(v), note: null };
  const s = text(cell);
  const m = s && /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*\/?\s*(.*)$/.exec(s);
  if (!m) return { due: null, note: s };
  return { due: ymd(Number(m[3]), Number(m[2]), Number(m[1])), note: m[4] || null };
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const sheet = (name: string) => {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`Sheet "${name}" not found in ${file}`);
  return ws;
};

function readOrderLike(ws: ExcelJS.Worksheet) {
  const rows: unknown[][] = [];
  for (let r = 3; r <= ws.rowCount; r++) {
    const c = (col: string) => ws.getCell(`${col}${r}`);
    const job = text(c('J'));
    if (!job) continue;
    const delivery = raw(c('V')) instanceof Date ? date(c('V')) : text(c('V'));
    rows.push([
      FISCAL_YEAR, text(c('A')), date(c('B')), text(c('C')), text(c('E')), text(c('F')), text(c('G')), text(c('H')), text(c('I')),
      job, num(c('K')), text(c('L')), num(c('M')), text(c('N')), text(c('O')), text(c('P')), text(c('Q')), text(c('R')),
      text(c('S')), date(c('T')), date(c('U')), delivery, num(c('W')), num(c('X')),
      text(c('Y')), text(c('Z')), arabicDigits(text(c('AA')) ?? '') || null, text(c('AB')), date(c('AC')),
      text(c('AD')), date(c('AE')), date(c('AF')), date(c('AG')), 'import:xlsx',
    ]);
  }
  return rows;
}

const ORDER_COLS = [
  'fiscal_year', 'responsible', 'received_date', 'owner_group', 'agency_type', 'ministry', 'agency_name', 'district', 'province',
  'job_title', 'quantity', 'unit', 'budget_amount', 'budget_source', 'output_code', 'main_activity', 'status', 'method',
  'doc_no', 'doc_date', 'vendor_received_date', 'delivery_due', 'median_price', 'agreed_price',
  'vendor_tax_id', 'vendor_name', 'project_no', 'approval_no', 'approval_date',
  'inspect_report_no', 'inspect_report_date', 'inspected_date', 'disbursed_date', 'created_by',
];

const incoming: unknown[][] = [];
{
  const ws = sheet('ทะเบียนหนังสือรับ');
  for (let r = 3; r <= ws.rowCount; r++) {
    const c = (col: string) => ws.getCell(`${col}${r}`);
    const regNo = num(c('B'));
    if (regNo === null && !text(c('F'))) continue;
    // A doc number such as "1/11" is turned into a date by Excel: restore it as d/m text
    const docRaw = raw(c('C'));
    const docNo = docRaw instanceof Date ? `${docRaw.getUTCDate()}/${docRaw.getUTCMonth() + 1}` : text(c('C'));
    incoming.push([FISCAL_YEAR, regNo, docNo, date(c('D')), text(c('E')), text(c('F')), num(c('G')), text(c('H')), 'import:xlsx']);
  }
}

const guarantees: unknown[][] = [];
{
  const ws = sheet('ทะเบียนคุมหลักประกันสัญญา');
  for (let r = 3; r <= ws.rowCount; r++) {
    const c = (col: string) => ws.getCell(`${col}${r}`);
    const seq = num(c('B'));
    if (seq === null) continue;
    const { due, note } = dueAndNote(c('I'));
    guarantees.push([
      seq, raw(c('A')) === true ? 1 : 0, date(c('C')), text(c('D')), text(c('E')), text(c('F')),
      arabicDigits(text(c('G')) ?? '') || null, text(c('H')), due, note, 'import:xlsx',
    ]);
  }
}

const orders = readOrderLike(sheet('ทะเบียนใบสั่ง'));
const contracts = readOrderLike(sheet('ทะเบียนสัญญา'));

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

const conn = await connect(true);
const tables = ['incoming_docs', 'purchase_orders', 'contracts', 'contract_guarantees'];
const existing: Record<string, number> = {};
for (const t of tables) {
  const [rows] = (await conn.query(`SELECT COUNT(*) AS n FROM ${t}`)) as [{ n: number }[], unknown];
  existing[t] = rows[0].n;
}
if (Object.values(existing).some((n) => n > 0) && !replace) {
  console.error('[import] tables already contain data:', existing, '\nRe-run with --replace to wipe and reload them.');
  await conn.end();
  process.exit(1);
}

await conn.beginTransaction();
try {
  if (replace) for (const t of tables) await conn.query(`DELETE FROM ${t}`);
  const insert = async (table: string, cols: string[], rows: unknown[][]) => {
    if (rows.length === 0) return;
    await conn.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES ?`, [rows]);
  };
  await insert('incoming_docs', ['fiscal_year', 'reg_no', 'doc_no', 'doc_date', 'from_name', 'subject', 'amount', 'category', 'created_by'], incoming);
  await insert('purchase_orders', ORDER_COLS, orders);
  await insert('contracts', ORDER_COLS, contracts);
  await insert(
    'contract_guarantees',
    ['seq_no', 'returned', 'received_date', 'detail', 'title', 'contract_ref', 'project_no', 'vendor_name', 'return_due_date', 'return_note', 'created_by'],
    guarantees
  );
  await conn.commit();
} catch (e) {
  await conn.rollback();
  throw e;
} finally {
  await conn.end();
}

console.log(`[import] ${file}`);
console.log(`[import] หนังสือรับ ${incoming.length} | ใบสั่ง ${orders.length} | สัญญา ${contracts.length} | หลักประกัน ${guarantees.length}`);
