import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronRight, Code2, Phone, X } from 'lucide-react';

const DEVELOPER = {
  name: 'นายเอกพล อันคำวงค์',
  role: 'นักวิชาการคอมพิวเตอร์ปฏิบัติการ',
  unit: 'งานสุขภาพดิจิทัล · โรงพยาบาลพังโคน',
  phone: 'โทร.257 (IT)',
  // Put the portrait at frontend/public/assets/developer.jpg; initials show until it exists
  photo: `${import.meta.env.BASE_URL}assets/developer.jpg`,
  initials: 'อ',
};

const Avatar: React.FC = () => {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-soft text-2xl font-bold text-brand ring-2 ring-[var(--brand-accent)]"
      aria-hidden="true"
    >
      {DEVELOPER.initials}
    </span>
  ) : (
    <img
      src={DEVELOPER.photo}
      alt=""
      onError={() => setFailed(true)}
      className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-[var(--brand-accent)]"
    />
  );
};

/** Footer link that opens the developer credit card */
export const DeveloperInfo: React.FC<{ variant?: 'footer' | 'sidebar'; compact?: boolean }> = ({ variant = 'footer', compact = false }) => (
  <Dialog.Root>
    <Dialog.Trigger asChild>
      {variant === 'sidebar' ? (
        <button
          type="button"
          title="ข้อมูลผู้พัฒนาระบบ"
          aria-label="ข้อมูลผู้พัฒนาระบบ"
          className={`sb-card sb-hoverable group mt-1.5 flex w-full cursor-pointer items-center rounded-xl text-left transition-colors ${
            compact ? 'min-h-[40px] justify-center' : 'gap-2.5 px-2.5 py-2'
          }`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/10">
            <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          {compact ? (
            <span className="sr-only">ผู้พัฒนาโปรแกรม</span>
          ) : (
            <>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[12px] font-semibold">ผู้พัฒนาโปรแกรม</span>
                <span className="sb-brand-sub mt-0.5 block truncate text-[10px]">งานสุขภาพดิจิทัล · รพ.พังโคน</span>
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </>
          )}
        </button>
      ) : (
        <button
          type="button"
          title="ข้อมูลผู้พัฒนาระบบ"
          className="inline-flex min-h-[28px] cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md text-xs text-ink-4 transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-accent)]"
        >
          <Code2 className="h-4 w-4 shrink-0" aria-hidden="true" /> ผู้พัฒนา
        </button>
      )}
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-chroma-subtle bg-chroma-card p-6 shadow-2xl focus:outline-none">
        <Dialog.Close asChild>
          <button
            type="button"
            aria-label="ปิดหน้าต่าง"
            className="absolute right-3 top-3 inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-ink-2 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </Dialog.Close>

        <Dialog.Title className="text-lg font-semibold text-ink">ผู้พัฒนาโปรแกรม</Dialog.Title>

        <div className="mt-5 flex flex-col items-center text-center">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" className="h-16 w-16 rounded-2xl shadow-md" />
          <p className="mt-3 text-base font-bold text-brand">ระบบงานพัสดุ</p>
          <Dialog.Description className="mt-1 text-sm text-ink-4">โรงพยาบาลพังโคน</Dialog.Description>
          <span className="mt-3 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-ink-3 dark:bg-white/10">
            เวอร์ชัน {__APP_VERSION__}
          </span>
        </div>

        <div className="mt-5 rounded-xl border border-chroma-subtle p-4">
          <div className="flex items-center gap-4">
            <Avatar />
            <div className="min-w-0">
              <p className="font-bold text-ink">{DEVELOPER.name}</p>
              <p className="mt-0.5 text-sm text-ink-4">{DEVELOPER.role}</p>
            </div>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-ink-2">
            <li className="flex items-center gap-2.5">
              <Code2 className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" /> {DEVELOPER.unit}
            </li>
            <li className="flex items-center gap-2.5">
              <Phone className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" /> {DEVELOPER.phone}
            </li>
          </ul>
        </div>

        <p className="mt-4 text-center text-xs text-ink-5">พบปัญหาการใช้งาน หรืออยากให้ปรับปรุงระบบ แจ้งได้ที่ผู้พัฒนา</p>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);
