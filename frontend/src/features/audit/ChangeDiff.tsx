import React, { useMemo } from 'react';
import { RESOURCE_DEFS } from '../procure/fields';
import { money, thaiDate } from '../procure/format';
import type { AuditEntry } from './api';

export const ACTION_LABEL: Record<string, { label: string; tone: 'ok' | 'info' | 'bad' | 'warn' | 'off' | 'violet' }> = {
  create: { label: 'เพิ่ม', tone: 'ok' },
  update: { label: 'แก้ไข', tone: 'info' },
  delete: { label: 'ลบ', tone: 'bad' },
  login: { label: 'เข้าสู่ระบบ', tone: 'off' },
  login_failed: { label: 'ล็อกอินไม่สำเร็จ', tone: 'warn' },
  logout: { label: 'ออกจากระบบ', tone: 'off' },
  permission: { label: 'ปรับสิทธิ์', tone: 'violet' },
  template: { label: 'เทมเพลตสิทธิ์', tone: 'violet' },
  sync: { label: 'ซิงก์ HOSxP', tone: 'info' },
  security: { label: 'ความปลอดภัย', tone: 'violet' },
};

export const RESOURCE_LABEL: Record<string, string> = {
  orders: 'ใบสั่ง',
  contracts: 'สัญญา',
  incoming: 'หนังสือรับ',
  guarantees: 'หลักประกันสัญญา',
  progress: 'ความก้าวหน้า',
  notes: 'รายงานสรุป',
  users: 'ผู้ใช้งาน',
  auth: 'การเข้าสู่ระบบ',
  lookups: 'ตัวเลือกข้อมูล',
};

const TONES = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  info: 'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20',
  bad: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20',
  off: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-[var(--pf-head-bg)] dark:text-slate-300 dark:ring-[var(--pf-field-border)]',
};

export const ActionChip: React.FC<{ action: string }> = ({ action }) => {
  const a = ACTION_LABEL[action] ?? { label: action, tone: 'off' as const };
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${TONES[a.tone]}`}>{a.label}</span>;
};

/** Thai labels for the fields of every register, plus the few fields of progress and users */
const FIELD_LABEL: Record<string, string> = (() => {
  const out: Record<string, string> = {
    project: 'โครงการ', method: 'วิธีซื้อจ้าง', operator: 'ผู้ดำเนินการ', seq_no: 'ลำดับ',
    role: 'ระดับสิทธิ์', is_enabled: 'อนุญาตให้เข้าระบบ', menus: 'เมนูที่เห็น', note: 'หมายเหตุ', position_custom: 'ตำแหน่ง (กำหนดเอง)',
    display_name: 'ชื่อ', login_name: 'ชื่อผู้ใช้', content: 'เนื้อหา', fiscal_year: 'ปีงบประมาณ',
    autoApply: 'ให้สิทธิ์ผู้ใช้ใหม่อัตโนมัติ',
  };
  for (const def of Object.values(RESOURCE_DEFS)) for (const f of def.fields) out[f.key] ??= f.label;
  return out;
})();

const DATE_KEYS = new Set(
  Object.values(RESOURCE_DEFS).flatMap((d) => d.fields.filter((f) => f.type === 'date').map((f) => f.key))
);
const MONEY_KEYS = new Set(
  Object.values(RESOURCE_DEFS).flatMap((d) => d.fields.filter((f) => f.type === 'number' && f.align === 'right').map((f) => f.key))
);
/** Bookkeeping columns that add noise without meaning */
const HIDDEN = new Set(['id', 'created_by', 'created_at', 'updated_at', 'updated_by']);

function fmt(key: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '–';
  if (typeof v === 'boolean') return v ? 'ใช่' : 'ไม่';
  if (key === 'returned') return v ? 'คืนแล้ว' : 'ยังไม่คืน';
  if (key === 'is_enabled') return v ? 'อนุญาต' : 'ไม่อนุญาต';
  if (key === 'role') return ({ Admin: 'ผู้ดูแลระบบ', Doctor: 'ผู้บันทึกข้อมูล', Staff: 'ผู้ดูข้อมูล' } as Record<string, string>)[String(v)] ?? String(v);
  if (Array.isArray(v)) return v.length === 0 ? '–' : v.join(', ');
  if (DATE_KEYS.has(key)) return thaiDate(v);
  if (MONEY_KEYS.has(key)) return money(v);
  return String(v);
}

/** Row fields as flat [label, value] pairs; progress "steps" are expanded into one entry per step */
function flatten(obj: Record<string, unknown> | null): Map<string, { label: string; value: string }> {
  const out = new Map<string, { label: string; value: string }>();
  if (!obj) return out;
  for (const [k, v] of Object.entries(obj)) {
    if (HIDDEN.has(k) || k === '_truncated') continue;
    if (k === 'steps' && v && typeof v === 'object') {
      for (const [n, d] of Object.entries(v as Record<string, unknown>)) out.set(`step${n}`, { label: `ขั้นตอนที่ ${n}`, value: fmt('step', d ? thaiDate(d) : null) });
      continue;
    }
    out.set(k, { label: FIELD_LABEL[k] ?? k, value: fmt(k, v) });
  }
  return out;
}

/** What changed: before → after for an edit, the values for an add, the last values for a delete */
export const ChangeDiff: React.FC<{ before: AuditEntry['before']; after: AuditEntry['after'] }> = ({ before, after }) => {
  const rows = useMemo(() => {
    const b = flatten(before);
    const a = flatten(after);
    const keys = [...new Set([...b.keys(), ...a.keys()])];
    if (before && after) {
      return keys
        .filter((k) => (b.get(k)?.value ?? '–') !== (a.get(k)?.value ?? '–'))
        .map((k) => ({ label: (a.get(k) ?? b.get(k))!.label, from: b.get(k)?.value ?? '–', to: a.get(k)?.value ?? '–' }));
    }
    const only = after ? a : b;
    return keys.filter((k) => only.has(k) && only.get(k)!.value !== '–').map((k) => ({ label: only.get(k)!.label, from: null as string | null, to: only.get(k)!.value }));
  }, [before, after]);

  if (rows.length === 0) return <p className="text-sm text-ink-4">ไม่มีรายละเอียดค่าที่เปลี่ยน</p>;
  const isEdit = Boolean(before && after);
  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200 dark:ring-white/10">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead className="bg-slate-50 text-xs text-slate-700 dark:bg-[var(--pf-head-bg)] dark:text-slate-300">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">ข้อมูล</th>
            {isEdit && <th className="px-3 py-2 text-left font-semibold">ก่อนแก้</th>}
            <th className="px-3 py-2 text-left font-semibold">{isEdit ? 'หลังแก้' : after ? 'ค่าที่บันทึก' : 'ค่าก่อนลบ'}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-white/10">
          {rows.map((r) => (
            <tr key={r.label + r.to} className="align-top">
              <td className="whitespace-nowrap px-3 py-2 font-semibold text-ink-2">{r.label}</td>
              {isEdit && <td className="px-3 py-2 text-rose-700 line-through decoration-rose-300 dark:text-rose-300">{r.from}</td>}
              <td className={`px-3 py-2 ${isEdit ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'text-ink'}`}>{r.to}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
