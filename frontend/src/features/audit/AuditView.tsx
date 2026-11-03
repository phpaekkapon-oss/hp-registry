import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, Search, X } from 'lucide-react';
import { DataTable, type DataTableColumnMeta } from '../../components/ui/data-table';
import { Select } from '../../components/ui/select';
import { diffRows, useFlashIds, useLiveReload } from '../procure/live';
import { auditApi, type AuditEntry } from './api';
import { ACTION_LABEL, ActionChip, ChangeDiff, RESOURCE_LABEL } from './ChangeDiff';

const dateTime = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'medium' });

const PAGE = 300;

// ---------------------------------------------------------------------------
// Detail of one log entry
// ---------------------------------------------------------------------------

const EntryDialog: React.FC<{ entry: AuditEntry; onClose: () => void }> = ({ entry, onClose }) => (
  <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-900/55 backdrop-blur-sm" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-chroma-subtle bg-chroma-card shadow-2xl focus:outline-none">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <div className="min-w-0">
            <Dialog.Title className="flex flex-wrap items-center gap-2 font-prompt text-lg font-bold text-ink">
              <ActionChip action={entry.action} /> {RESOURCE_LABEL[entry.resource] ?? entry.resource}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-ink-3">{entry.summary}</Dialog.Description>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="font-semibold text-ink-3">เวลา</dt>
            <dd className="text-ink">{dateTime(entry.at)}</dd>
            <dt className="font-semibold text-ink-3">ผู้ทำรายการ</dt>
            <dd className="text-ink">{entry.actorName ? `${entry.actorName} (${entry.actor})` : entry.actor}</dd>
            {entry.recordId && (
              <>
                <dt className="font-semibold text-ink-3">รหัสรายการ</dt>
                <dd className="text-ink">{entry.recordId}</dd>
              </>
            )}
            {entry.ip && (
              <>
                <dt className="font-semibold text-ink-3">IP</dt>
                <dd className="font-mono text-ink">{entry.ip}</dd>
              </>
            )}
          </dl>
          {(entry.before || entry.after) && <ChangeDiff before={entry.before} after={entry.after} />}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const AuditView: React.FC = () => {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [actors, setActors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [action, setAction] = useState('');
  const [resource, setResource] = useState('');
  const [actor, setActor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [, flash, freshIds] = useFlashIds<number>();
  const lastIds = useRef<Map<number, string> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const filters = useMemo(() => ({ q: query, action, resource, actor, from, to }), [query, action, resource, actor, from, to]);

  /** A quiet reload (live update) keeps the list and lets new entries slide in */
  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      lastIds.current = null;
    }
    setError(null);
    try {
      const data = await auditApi.list({ ...filters, limit: PAGE });
      const { added, map } = diffRows(lastIds.current ?? new Map<number, string>(), data.rows, (r) => r.id);
      if (silent && lastIds.current && added.size > 0) flash(added, added);
      lastIds.current = map;
      setRows(data.rows);
      setTotal(data.total);
      setActors(data.actors);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      if (!silent) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  // Every change anywhere adds a log entry
  useLiveReload(['orders', 'contracts', 'incoming', 'guarantees', 'progress', 'notes', 'users'], () => load(true));

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const data = await auditApi.list({ ...filters, limit: PAGE, offset: rows.length });
      setRows((prev) => [...prev, ...data.rows]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoadingMore(false);
    }
  };

  const columns = useMemo<ColumnDef<AuditEntry, unknown>[]>(() => {
    const col = (id: string, header: string, accessor: (e: AuditEntry) => string | number | undefined, render?: (e: AuditEntry) => React.ReactNode, meta?: DataTableColumnMeta): ColumnDef<AuditEntry, unknown> => ({
      id,
      header,
      accessorFn: accessor,
      sortUndefined: 'last',
      meta: { label: header, ...meta } satisfies DataTableColumnMeta,
      cell: ({ row }) => (render ? render(row.original) : (accessor(row.original) ?? '')),
    });
    return [
      col('at', 'เวลา', (e) => e.at, (e) => dateTime(e.at), { nowrap: true }),
      col('actor', 'ผู้ทำรายการ', (e) => e.actorName || e.actor, (e) => (
        <span>
          {e.actorName || e.actor}
          {e.actorName && <span className="ml-1.5 font-mono text-xs text-ink-5">{e.actor}</span>}
        </span>
      )),
      col('action', 'การกระทำ', (e) => ACTION_LABEL[e.action]?.label ?? e.action, (e) => <ActionChip action={e.action} />, { nowrap: true }),
      col('resource', 'ทะเบียน', (e) => RESOURCE_LABEL[e.resource] ?? e.resource, undefined, { nowrap: true }),
      col('summary', 'รายละเอียด', (e) => e.summary, undefined, { wide: true }),
    ];
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-prompt text-lg font-bold text-ink">ประวัติการใช้งาน</h3>
        <p className="mt-1 text-sm text-ink-3">บันทึกอัตโนมัติว่าใครเพิ่ม แก้ไข ลบ เข้าสู่ระบบ หรือปรับสิทธิ์ เมื่อไหร่ พร้อมค่าก่อนและหลังแก้ (ลบหรือแก้ไขบันทึกนี้ไม่ได้)</p>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="min-h-[40px] rounded-lg px-3 font-semibold underline cursor-pointer">ลองใหม่</button>
        </div>
      )}

      <DataTable
        ariaLabel="ประวัติการใช้งาน"
        storageKey="audit-log"
        data={rows}
        columns={columns}
        loading={loading}
        emptyText="ไม่พบรายการที่ตรงกับเงื่อนไข"
        onRowClick={(e) => setSelected(e)}
        rowClassName={(e) => (freshIds.has(e.id) ? 'row-new' : undefined)}
        toolbar={
          <div className="relative flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหารายละเอียด ชื่อผู้ใช้ รหัสรายการ..."
              aria-label="ค้นหาประวัติ"
              className="pf-field w-full min-h-[40px] rounded-lg py-2 pl-9 pr-3 text-sm"
            />
          </div>
        }
        filters={
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3 text-sm text-ink-3">
            <div className="flex items-center gap-2">
              การกระทำ
              <Select
                value={action}
                onValueChange={setAction}
                options={[{ value: '', label: 'ทั้งหมด' }, ...Object.entries(ACTION_LABEL).map(([value, a]) => ({ value, label: a.label }))]}
                ariaLabel="กรองตามการกระทำ"
              />
            </div>
            <div className="flex items-center gap-2">
              ทะเบียน
              <Select
                value={resource}
                onValueChange={setResource}
                options={[{ value: '', label: 'ทั้งหมด' }, ...Object.entries(RESOURCE_LABEL).map(([value, label]) => ({ value, label }))]}
                ariaLabel="กรองตามทะเบียน"
              />
            </div>
            <div className="flex items-center gap-2">
              ผู้ทำรายการ
              <Select
                value={actor}
                onValueChange={setActor}
                options={[{ value: '', label: 'ทั้งหมด' }, ...actors.map((a) => ({ value: a, label: a }))]}
                ariaLabel="กรองตามผู้ทำรายการ"
                className="max-w-[14rem]"
              />
            </div>
            <label className="flex items-center gap-2">
              ตั้งแต่
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="pf-field min-h-[40px] rounded-lg px-3 text-sm" />
            </label>
            <label className="flex items-center gap-2">
              ถึง
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="pf-field min-h-[40px] rounded-lg px-3 text-sm" />
            </label>
            {(action || resource || actor || from || to) && (
              <button
                type="button"
                onClick={() => {
                  setAction('');
                  setResource('');
                  setActor('');
                  setFrom('');
                  setTo('');
                }}
                className="min-h-[40px] rounded-lg px-2 text-sm font-semibold underline cursor-pointer"
              >
                ล้างตัวกรอง
              </button>
            )}
          </div>
        }
        footer={
          <span className="inline-flex flex-wrap items-center justify-end gap-3">
            แสดง {rows.length.toLocaleString('th-TH')} จาก {total.toLocaleString('th-TH')} รายการ
            {rows.length < total && (
              <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="pf-btn inline-flex min-h-[36px] items-center gap-2 rounded-lg px-3 text-sm font-semibold cursor-pointer">
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                โหลดรายการที่เก่ากว่า
              </button>
            )}
          </span>
        }
      />

      {selected && <EntryDialog entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};
