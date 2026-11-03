import React, { useCallback, useEffect, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Camera, CheckCircle2, Eye, EyeOff, KeyRound, Laptop, Loader2, LockKeyhole, LogOut, ShieldCheck, Smartphone, User } from 'lucide-react';
import { ROLE_LABELS } from '../../services/enterpriseService';
import { useAuth } from './AuthContext';
import { AvatarButton, AvatarEditorDialog } from './AvatarSection';
import { PinSection, TotpSection } from './PinTotpSections';
import { securityApi, type SessionRow } from './securityApi';

const dateTime = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

/** "Chrome · Windows" from a User-Agent string */
function describeAgent(ua: string): { label: string; phone: boolean } {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'เบราว์เซอร์';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'ไม่ทราบระบบ';
  return { label: `${browser} · ${os}`, phone: /Android|iPhone|iPad/.test(ua) };
}

const Chip: React.FC<{ on: boolean; icon: React.ElementType; children: React.ReactNode }> = ({ on, icon: Icon, children }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
      on
        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25'
        : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10'
    }`}
  >
    <Icon className="h-3.5 w-3.5" aria-hidden />
    {children}
  </span>
);

const Devices: React.FC = () => {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await securityApi.sessions());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดรายการอุปกรณ์ไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (ref: string | null) => {
    setBusy(ref ?? 'all');
    try {
      await securityApi.revokeSessions(ref);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  const others = rows?.filter((r) => !r.current).length ?? 0;
  return (
    <section aria-labelledby="sec-devices" className="rounded-xl border border-slate-200 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-white/10">
        <h3 id="sec-devices" className="font-prompt text-sm font-semibold">อุปกรณ์ที่เข้าระบบอยู่ {rows ? `(${rows.length})` : ''}</h3>
        {others > 0 && (
          <button type="button" disabled={busy !== null} onClick={() => void revoke(null)} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10 cursor-pointer disabled:opacity-60">
            {busy === 'all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <LogOut className="h-3.5 w-3.5" aria-hidden />} ออกจากระบบเครื่องอื่นทั้งหมด
          </button>
        )}
      </div>
      {error && <p role="alert" className="px-4 py-3 text-sm font-medium text-rose-700 dark:text-rose-300">{error}</p>}
      {!rows && !error && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" aria-label="กำลังโหลด" /></div>}
      <ul className="divide-y divide-slate-200 dark:divide-white/10">
        {rows?.map((r) => {
          const d = describeAgent(r.userAgent);
          const Icon = d.phone ? Smartphone : Laptop;
          return (
            <li key={r.ref} className="flex items-center gap-3 px-4 py-3">
              <Icon className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {d.label}
                  {r.current && <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">เครื่องนี้</span>}
                </p>
                <p className="text-xs text-ink-4">{r.ip || '–'} · เข้าระบบ {dateTime(r.createdAt)}</p>
              </div>
              {!r.current && (
                <button type="button" disabled={busy !== null} onClick={() => void revoke(r.ref)} className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 text-xs font-semibold hover:bg-slate-50 dark:border-[var(--pf-field-border)] dark:hover:bg-[var(--pf-hover)] cursor-pointer disabled:opacity-60">
                  {busy === r.ref && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />} ออกจากระบบ
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/** Members added in user management (not from HOSxP) set their own password here */
const ChangePassword: React.FC = () => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const mismatch = confirm !== '' && confirm !== next;
  const field = 'pf-field mt-1 w-full min-h-[44px] rounded-lg px-3 text-sm';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await securityApi.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setMsg({ kind: 'ok', text: `เปลี่ยนรหัสผ่านแล้ว${r.signedOut > 0 ? ` · ออกจากระบบในอุปกรณ์อื่น ${r.signedOut} เครื่อง` : ''}` });
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : 'เปลี่ยนรหัสผ่านไม่สำเร็จ' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
      <div className="mb-3 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-brand" aria-hidden />
        <h3 className="text-sm font-bold">เปลี่ยนรหัสผ่าน</h3>
        <button type="button" onClick={() => setShow((s) => !s)} className="ml-auto inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10 cursor-pointer">
          {show ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />} {show ? 'ซ่อนรหัส' : 'แสดงรหัส'}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold text-ink-3">รหัสผ่านปัจจุบัน
          <input type={show ? 'text' : 'password'} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required className={field} />
        </label>
        <label className="text-xs font-semibold text-ink-3">รหัสผ่านใหม่
          <input type={show ? 'text' : 'password'} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} className={field} />
        </label>
        <label className="text-xs font-semibold text-ink-3">ยืนยันรหัสผ่านใหม่
          <input type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required aria-invalid={mismatch || undefined} className={field} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p className={`mr-auto text-xs ${mismatch ? 'font-semibold text-rose-700 dark:text-rose-300' : 'text-ink-4'}`}>
          {mismatch ? 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน' : 'อย่างน้อย 8 ตัวอักษร มีทั้งตัวอักษรภาษาอังกฤษและตัวเลข · อุปกรณ์อื่นจะถูกออกจากระบบ'}
        </p>
        <button type="submit" disabled={busy || mismatch || !current || !next} className="btn-brand inline-flex min-h-[40px] items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 cursor-pointer">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} เปลี่ยนรหัสผ่าน
        </button>
      </div>
      {msg && (
        <p role={msg.kind === 'error' ? 'alert' : 'status'} className={`mt-2 flex items-center gap-1.5 text-sm font-medium ${msg.kind === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
          {msg.kind === 'ok' && <CheckCircle2 className="h-4 w-4" aria-hidden />} {msg.text}
        </p>
      )}
    </form>
  );
};

