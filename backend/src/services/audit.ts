/**
 * Audit trail: one row per important action (who, what, when, from where, and the values before and after).
 * Written by the API, never by the browser, and there is no API to edit or delete entries.
 *
 * A failure to write the log is reported on the server console but never breaks the user's action.
 */
import type { Request } from 'express';
import { getPool } from './mysql';

export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'login_failed' | 'logout' | 'permission' | 'template' | 'sync' | 'security';

export interface AuditInput {
  action: AuditAction;
  /** orders | contracts | incoming | guarantees | progress | notes | users | auth */
  resource: string;
  recordId?: string | number | null;
  summary: string;
  before?: unknown;
  after?: unknown;
}

export interface Actor {
  username: string;
  name: string;
}

export const RESOURCE_TH: Record<string, string> = {
  orders: 'ใบสั่ง',
  contracts: 'สัญญา',
  incoming: 'หนังสือรับ',
  guarantees: 'หลักประกันสัญญา',
  progress: 'ความก้าวหน้า',
  notes: 'รายงานสรุป',
  users: 'ผู้ใช้งาน',
  auth: 'การเข้าสู่ระบบ',
  lookups: 'ตัวเลือกข้อมูล',
  ai: 'ผู้ช่วย AI',
  backup: 'สำรองข้อมูล',
};

/** Fields that must never be stored in clear text in the log */
const MASKED_FIELDS = ['vendor_tax_id'];
const MAX_JSON = 60_000;

function sanitize(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const copy: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const f of MASKED_FIELDS) {
    const v = copy[f];
    if (typeof v === 'string' && v.length >= 6) copy[f] = v.slice(0, 1) + '•'.repeat(v.length - 3) + v.slice(-2);
  }
  const json = JSON.stringify(copy);
  return json.length > MAX_JSON ? JSON.stringify({ _truncated: true }) : json;
}

/** Short human label for a row, used as the log summary and in notifications */
export function describeRow(resource: string, row: Record<string, unknown> | undefined): string {
  if (!row) return '';
  const pick = (...keys: string[]) => keys.map((k) => (row[k] === null || row[k] === undefined ? '' : String(row[k]))).filter(Boolean);
  let parts: string[];
  switch (resource) {
    case 'orders':
    case 'contracts':
      parts = [...pick('doc_no'), ...pick('job_title')];
      break;
    case 'incoming':
      parts = [...pick('reg_no'), ...pick('subject')];
      break;
    case 'guarantees':
      parts = [...pick('contract_ref'), ...pick('title')];
      break;
    case 'progress':
      parts = pick('project');
      break;
    default:
      parts = pick('name', 'login_name');
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 140);
}

const actorOf = (req: Request): Actor => ({ username: req.auth?.user.username ?? 'anonymous', name: req.auth?.user.displayName ?? '' });
const ipOf = (req: Request) => (req.ip ?? req.socket.remoteAddress ?? '').slice(0, 64);

const COLUMNS = '(actor, actor_name, action, resource, record_id, summary, before_json, after_json, ip)';

const rowOf = (actor: Actor, ip: string, i: AuditInput) => [
  actor.username.slice(0, 100), actor.name.slice(0, 250), i.action, i.resource, i.recordId === undefined || i.recordId === null ? null : String(i.recordId).slice(0, 100),
  i.summary.slice(0, 500), sanitize(i.before), sanitize(i.after), ip,
];

export async function writeAudit(actor: Actor, ip: string, input: AuditInput): Promise<void> {
  try {
    await getPool().query(`INSERT INTO audit_log ${COLUMNS} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, rowOf(actor, ip, input));
  } catch (e) {
    console.error('[audit] could not write log entry:', (e as Error).message);
  }
}

export const audit = (req: Request, input: AuditInput) => writeAudit(actorOf(req), ipOf(req), input);

/** Several entries in one statement (bulk delete) */
export async function auditMany(req: Request, inputs: AuditInput[]): Promise<void> {
  if (inputs.length === 0) return;
  try {
    const actor = actorOf(req);
    const ip = ipOf(req);
    await getPool().query(`INSERT INTO audit_log ${COLUMNS} VALUES ?`, [inputs.map((i) => rowOf(actor, ip, i))]);
  } catch (e) {
    console.error('[audit] could not write log entries:', (e as Error).message);
  }
}
