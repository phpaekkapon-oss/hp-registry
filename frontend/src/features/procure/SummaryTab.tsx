import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Loader2, Save } from 'lucide-react';
import { procureApi, type Summary } from './api';
import type { PeriodMode } from './api';
import { money } from './format';
import type { Notify, Permissions } from './types';
import { Flash, useLiveReload } from './live';
import { Skr1Modal } from './Skr1Modal';

interface Props {
  fy: number;
  mode?: PeriodMode;
  perms: Permissions;
  notify: Notify;
}

const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: 'warn' | 'bad' }> = ({ label, value, tone }) => (
  <div className="gov-card p-4">
    <p className="text-xs font-semibold text-ink-3">{label}</p>
    <p
      className={`mt-1 font-prompt text-2xl font-bold tabular-nums ${
        tone === 'bad' ? 'text-rose-700 dark:text-rose-300' : tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-ink'
      }`}
    >
      <Flash value={typeof value === 'number' ? value : typeof value === 'object' ? null : value} format={typeof value === 'number' ? (n) => String(Math.round(n)) : undefined}>{value}</Flash>
    </p>
  </div>
);

const NoteEditor: React.FC<{
  label: string;
  value: string;
  canEdit: boolean;
  onSave: (text: string) => Promise<void>;
}> = ({ label, value, canEdit, onSave }) => {
  const [text, setText] = useState(value);
  const [busy, setBusy] = useState(false);
  useEffect(() => setText(value), [value]);
  const id = `note-${label}`;
  return (
    <div className="gov-card p-4">
      <label htmlFor={id} className="mb-2 block font-prompt text-sm font-semibold text-ink">
        {label}
      </label>
      <textarea
        id={id}
        rows={6}
        value={text}
        disabled={!canEdit}
        onChange={(e) => setText(e.target.value)}
        className="pf-field w-full rounded-lg px-3 py-2 text-sm"
      />
      {canEdit && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={busy || text === value}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(text);
              } finally {
                setBusy(false);
              }
            }}
            className="btn-brand inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 cursor-pointer"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} บันทึก
          </button>
        </div>
      )}
    </div>
  );
};

