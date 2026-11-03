import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { LogOut, Loader2, TriangleAlert } from 'lucide-react';

interface LogoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
  /** Records saved on this device that have not reached the server yet */
  pendingCount: number;
}

export const LogoutDialog: React.FC<LogoutDialogProps> = ({ open, onOpenChange, onConfirm, pendingCount }) => {
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-900/55 backdrop-blur-sm" />
        <Dialog.Content className="fixed z-[80] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-chroma-subtle bg-chroma-card p-6 shadow-2xl focus:outline-none">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 shrink-0 rounded-xl bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center">
              <LogOut className="w-5 h-5 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold text-ink">ออกจากระบบ</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-4">
                คุณต้องการออกจากระบบใช่หรือไม่ ข้อมูลในอุปกรณ์เครื่องนี้จะถูกล้างเพื่อคุ้มครองข้อมูลส่วนบุคคล
              </Dialog.Description>
            </div>
          </div>

          {pendingCount > 0 && (
            <p role="alert" className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-3 text-sm text-amber-900 dark:text-amber-200">
              <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                ยังมี <strong>{pendingCount} รายการ</strong> ที่รอซิงก์กับเซิร์ฟเวอร์ หากออกจากระบบตอนนี้รายการเหล่านี้จะสูญหาย
              </span>
            </p>
          )}

          <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={busy}
                className="min-h-[48px] px-5 rounded-lg border border-chroma-subtle bg-chroma-elevated text-sm font-semibold hover:border-chroma-optical cursor-pointer disabled:opacity-60"
              >
                ยกเลิก
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="min-h-[48px] px-5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-80"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              <span>ออกจากระบบ</span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