const ProfileTab: React.FC = () => {
  const { user, security } = useAuth();
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  if (!user) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
        <div className="flex flex-wrap items-center gap-5">
          <AvatarButton name={user.displayName} className="h-28 w-28 rounded-full text-4xl" variant="badge" onClick={() => setEditing(true)} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="font-prompt text-lg font-bold leading-tight">{user.displayName}</p>
            {user.position && <p className="text-sm font-semibold text-brand">{user.position}</p>}
            <p className="text-sm text-ink-4">@{user.username} · สิทธิ์ {ROLE_LABELS[user.role]}</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Chip on={security.totpEnabled} icon={ShieldCheck}>2FA: {security.totpEnabled ? 'เปิดใช้งาน' : 'ยังไม่เปิด'}</Chip>
              <Chip on={security.hasPin} icon={LockKeyhole}>PIN: {security.hasPin ? `เปิดใช้งาน · ${security.lockMinutes} น.` : 'ยังไม่ตั้ง'}</Chip>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 dark:border-white/10">
          <span className="text-xs text-ink-4">กดที่รูป (หรือไอคอนกล้อง) เพื่อเลือกรูป จัดตำแหน่ง ซูม แล้วบันทึก · JPG, PNG, WebP</span>
          <button type="button" onClick={() => setEditing(true)} className="ml-auto inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-brand hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer">
            <Camera className="h-3.5 w-3.5" aria-hidden /> {security.avatarUrl ? 'เปลี่ยน / ลบรูป' : 'อัปโหลดรูป'}
          </button>
        </div>
        {msg && (
          <p role={msg.kind === 'error' ? 'alert' : 'status'} className={`mt-2 flex items-center gap-1.5 text-sm font-medium ${msg.kind === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
            {msg.kind === 'ok' && <CheckCircle2 className="h-4 w-4" aria-hidden />} {msg.text}
          </p>
        )}
      </div>

      <p className="text-xs text-ink-4">
        {user.source === 'hosxp'
          ? 'ชื่อ ตำแหน่ง และรหัสผ่านมาจาก HOSxP — แก้ไขที่ HOSxP (ระบบนี้อ่านอย่างเดียว ไม่แตะตาราง opduser / doctor) ผู้ดูแลระบบกำหนดตำแหน่งแทนได้ในหน้า "ผู้ใช้งาน & สิทธิ์"'
          : user.source === 'local'
          ? 'บัญชีสมาชิกของระบบพัสดุ (ไม่ได้มาจาก HOSxP) ชื่อและตำแหน่งแก้ไขโดยผู้ดูแลระบบ รหัสผ่านเปลี่ยนเองได้ด้านบน'
          : 'บัญชีในตัวของระบบ ชื่อและรหัสผ่านกำหนดโดยผู้ดูแลระบบ'}
        {' '}· รูป PIN และ 2FA เก็บในฐานข้อมูลระบบพัสดุเท่านั้น
      </p>

      {user.source === 'local' && <ChangePassword />}

      <Devices />
      <AvatarEditorDialog open={editing} onOpenChange={setEditing} onDone={setMsg} />
    </div>
  );
};

const tabTrigger =
  'inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-950 data-[state=active]:bg-slate-100 data-[state=active]:text-ink dark:hover:text-white dark:data-[state=active]:bg-white/10 dark:data-[state=active]:text-white cursor-pointer';

const Dot: React.FC<{ on: boolean }> = ({ on }) => (on ? <span className="h-2 w-2 rounded-full bg-emerald-500" aria-label="เปิดใช้งาน" /> : null);

/** Profile photo, devices, Google Authenticator and PIN in one place (used in the window and in settings) */
export type SecurityTab = 'profile' | 'totp' | 'pin';

export const SecurityCenter: React.FC<{ initialTab?: SecurityTab }> = ({ initialTab = 'profile' }) => {
  const { security } = useAuth();
  const [tab, setTab] = useState<SecurityTab>(initialTab);
  return (
    <Tabs.Root value={tab} onValueChange={(v) => setTab(v as SecurityTab)} className="space-y-4">
      <Tabs.List aria-label="ศูนย์ตั้งค่าความปลอดภัย" className="flex gap-1 rounded-2xl border border-slate-200 p-1 dark:border-white/10">
        <Tabs.Trigger value="profile" className={tabTrigger}><User className="h-4 w-4" aria-hidden /> โปรไฟล์</Tabs.Trigger>
        <Tabs.Trigger value="totp" className={tabTrigger}><Smartphone className="h-4 w-4" aria-hidden /> 2FA ของฉัน <Dot on={security.totpEnabled} /></Tabs.Trigger>
        <Tabs.Trigger value="pin" className={tabTrigger}><LockKeyhole className="h-4 w-4" aria-hidden /> PIN &amp; ล็อกอัตโนมัติ <Dot on={security.hasPin} /></Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="profile" className="focus-visible:outline-none"><ProfileTab /></Tabs.Content>
      <Tabs.Content value="totp" className="focus-visible:outline-none"><TotpSection /></Tabs.Content>
      <Tabs.Content value="pin" className="focus-visible:outline-none"><PinSection /></Tabs.Content>
    </Tabs.Root>
  );
};