export const SummaryTab: React.FC<Props> = ({ fy, mode = 'fiscal', perms, notify }) => {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSkr1, setShowSkr1] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await procureApi.summary(fy, mode));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
    }
  }, [fy, mode]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  // Any register changing changes these numbers
  useLiveReload(['orders', 'contracts', 'incoming', 'guarantees', 'progress', 'notes'], load);

  if (error) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20">
        <span>{error}</span>
        <button type="button" onClick={() => void load()} className="min-h-[40px] rounded-lg px-3 font-semibold underline cursor-pointer">
          ลองใหม่
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex justify-center py-16 text-ink-4">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const rows = data.orders.map((o, i) => ({
    label: o.label,
    orders: o,
    contracts: data.contracts[i],
    count: o.count + data.contracts[i].count,
    amount: o.amount + data.contracts[i].amount,
  }));
  const totals = rows.reduce((t, r) => ({ count: t.count + r.count, amount: t.amount + r.amount, o: t.o + r.orders.count, c: t.c + r.contracts.count }), {
    count: 0,
    amount: 0,
    o: 0,
    c: 0,
  });

  const saveNote = (kind: 'problem' | 'suggestion') => async (text: string) => {
    try {
      await procureApi.saveNote(fy, kind, text, mode);
      setData((d) => (d ? { ...d, notes: { ...d.notes, [kind]: text } } : d));
      notify('บันทึกแล้ว', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ', 'error');
    }
  };

  const g = data.guarantees;
  const th = 'px-3 py-3 text-xs font-semibold text-ink-3';

  return (
    <section aria-label="รายงานสรุป" className="space-y-6">
      {/* Banner: แบบ สขร. 1 ประจำเดือน */}
      <div className="gov-card bg-brand-soft border-chroma-optical flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3.5">
          <div className="btn-brand flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-md">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <div>
            <h4 className="font-prompt text-base font-bold text-ink flex items-center gap-2">
              แบบสรุปผลการจัดซื้อจัดจ้างในรอบเดือน (แบบ สขร. 1)
              <span className="rounded-full bg-white/60 text-brand dark:bg-white/10 text-[11px] font-semibold px-2 py-0.5">
                มาตรฐานราชการ
              </span>
            </h4>
            <p className="mt-0.5 text-xs text-ink-4">
              จัดทำและส่งออกรายงานตามประกาศคณะกรรมการข้อมูลข่าวสารของราชการ 9 คอลัมน์มาตรฐาน (ส่งออก Excel และพิมพ์ได้ทันที)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowSkr1(true)}
          className="btn-brand inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold cursor-pointer shadow-sm hover:scale-[1.02] transition-transform"
        >
          <FileSpreadsheet className="h-4 w-4" /> เปิดแบบ สขร. 1 ประจำเดือน
        </button>
      </div>

      <div>
        <h3 className="font-prompt text-base font-bold text-ink">สรุปรายการจัดซื้อจัดจ้างจำแนกตามวิธีการจัดซื้อจัดจ้าง</h3>
        <p className="mt-1 text-sm text-ink-3">
          {mode === 'calendar' ? `ปี พ.ศ. ${data.fiscalYear} (ตามวันที่ของเอกสาร)` : `ปีงบประมาณ พ.ศ. ${data.fiscalYear}`} · รวมใบสั่งและสัญญา · งบประมาณคิดจากราคาที่ตกลงซื้อหรือจ้าง (ถ้ายังไม่มีใช้วงเงินที่ได้รับจัดสรร)
        </p>
      </div>

      <div className="gov-card overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead className="bg-slate-50 dark:bg-[var(--pf-head-bg)]">
            <tr>
              <th scope="col" className={`${th} text-left`}>วิธีการจัดซื้อจัดจ้าง</th>
              <th scope="col" className={`${th} text-right`}>จำนวน</th>
              <th scope="col" className={`${th} text-right`}>งบประมาณ (บาท)</th>
              <th scope="col" className={`${th} text-right`}>ใบสั่ง</th>
              <th scope="col" className={`${th} text-right`}>สัญญา</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-white/10">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="px-3 py-3 text-ink">
                  {r.label}
                  <div className="mt-1.5 h-1.5 w-full max-w-[14rem] overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden>
                    <div className="h-full rounded-full bg-[var(--brand-strong,#1d4ed8)] transition-[width] duration-700 ease-out" style={{ width: `${totals.amount > 0 ? Math.round((r.amount / totals.amount) * 100) : 0}%` }} />
                  </div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums"><Flash value={r.count}>{r.count || '-'}</Flash></td>
                <td className="px-3 py-3 text-right tabular-nums"><Flash value={r.amount} format={(n) => (r.count ? money(n) : '-')}>{r.count ? money(r.amount) : '-'}</Flash></td>
                <td className="px-3 py-3 text-right tabular-nums text-ink-3"><Flash value={r.orders.count}>{r.orders.count || '-'}</Flash></td>
                <td className="px-3 py-3 text-right tabular-nums text-ink-3"><Flash value={r.contracts.count}>{r.contracts.count || '-'}</Flash></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-300 bg-slate-50 font-semibold dark:border-white/10 dark:bg-[var(--pf-head-bg)]">
            <tr>
              <td className="px-3 py-3">รวม</td>
              <td className="px-3 py-3 text-right tabular-nums"><Flash value={totals.count} format={(n) => String(Math.round(n))} /></td>
              <td className="px-3 py-3 text-right tabular-nums"><Flash value={totals.amount} format={money}>{money(totals.amount)}</Flash></td>
              <td className="px-3 py-3 text-right tabular-nums"><Flash value={totals.o} format={(n) => String(Math.round(n))} /></td>
              <td className="px-3 py-3 text-right tabular-nums"><Flash value={totals.c} format={(n) => String(Math.round(n))} /></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { title: 'สถานะใบสั่ง', rows: data.orderStatus },
          { title: 'สถานะสัญญา', rows: data.contractStatus },
        ].map((block) => (
          <div key={block.title} className="gov-card p-4">
            <h4 className="font-prompt text-sm font-semibold text-ink">{block.title}</h4>
            {block.rows.length === 0 ? (
              <p className="mt-2 text-sm text-ink-4">ยังไม่มีรายการ</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-200 dark:divide-white/10">
                {block.rows.map((s) => (
                  <li key={s.status} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 text-ink-2">
                      {s.status}
                      <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden>
                        <span className="block h-full rounded-full bg-[var(--brand-strong,#1d4ed8)] transition-[width] duration-700 ease-out" style={{ width: `${Math.round((s.count / Math.max(1, block.rows.reduce((t, x) => t + x.count, 0))) * 100)}%` }} />
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums text-ink"><Flash value={s.count} format={(n) => String(Math.round(n))} /></span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div>
        <h3 className="mb-3 flex items-center gap-2 font-prompt text-base font-bold text-ink">
          หลักประกันสัญญา
          {g.overdue > 0 && <AlertTriangle className="h-4 w-4 text-rose-600" aria-label="มีรายการเลยกำหนดคืน" />}
        </h3>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="ทั้งหมด" value={g.total} />
          <Stat label="ยังไม่คืน" value={g.pending} />
          <Stat label="ครบกำหนดคืนใน 30 วัน" value={g.dueSoon} tone={g.dueSoon > 0 ? 'warn' : undefined} />
          <Stat label="เลยกำหนดคืนแล้ว" value={g.overdue} tone={g.overdue > 0 ? 'bad' : undefined} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <NoteEditor label="ปัญหา/อุปสรรค" value={data.notes.problem} canEdit={perms.canEdit} onSave={saveNote('problem')} />
        <NoteEditor label="ข้อเสนอแนะ" value={data.notes.suggestion} canEdit={perms.canEdit} onSave={saveNote('suggestion')} />
      </div>

      <Skr1Modal
        open={showSkr1}
        onClose={() => setShowSkr1(false)}
        fy={fy}
        mode={mode}
        notify={notify}
      />
    </section>
  );
};
