import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, TriangleAlert } from 'lucide-react';
import type { ConflictError } from './api';

const dateTime = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * "Someone already edited this row": shown instead of silently overwriting their work.
 * The user can load the latest version (dropping their edit) or knowingly save over it.
 */
export const ConflictDialog: React.FC<{
  what: string;
  conflict: ConflictError;
  onReload: () => void;
  onOverwrite: () => Promise<void>;
  onCancel: () => void;
}> = ({ what, conflict, onReload, onOverwrite, onCancel }) => {
  const [busy, setBusy] = useState(false);
  const { by, at } = conflict.current;

  return (
    <Dialog.Root open onOpenChange={(o) => !o && !busy && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-slate-900/55 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[90] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-chroma-subtle bg-chroma-card p-6 shadow-2xl focus:outline-none">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/40">
              <TriangleAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
            </div>
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold text-ink">มีผู้อื่นแก้ไข{what}นี้ไปแล้ว</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-3">
                {by ? <><b>{by}</b>{at ? ` บันทึกเมื่อ ${dateTime(at)}` : ' บันทึกไปก่อนหน้านี้'}</> : 'มีการบันทึกใหม่หลังจากที่คุณเปิดรายการนี้'}
                {' '}หากบันทึกทับ การเปลี่ยนแปลงของเขาจะหายไป (ยังดูย้อนหลังได้ในประวัติการแก้ไข)
              </Dialog.Description>
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={onReload}
              className="min-h-[44px] rounded-lg border border-slate-300 px-5 text-sm font-semibold hover:bg-slate-50 dark:border-[var(--pf-field-border)] dark:hover:bg-[var(--pf-hover)] cursor-pointer disabled:opacity-60"
            >
              ปิดและโหลดข้อมูลล่าสุด
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onOverwrite();
                } finally {
                  setBusy(false);
                }
              }}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-amber-600 px-5 text-sm font-semibold text-white hover:bg-amber-700 cursor-pointer disabled:opacity-80"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              บันทึกทับ
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
