import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ShieldCheck, X } from 'lucide-react';
import { SecurityCenter, type SecurityTab } from './SecurityCenter';

/** The signed-in person's own PIN and Google Authenticator settings */
export const SecurityDialog: React.FC<{ open: boolean; onOpenChange: (open: boolean) => void; tab?: SecurityTab }> = ({ open, onOpenChange, tab = 'profile' }) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-900/55 backdrop-blur-sm" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-chroma-subtle bg-chroma-card shadow-2xl focus:outline-none">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <div>
            <Dialog.Title className="flex items-center gap-2 font-prompt text-lg font-bold text-ink">
              <ShieldCheck className="h-5 w-5" aria-hidden /> ศูนย์ตั้งค่าความปลอดภัย
            </Dialog.Title>
            <Dialog.Description className="mt-0.5 text-sm text-ink-3">ยืนยันตัวตน 2FA · PIN ล็อกหน้าจอ · รูปโปรไฟล์ · อุปกรณ์ที่เข้าระบบ</Dialog.Description>
          </div>
          <button type="button" onClick={() => onOpenChange(false)} aria-label="ปิด" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <SecurityCenter key={tab} initialTab={tab} />
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);
