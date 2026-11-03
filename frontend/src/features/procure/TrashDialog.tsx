import React, { useCallback, useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, RotateCcw, X } from 'lucide-react';
import { procureApi, type Resource, type TrashRow } from './api';
import type { Notify } from './types';

const dateTime = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const TRASH_DAYS = 30;

/** Recycle bin of one register: deleted rows can be restored for 30 days, then they are removed for good */
export const TrashDialog: React.FC<{
  resource: Resource | 'progress';
  /** e.g. "ใบสั่ง" */
  singular: string;
  /** Text identifying a row in the list */
  titleOf: (row: TrashRow) => string;
  notify: Notify;
  onRestored: () => void;
  onClose: () => void;
}> = ({ resource, singular, titleOf, notify, onRestored, onClose }) => {
  const [rows, setRows] = useState<TrashRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await procureApi.trash(resource));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดถังขยะไม่สำเร็จ');
    }
  }, [resource]);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (row: TrashRow) => {
    setBusyId(row.id);
    try {
      await procureApi.restore(resource, row.id);
      notify(`กู้คืน${singular}แล้ว`, 'success');
      onRestored();
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'กู้คืนไม่สำเร็จ', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const daysLeft = (iso: string) => Math.max(0, TRASH_DAYS - Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-900/55 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-chroma-subtle bg-chroma-card shadow-2xl focus:outline-none">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-white/10">
            <div className="min-w-0">
              <Dialog.Title className="font-prompt text-lg font-bold text-ink">ถังขยะ · {singular}</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-ink-3">
                รายการที่ลบจะอยู่ที่นี่ {TRASH_DAYS} วัน กู้คืนได้ หลังจากนั้นจะถูกลบถาวร
              </Dialog.Description>
            </div>
            <button type="button" onClick={onClose} aria-label="ปิด" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {error && <p role="alert" className="text-sm font-medium text-rose-700 dark:text-rose-300">{error}</p>}
            {!error && rows === null && (
              <div className="flex justify-center py-10 text-ink-4">
                <Loader2 className="h-6 w-6 animate-spin" aria-label="กำลังโหลด" />
              </div>
            )}
            {rows && rows.length === 0 && <p className="py-8 text-center text-sm text-ink-3">ถังขยะว่าง</p>}
            {rows && rows.length > 0 && (
              <ul className="divide-y divide-slate-200 dark:divide-white/10">
                {rows.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold text-ink">{titleOf(row) || `#${row.id}`}</p>
                      <p className="mt-0.5 text-xs text-ink-4">
                        ลบโดย {row.deleted_by ?? '–'} · {dateTime(row.deleted_at)} · เหลือ {daysLeft(row.deleted_at)} วัน
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void restore(row)}
                      className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-50 dark:border-[var(--pf-field-border)] dark:hover:bg-[var(--pf-hover)] cursor-pointer disabled:opacity-60"
                    >
                      {busyId === row.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}
                      กู้คืน
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
