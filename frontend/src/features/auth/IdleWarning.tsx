import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { LogOut, Timer } from 'lucide-react';
import { useAuth } from './AuthContext';

/** "You will be signed out in N seconds": one click keeps the session (and renews it on the server) */
export const IdleWarning: React.FC = () => {
  const { idleSecondsLeft, stayActive, logout } = useAuth();
  const open = idleSecondsLeft !== null;
  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm" />
        <Dialog.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 z-[100] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-chroma-subtle bg-chroma-card p-6 text-center shadow-2xl focus:outline-none">
          <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-500/15" aria-hidden>
            <Timer className="h-7 w-7 text-amber-600 dark:text-amber-300" />
          </span>
          <Dialog.Title className="mt-4 font-prompt text-lg font-bold text-ink">ไม่ได้ใช้งานมาสักครู่</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-relaxed text-ink-3">
            เพื่อความปลอดภัยของข้อมูล ระบบจะออกจากระบบอัตโนมัติใน
          </Dialog.Description>
          <p className="mt-2 font-prompt text-4xl font-bold tabular-nums text-ink" aria-live="polite">
            {idleSecondsLeft ?? 0}
            <span className="ml-1 text-base font-semibold text-ink-4">วินาที</span>
          </p>
          <div className="mt-5 grid gap-2">
            <button type="button" autoFocus onClick={stayActive} className="btn-brand min-h-[46px] w-full cursor-pointer rounded-xl text-sm font-bold">
                ใช้งานต่อ
              </button>
            <button type="button" onClick={() => void logout()} className="inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl text-sm font-semibold text-ink-3 hover:bg-slate-100 dark:hover:bg-white/5">
                <LogOut className="h-4 w-4" aria-hidden /> ออกจากระบบตอนนี้
              </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
