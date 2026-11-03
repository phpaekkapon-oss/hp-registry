import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Loader2, LockKeyhole, LogOut } from 'lucide-react';
import type { AuthUser } from '../../services/authService';
import { UserAvatar } from './UserAvatar';
import { useAuth } from './AuthContext';

/**
 * Covers the whole app (opaque, so nothing behind it can be read) while the screen is locked.
 * The server refuses every data request until the right PIN is entered.
 */
export const LockScreen: React.FC<{ user: AuthUser }> = ({ user }) => {
  const { unlock, logout, security } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{4,6}$/.test(pin)) {
      setError('PIN ต้องเป็นตัวเลข 4-6 หลัก');
      return;
    }
    setBusy(true);
    setError(null);
    const message = await unlock(pin);
    if (message) {
      setError(message);
      setPin('');
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="หน้าจอถูกล็อก"
      className="fixed inset-0 z-[300] flex items-center justify-center bg-chroma-canvas p-5 text-ink"
    >
      <form onSubmit={submit} className="gov-card w-full max-w-sm p-7 text-center shadow-[0_24px_60px_-24px_rgba(15,23,42,0.45)]">
        <UserAvatar name={user.displayName} className="mx-auto h-20 w-20 rounded-full text-2xl" />
        <p className="mt-3 truncate text-lg font-semibold">{user.displayName}</p>
        <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-ink-4">
          <LockKeyhole className="h-4 w-4" aria-hidden /> หน้าจอถูกล็อก เพราะไม่ได้ใช้งานเกิน {security.lockMinutes} นาที
        </p>

        <label htmlFor="lock-pin" className="mt-6 block text-left text-sm font-semibold">
          ใส่ PIN เพื่อปลดล็อก
        </label>
        <input
          id="lock-pin"
          ref={inputRef}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          aria-invalid={error ? true : undefined}
          className="mt-1.5 w-full min-h-[56px] rounded-xl border border-[var(--login-field-border)] bg-[var(--login-field-bg)] text-center text-2xl tracking-[0.6em] focus:outline-none focus:ring-4 focus:ring-[color:var(--brand-accent)]/15 focus:border-[color:var(--brand-accent)]"
        />
        {error && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2.5 text-left text-sm font-medium text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-brand mt-4 inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-80">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
          ปลดล็อก
        </button>
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-chroma-elevated dark:text-slate-200 cursor-pointer"
        >
          <LogOut className="h-4 w-4" aria-hidden /> ลืม PIN? ออกจากระบบแล้วเข้าสู่ระบบใหม่
        </button>
        <p className="mt-4 text-xs text-ink-4">
          หากไม่ปลดล็อกภายใน {Math.max(security.logoutMinutes - security.lockMinutes, 1)} นาทีถัดไป ระบบจะออกจากระบบให้อัตโนมัติ
        </p>
      </form>
    </div>
  );
};
