import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, X } from 'lucide-react';
import { auditApi, type AuditEntry } from './api';
import { ActionChip, ChangeDiff, RESOURCE_LABEL } from './ChangeDiff';

const dateTime = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

/** Timeline of everything that happened to one row: who added it, each edit (before → after), and a deletion if any */
export const RowHistoryDialog: React.FC<{ resource: string; recordId: number; title: string; onClose: () => void }> = ({ resource, recordId, title, onClose }) => {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    auditApi
      .record(resource, recordId)
      .then((e) => !cancelled && setEntries(e))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'โหลดประวัติไม่สำเร็จ'));
    return () => {
      cancelled = true;
    };
  }, [resource, recordId]);

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-900/55 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-chroma-subtle bg-chroma-card shadow-2xl focus:outline-none">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-white/10">
            <div className="min-w-0">
              <Dialog.Title className="font-prompt text-lg font-bold text-ink">ประวัติการแก้ไข</Dialog.Title>
              <Dialog.Description className="mt-0.5 truncate text-sm text-ink-3">
                {RESOURCE_LABEL[resource] ?? resource} · {title}
              </Dialog.Description>
            </div>
            <button type="button" onClick={onClose} aria-label="ปิด" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {error && <p role="alert" className="text-sm font-medium text-rose-700 dark:text-rose-300">{error}</p>}
            {!error && entries === null && (
              <div className="flex justify-center py-10 text-ink-4">
                <Loader2 className="h-6 w-6 animate-spin" aria-label="กำลังโหลด" />
              </div>
            )}
            {entries && entries.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-3">ยังไม่มีประวัติของรายการนี้ (รายการที่สร้างก่อนเปิดใช้ระบบบันทึกจะเริ่มมีประวัติตั้งแต่การแก้ไขครั้งถัดไป)</p>
            )}
            {entries && entries.length > 0 && (
              <ol className="relative space-y-5 border-l-2 border-slate-200 pl-5 dark:border-white/10">
                {entries.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[1.6rem] top-1.5 h-3 w-3 rounded-full bg-[var(--brand-strong,#1d4ed8)] ring-4 ring-[var(--token-surface-card,#fff)]" aria-hidden />
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <ActionChip action={e.action} />
                      <span className="font-semibold text-ink">{e.actorName || e.actor}</span>
                      <span className="text-ink-4">{dateTime(e.at)}</span>
                    </div>
                    {(e.before || e.after) && (
                      <details className="mt-2" open={e.action === 'update'}>
                        <summary className="cursor-pointer text-sm font-semibold text-ink-3">ดูรายละเอียด</summary>
                        <div className="mt-2">
                          <ChangeDiff before={e.before} after={e.after} />
                        </div>
                      </details>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
