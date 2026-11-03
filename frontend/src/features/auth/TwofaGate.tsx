import React from 'react';
import { LogOut, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useAuth } from './AuthContext';
import { TotpSection } from './PinTotpSections';

const dateOnly = (iso: string) => new Date(iso).toLocaleDateString('th-TH', { dateStyle: 'long' });

/** Shown instead of the app once the grace period is over: nothing else works until 2FA is set up */
export const TwofaSetupScreen: React.FC = () => {
  const { user, logout } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-chroma-canvas p-5 text-ink">
      <div className="gov-card w-full max-w-xl space-y-5 p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" aria-hidden>
            <ShieldAlert className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-prompt text-xl font-bold">ต้องตั้งค่า Google Authenticator ก่อนใช้งาน</h1>
            <p className="mt-1 text-sm text-ink-3">
              ผู้ดูแลระบบกำหนดให้บัญชีของ {user?.displayName} ใช้การยืนยันตัวตน 2 ขั้นตอน และครบระยะผ่อนผันแล้ว กรุณาตั้งค่าตอนนี้ ใช้เวลาไม่ถึงนาที
            </p>
          </div>
        </div>
        <TotpSection />
        <button type="button" onClick={() => void logout()} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-700 hover:bg-chroma-elevated dark:text-slate-200 cursor-pointer">
          <LogOut className="h-4 w-4" aria-hidden /> ออกจากระบบ
        </button>
      </div>
    </div>
  );
};

/** Before the deadline: a reminder strip at the top of every page */
export const TwofaBanner: React.FC = () => {
  const { security } = useAuth();
  if (!security.twofa.required || security.twofa.enforced) return null;
  const deadline = security.twofa.deadline;
  const days = deadline ? Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000)) : null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-amber-100 px-4 py-2 text-sm font-medium text-amber-950 dark:bg-amber-500/15 dark:text-amber-100">
      <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
      <span>
        ผู้ดูแลระบบกำหนดให้ใช้ Google Authenticator
        {deadline && days !== null ? ` — ตั้งค่าภายใน ${dateOnly(deadline)} (อีก ${days} วัน)` : ''}
      </span>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('open-security', { detail: { tab: 'totp' } }))}
        className="ml-auto inline-flex min-h-[32px] items-center rounded-lg bg-amber-900 px-3 text-xs font-bold text-white hover:bg-amber-800 cursor-pointer dark:bg-amber-200 dark:text-amber-950 dark:hover:bg-amber-100"
      >
        ตั้งค่าเลย
      </button>
    </div>
  );
};
