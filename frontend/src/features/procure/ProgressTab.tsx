import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, History, Loader2, Plus, Trash2 } from 'lucide-react';
import { RowHistoryDialog } from '../audit/RowHistoryDialog';
import { ConflictError, procureApi, type Lookups, type PeriodMode, type ProgressProject } from './api';
import { fiscalYearOf, todayIso } from './format';
import { ConflictDialog } from './ConflictDialog';
import { TrashDialog } from './TrashDialog';
import type { FieldDef } from './fields';
import { RecordDialog, toFormValues, toPayload, type FormValues } from './RecordDialog';
import { ThaiDatePicker } from '../../components/ui/thai-date-picker';
import { thaiDate } from './format';
import { TablePager } from '../../components/ui/data-table';
import { changedIds, useFlashIds, useLiveReload } from './live';
import type { Notify, Permissions } from './types';

const FIELDS: FieldDef[] = [
  { key: 'seq_no', label: 'ลำดับ', type: 'number', inputMode: 'numeric' },
  { key: 'method', label: 'วิธีซื้อจ้าง', options: 'method' },
  { key: 'project', label: 'โครงการ', type: 'textarea', required: true, wide: true },
  { key: 'operator', label: 'ผู้ดำเนินการ', options: 'staff' },
  { key: 'link_ref', label: 'ใบสั่งซื้อ/จ้าง หรือสัญญาที่ได้ (เมื่อจัดทำแล้ว)', type: 'link', wide: true },
];

const STEP_COUNT = 17;

interface Props {
  fy: number;
  mode?: PeriodMode;
  lookups: Lookups | null;
  perms: Permissions;
  notify: Notify;
}

/** Editor body: the 17 step dates. State lives here so the dialog's save can read it. */
const ProgressDialog: React.FC<{
  project: ProgressProject | null;
  fy: number;
  lookups: Lookups | null;
  perms: Permissions;
  onSaved: (message: string) => Promise<void>;
  onClose: () => void;
  /** Close and reload because the stored version is newer than the one opened */
  onStale: () => void;
}> = ({ project, fy, lookups, perms, onSaved, onClose, onStale }) => {
  const [conflict, setConflict] = useState<{ error: ConflictError; body: Record<string, unknown> } | null>(null);
  const [steps, setSteps] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (let n = 1; n <= STEP_COUNT; n++) out[String(n)] = project?.steps[String(n)] ?? '';
    return out;
  });
  const canEdit = project ? perms.canEdit : perms.canCreate;
  const stepName = (n: number) => lookups?.steps.find((s) => s.step_no === n)?.name ?? `ขั้นตอนที่ ${n}`;

  return (
    <>
    <RecordDialog
      title="ความก้าวหน้าการจัดหา"
      fields={FIELDS}
      lookups={lookups}
      initial={toFormValues(FIELDS, project as unknown as Record<string, unknown> | null)}
      isNew={!project}
      canEdit={canEdit}
      canDelete={perms.canDelete}
      onClose={onClose}
      onSave={async (values: FormValues) => {
        const body: Record<string, unknown> = {
          ...toPayload(FIELDS, values),
          fiscal_year: fy,
          steps: Object.fromEntries(Object.entries(steps).map(([k, v]) => [k, v || null])),
        };
        if (project) {
          body.expected_updated_at = project.updated_at;
          try {
            await procureApi.updateProgress(project.id, body);
          } catch (e) {
            if (e instanceof ConflictError) return setConflict({ error: e, body });
            throw e;
          }
        } else await procureApi.createProgress(body);
        await onSaved(project ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มโครงการแล้ว');
      }}
      onDelete={
        project
          ? async () => {
              await procureApi.removeProgress(project.id);
              await onSaved('ลบโครงการแล้ว');
            }
          : undefined
      }
    >
      <fieldset className="min-w-0">
        <legend className="mb-3 font-prompt text-sm font-semibold text-ink">วันที่ดำเนินการแต่ละขั้นตอน</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: STEP_COUNT }, (_, i) => i + 1).map((n) => (
            <div key={n}>
              <label htmlFor={`step-${n}`} className="mb-1.5 block text-xs font-semibold text-ink-3">
                {n}. {stepName(n)}
              </label>
              <ThaiDatePicker id={`step-${n}`} value={steps[String(n)]} disabled={!canEdit} onChange={(iso) => setSteps((prev) => ({ ...prev, [String(n)]: iso }))} />
            </div>
          ))}
        </div>
      </fieldset>
    </RecordDialog>
    {conflict && project && (
      <ConflictDialog
        what="โครงการ"
        conflict={conflict.error}
        onReload={onStale}
        onCancel={() => setConflict(null)}
        onOverwrite={async () => {
          try {
            await procureApi.updateProgress(project.id, { ...conflict.body, expected_updated_at: conflict.error.current.updated_at ?? undefined });
            setConflict(null);
            await onSaved('บันทึกทับแล้ว');
          } catch (e) {
            if (e instanceof ConflictError) setConflict({ error: e, body: conflict.body });
            else throw e;
          }
        }}
      />
    )}
    </>
  );
};

