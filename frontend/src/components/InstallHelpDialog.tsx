import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CheckCircle2, MonitorSmartphone, TriangleAlert, X } from 'lucide-react';
import { getInstallDiagnosis, isAlreadyInstalled } from '../services/pwa';

interface InstallHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Shown when the browser has not offered a one-click install (iOS never does; others only
 * do so once the page is installable). Explains how to install by hand and, if something is
 * blocking installation, says what.
 */
export const InstallHelpDialog: React.FC<InstallHelpDialogProps> = ({ open, onOpenChange }) => {
  const d = open ? getInstallDiagnosis() : null;
  const [installed, setInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    if (open) void isAlreadyInstalled().then(setInstalled);
  }, [open]);

  const steps: { title: string; items: string[] }[] = [];
  if (d?.ios) {
    steps.push({
      title: 'iPhone / iPad (Safari)',
      items: ['แตะปุ่ม “แชร์” (รูปสี่เหลี่ยมมีลูกศรชี้ขึ้น) ที่แถบด้านล่าง', 'เลื่อนลงแล้วเลือก “เพิ่มลงในหน้าจอโฮม”', 'แตะ “เพิ่ม”'],
    });
  } else if (d?.android) {
    steps.push({
      title: 'Android (Chrome)',
      items: ['แตะเมนู ⋮ มุมขวาบน', 'เลือก “ติดตั้งแอป” หรือ “เพิ่มลงในหน้าจอหลัก”'],
    });
  } else {
    steps.push({
      title: 'คอมพิวเตอร์ (Chrome / Edge)',
      items: [
        'มองหาไอคอนติดตั้ง (จอคอมมีลูกศรลง) ที่ปลายช่องที่อยู่เว็บไซต์ แล้วคลิก',
        'หรือเปิดเมนู ⋮ แล้วเลือก “ส่ง แคสต์ และบันทึก” → “ติดตั้งหน้านี้เป็นแอป” (Edge: เมนู … → “แอป” → “ติดตั้งไซต์นี้เป็นแอป”)',
      ],
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-900/55 backdrop-blur-sm" />
        <Dialog.Content className="fixed z-[80] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] max-w-md max-h-[88dvh] overflow-y-auto rounded-2xl border border-chroma-subtle bg-chroma-card p-6 shadow-2xl focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 shrink-0 rounded-xl bg-brand-soft flex items-center justify-center">
                <MonitorSmartphone className="w-5 h-5 text-brand" aria-hidden="true" />
              </div>
              <div>
                <Dialog.Title className="text-lg font-semibold text-ink">ติดตั้งเป็นแอป</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-ink-4">
                  เปิดเป็นหน้าต่างเต็มเหมือนแอป มีไอคอนบนหน้าจอโฮมหรือเดสก์ท็อป
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="ปิดหน้าต่าง"
                className="w-10 h-10 -mr-2 -mt-1 shrink-0 rounded-lg inline-flex items-center justify-center text-slate-500 hover:text-ink-2 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {d && !d.secureContext && (
            <p role="alert" className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-3 text-sm text-amber-900 dark:text-amber-200">
              <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                หน้านี้ไม่ได้เปิดผ่าน HTTPS เบราว์เซอร์จึงไม่เปิดให้ติดตั้ง (ติดตั้งได้เฉพาะ HTTPS หรือ localhost)
                กรุณาให้ผู้ดูแลระบบตั้งค่า HTTPS
              </span>
            </p>
          )}

          {installed && (
            <div role="status" className="mt-5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-950/30 dark:text-emerald-200">
              <p className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> เครื่องนี้ติดตั้งแอปนี้ไว้แล้ว
              </p>
              <p className="mt-1.5 leading-relaxed">
                เบราว์เซอร์จึงไม่ให้ติดตั้งซ้ำ เปิดแอปได้จากไอคอน “งานพัสดุ” บนเดสก์ท็อป/เมนู Start หรือปุ่ม “เปิดในแอป” ที่ช่องที่อยู่เว็บไซต์
              </p>
              <p className="mt-1.5 leading-relaxed">
                ถ้าต้องการติดตั้งใหม่: เปิดแอป → เมนู ⋮ มุมขวาบน → “ถอนการติดตั้ง งานพัสดุ” แล้วกลับมากดติดตั้งที่นี่อีกครั้ง
              </p>
            </div>
          )}

          <div className="mt-5 space-y-5">
            {steps.map((s) => (
              <section key={s.title}>
                <h3 className="text-sm font-semibold text-ink">{s.title}</h3>
                <ol className="mt-2 space-y-2 text-sm text-ink-3 list-decimal list-inside marker:text-brand marker:font-semibold">
                  {s.items.map((it) => (
                    <li key={it} className="leading-relaxed">
                      {it}
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>

          {!installed && <p className="mt-5 text-xs text-ink-4 leading-relaxed">
            ถ้าเคยติดตั้งไว้แล้ว เบราว์เซอร์จะไม่แสดงตัวเลือกติดตั้งซ้ำ ให้เปิดจากไอคอนของแอปแทน (หรือถอนการติดตั้ง: เปิดแอป → เมนู ⋮ → “ถอนการติดตั้ง” แล้วติดตั้งใหม่)
          </p>}

          <div className="mt-6 flex justify-end">
            <Dialog.Close asChild>
              <button type="button" className="btn-brand min-h-[46px] px-6 rounded-lg text-sm font-semibold cursor-pointer">
                เข้าใจแล้ว
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