export const ProgressTab: React.FC<Props> = ({ fy, mode = 'fiscal', lookups, perms, notify }) => {
  const [rows, setRows] = useState<ProgressProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ project: ProgressProject | null } | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [historyOf, setHistoryOf] = useState<ProgressProject | null>(null);

  const [flashIds, flash, newIds] = useFlashIds();
  const lastLoad = useRef<Map<number, string> | null>(null);

  /** A quiet reload (live update, save) keeps the table and lights up added or changed rows */
  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      lastLoad.current = null;
    }
    setError(null);
    try {
      const next = await procureApi.progress(fy, mode);
      const { ids, added, map } = changedIds(lastLoad.current ?? new Map(), next);
      if (silent && lastLoad.current && ids.size > 0) flash(ids, added);
      lastLoad.current = map;
      setRows(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      if (!silent) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy, mode]);

  useLiveReload(['progress'], () => load(true));

  useEffect(() => {
    void load();
  }, [load]);

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  // Stay on a valid page when rows are deleted or the fiscal year changes
  const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
  const page = Math.min(pageIndex, lastPage);
  const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize);

  const stepName = (n: number) => lookups?.steps.find((s) => s.step_no === n)?.name ?? `ขั้นตอนที่ ${n}`;
  const nums = Array.from({ length: STEP_COUNT }, (_, i) => i + 1);

  return (
    <section aria-label="ความก้าวหน้า" className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-sm text-ink-3">
          ติดตามความก้าวหน้าการจัดหาแต่ละโครงการตามขั้นตอนที่ 1–{STEP_COUNT} (กดที่แถวเพื่อบันทึกวันที่)
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {perms.canDelete && (
            <button type="button" onClick={() => setShowTrash(true)} className="pf-btn inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold cursor-pointer">
              <Trash2 className="h-4 w-4" aria-hidden /> ถังขยะ
            </button>
          )}
          {perms.canCreate && (
            <button
              type="button"
              onClick={() => setEditing({ project: null })}
              className="btn-brand inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold cursor-pointer"
            >
              <Plus className="h-4 w-4" /> เพิ่มโครงการ
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="min-h-[40px] rounded-lg px-3 font-semibold underline cursor-pointer">
            ลองใหม่
          </button>
        </div>
      )}

      <div className="gov-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead className="bg-slate-50 dark:bg-[var(--pf-head-bg)]">
              <tr>
                <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-ink-3">ลำดับ</th>
                <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-ink-3">โครงการ</th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-ink-3">วิธีซื้อจ้าง</th>
                {nums.map((n) => (
                  <th key={n} scope="col" title={stepName(n)} className="w-9 px-0.5 py-3 text-center text-xs font-semibold tabular-nums text-ink-3">
                    {n}
                  </th>
                ))}
                <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-ink-3">คืบหน้า</th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-ink-3">ผู้ดำเนินการ</th>
                <th scope="col" className="w-12 px-1 py-3"><span className="sr-only">ประวัติ</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/10">
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={nums.length + 6} className="px-3 py-10 text-center text-ink-4">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              )}
              {!loading && !error && rows.length === 0 && (
                <tr>
                  <td colSpan={nums.length + 6} className="px-3 py-10 text-center text-ink-4">
                    ยังไม่มีโครงการที่ติดตามความก้าวหน้า
                  </td>
                </tr>
              )}
              {pageRows.map((p, i) => {
                const done = nums.filter((n) => p.steps[String(n)]).length;
                const last = [...nums].reverse().find((n) => p.steps[String(n)]);
                return (
                  <tr
                    key={p.id}
                    tabIndex={0}
                    onClick={() => setEditing({ project: p })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setEditing({ project: p });
                      }
                    }}
                    className={`cursor-pointer align-middle hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none dark:hover:bg-[var(--pf-hover)] dark:focus-visible:bg-[var(--pf-hover)] ${newIds.has(p.id) ? 'row-new' : flashIds.has(p.id) ? 'row-flash' : ''}`}
                  >
                    <td className="px-3 py-3 tabular-nums text-ink-3">{p.seq_no ?? page * pageSize + i + 1}</td>
                    <td className="min-w-[14rem] max-w-sm px-3 py-3 font-medium text-ink">
                      {p.project}
                      {p.link_label && <span className="mt-1 block w-fit rounded-md bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-500/10 dark:text-violet-300">→ {p.link_label}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-ink-2">{p.method}</td>
                    {nums.map((n) => {
                      const date = p.steps[String(n)];
                      return (
                        <td key={n} className="px-0.5 py-3 text-center" title={date ? `${stepName(n)}: ${thaiDate(date)}` : stepName(n)}>
                          {date ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
                              <Check className="h-3.5 w-3.5" aria-hidden />
                              <span className="sr-only">
                                {stepName(n)} {thaiDate(date)}
                              </span>
                            </span>
                          ) : (
                            <span className="inline-block h-6 w-6 rounded-full ring-1 ring-inset ring-slate-300 dark:ring-slate-600" aria-hidden />
                          )}
                        </td>
                      );
                    })}
                    <td className="min-w-[9rem] px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-valuemin={0} aria-valuemax={STEP_COUNT} aria-valuenow={done}>
                          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${(done / STEP_COUNT) * 100}%` }} />
                        </div>
                        <span className="text-xs font-semibold tabular-nums text-ink-2">
                          {done}/{STEP_COUNT}
                        </span>
                      </div>
                      {last && <p className="mt-1 text-xs text-ink-4">ล่าสุด: {stepName(last)}</p>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-ink-2">{p.operator}</td>
                    <td className="px-1 py-3 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHistoryOf(p);
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                        title="ประวัติการแก้ไข"
                        aria-label="ประวัติการแก้ไข"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10 cursor-pointer"
                      >
                        <History className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <TablePager total={rows.length} pageIndex={page} pageSize={pageSize} onPageIndex={setPageIndex} onPageSize={(n) => { setPageSize(n); setPageIndex(0); }} />
        )}
      </div>

      <details className="gov-card px-4 py-3 text-sm text-ink-2">
        <summary className="cursor-pointer font-semibold">คำอธิบายขั้นตอนที่ 1–{STEP_COUNT}</summary>
        <ol className="mt-3 grid list-inside list-decimal gap-x-6 gap-y-1 sm:grid-cols-2">
          {nums.map((n) => (
            <li key={n}>{stepName(n)}</li>
          ))}
        </ol>
      </details>

      {editing && (
        <ProgressDialog
          project={editing.project}
          fy={mode === 'calendar' ? fiscalYearOf(todayIso()) : fy}
          lookups={lookups}
          perms={perms}
          onClose={() => setEditing(null)}
          onStale={() => {
            setEditing(null);
            void load(true);
          }}
          onSaved={async (message) => {
            notify(message, 'success');
            setEditing(null);
            await load(true);
          }}
        />
      )}

      {historyOf && <RowHistoryDialog resource="progress" recordId={historyOf.id} title={historyOf.project.slice(0, 80)} onClose={() => setHistoryOf(null)} />}

      {showTrash && (
        <TrashDialog resource="progress" singular="โครงการ" titleOf={(r) => String(r.project ?? '')} notify={notify} onRestored={() => void load(true)} onClose={() => setShowTrash(false)} />
      )}
    </section>
  );
};
