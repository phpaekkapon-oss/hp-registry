import React, { useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Copy, Download, KeyRound, Loader2, LockKeyhole, MonitorX, Smartphone } from 'lucide-react';
import { useAuth } from './AuthContext';
import { securityApi } from './securityApi';

const inputClass =
  'pf-field w-full min-h-[44px] rounded-lg px-3 text-base tracking-[0.3em] tabular-nums';

const Msg: React.FC<{ kind: 'ok' | 'error'; children: React.ReactNode }> = ({ kind, children }) => (
  <p
    role={kind === 'error' ? 'alert' : 'status'}
    className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 ${
      kind === 'ok'
        ? 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-400/20'
        : 'bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20'
    }`}
  >
    {children}
  </p>
);

const digits = (v: string, max = 6) => v.replace(/\D/g, '').slice(0, max);

export const PinSection: React.FC = () => {
  const { security, setSecurity } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ' });
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      if (!/^\d{4,6}$/.test(next)) throw new Error('PIN ต้องเป็นตัวเลข 4-6 หลัก');
      if (next !== again) throw new Error('PIN ที่ยืนยันไม่ตรงกัน');
      setSecurity(await securityApi.setPin(next, security.hasPin ? current : undefined));
      setCurrent('');
      setNext('');
      setAgain('');
      setMsg({ kind: 'ok', text: security.hasPin ? 'เปลี่ยน PIN แล้ว' : 'ตั้ง PIN แล้ว หน้าจอจะล็อกอัตโนมัติเมื่อไม่ได้ใช้งาน' });
    });

  const remove = () =>
    run(async () => {
      setSecurity(await securityApi.removePin(current));
      setCurrent('');
      setMsg({ kind: 'ok', text: 'ยกเลิก PIN แล้ว ระบบจะออกจากระบบแทนการล็อกหน้าจอเมื่อไม่ได้ใช้งาน' });
    });

  return (
    <section aria-labelledby="sec-pin" className="space-y-3">
      <h3 id="sec-pin" className="flex items-center gap-2 font-prompt text-base font-semibold">
        <LockKeyhole className="h-4 w-4" aria-hidden /> PIN ล็อกหน้าจอ
        {security.hasPin && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">เปิดใช้งาน</span>}
      </h3>
      <p className="text-sm text-ink-3">
        เมื่อไม่ได้ใช้งานเกิน {security.lockMinutes} นาที หน้าจอจะล็อกและต้องใส่ PIN (ข้อมูลทั้งหมดถูกซ่อน) หากไม่ปลดล็อกจนครบ {security.logoutMinutes} นาที ระบบจะออกจากระบบให้ใหม่
      </p>
      {security.hasPin && (
        <label className="block text-sm font-semibold">
          PIN ปัจจุบัน
          <input type="password" inputMode="numeric" autoComplete="off" value={current} onChange={(e) => setCurrent(digits(e.target.value))} className={`${inputClass} mt-1`} />
        </label>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          {security.hasPin ? 'PIN ใหม่' : 'ตั้ง PIN (ตัวเลข 4-6 หลัก)'}
          <input type="password" inputMode="numeric" autoComplete="new-password" value={next} onChange={(e) => setNext(digits(e.target.value))} className={`${inputClass} mt-1`} />
        </label>
        <label className="block text-sm font-semibold">
          ยืนยัน PIN
          <input type="password" inputMode="numeric" autoComplete="new-password" value={again} onChange={(e) => setAgain(digits(e.target.value))} className={`${inputClass} mt-1`} />
        </label>
      </div>
      {msg && <Msg kind={msg.kind}>{msg.text}</Msg>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !next} onClick={() => void save()} className="btn-brand inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold cursor-pointer disabled:opacity-60">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {security.hasPin ? 'เปลี่ยน PIN' : 'ตั้ง PIN'}
        </button>
        {security.hasPin && (
          <button type="button" disabled={busy || !current} onClick={() => void remove()} className="min-h-[44px] rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50 dark:border-[var(--pf-field-border)] dark:hover:bg-[var(--pf-hover)] cursor-pointer disabled:opacity-60">
            ยกเลิก PIN
          </button>
        )}
      </div>
    </section>
  );
};

/** The one-time view of the recovery codes: copy or save them now, they are never shown again */
const RecoveryCodes: React.FC<{ codes: string[]; onDone: () => void }> = ({ codes, onDone }) => {
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');
  const outline = 'inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-amber-400 px-3 text-sm font-semibold text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-500/20 cursor-pointer';
  return (
    <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-400/30 dark:bg-amber-500/10" role="alert">
      <p className="text-sm font-bold text-amber-900 dark:text-amber-200">รหัสกู้คืน (แสดงครั้งเดียว) — เก็บไว้ในที่ปลอดภัย</p>
      <p className="text-xs text-amber-900 dark:text-amber-200">ใช้แทนรหัสจากแอปตอนเข้าสู่ระบบ เมื่อโทรศัพท์หายหรือเปิดแอปไม่ได้ แต่ละรหัสใช้ได้ครั้งเดียว</p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-sm tabular-nums text-amber-950 dark:text-amber-100 sm:grid-cols-5">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => setCopied(true));
          }}
          className={outline}
        >
          <Copy className="h-4 w-4" aria-hidden /> {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
        </button>
        <button
          type="button"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([`รหัสกู้คืน 2FA ระบบงานพัสดุ\n(ใช้ได้ครั้งละหนึ่งรหัส)\n\n${text}\n`], { type: 'text/plain;charset=utf-8' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'recovery-codes.txt';
            a.click();
            URL.revokeObjectURL(url);
          }}
          className={outline}
        >
          <Download className="h-4 w-4" aria-hidden /> บันทึกเป็นไฟล์
        </button>
        <button type="button" onClick={onDone} className="btn-brand ml-auto inline-flex min-h-[40px] items-center rounded-lg px-4 text-sm font-semibold cursor-pointer">
          เก็บไว้แล้ว
        </button>
      </div>
    </div>
  );
};

export const TotpSection: React.FC = () => {
  const { security, setSecurity } = useAuth();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  // While the admin's policy asks this person for 2FA, turning it off is not allowed
  const policyAsks = security.twofa.required || (security.totpEnabled && security.twofa.deadline !== null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'ไม่สำเร็จ' });
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    run(async () => {
      const s = await securityApi.totpSetup();
      setSetup({ secret: s.secret, qr: await QRCode.toDataURL(s.uri, { margin: 1, width: 192 }) });
      setCode('');
    });

  const enable = () =>
    run(async () => {
      const { backupCodes, ...info } = await securityApi.totpEnable(code);
      setCodes(backupCodes);
      setSecurity(info);
      setSetup(null);
      setCode('');
      setMsg({ kind: 'ok', text: 'เปิดใช้ Google Authenticator แล้ว ครั้งต่อไปที่เข้าสู่ระบบจะต้องกรอกรหัส 6 หลักจากแอป' });
    });

  const disable = () =>
    run(async () => {
      setSecurity(await securityApi.totpDisable(code));
      setCode('');
      setMsg({ kind: 'ok', text: 'ปิด Google Authenticator แล้ว' });
    });

  const regenerate = () =>
    run(async () => {
      const { backupCodes, ...info } = await securityApi.newBackupCodes();
      setCodes(backupCodes);
      setSecurity(info);
    });

  const forgetDevices = () =>
    run(async () => {
      await securityApi.clearTrustedDevices();
      setMsg({ kind: 'ok', text: 'ล้างอุปกรณ์ที่จำไว้แล้ว ทุกเครื่องต้องกรอกรหัส 2FA ใหม่ในการเข้าสู่ระบบครั้งถัดไป' });
    });

  const btn = 'inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50 dark:border-[var(--pf-field-border)] dark:hover:bg-[var(--pf-hover)] cursor-pointer disabled:opacity-60';

  return (
    <section aria-labelledby="sec-totp" className="space-y-3">
      <h3 id="sec-totp" className="flex flex-wrap items-center gap-2 font-prompt text-base font-semibold">
        <Smartphone className="h-4 w-4" aria-hidden /> Google Authenticator (ยืนยัน 2 ขั้นตอน)
        {security.totpEnabled && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">เปิดใช้งาน</span>}
        {security.twofa.required && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20">ผู้ดูแลระบบกำหนดให้ใช้</span>}
      </h3>
      {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />}
      {!security.totpEnabled && !setup && (
        <>
          <p className="text-sm text-ink-3">เพิ่มความปลอดภัยตอนเข้าสู่ระบบ: นอกจากรหัสผ่านต้องกรอกรหัส 6 หลักจากแอป Google Authenticator (หรือแอปที่รองรับ TOTP อื่น ๆ) บนโทรศัพท์</p>
          <button type="button" disabled={busy} onClick={() => void start()} className="btn-brand inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold cursor-pointer disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} ตั้งค่า Google Authenticator
          </button>
        </>
      )}
      {setup && (
        <div className="space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-[var(--pf-head-bg)]">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
            <li>เปิดแอป Google Authenticator แล้วกด "+" → สแกนคิวอาร์โค้ด</li>
            <li>กรอกรหัส 6 หลักที่แอปแสดง แล้วกดยืนยัน</li>
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            <img src={setup.qr} alt="คิวอาร์โค้ดสำหรับ Google Authenticator" width={192} height={192} className="rounded-lg bg-white p-1" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold">สแกนไม่ได้? พิมพ์รหัสนี้ในแอปแทน</p>
              <p className="mt-1 break-all font-mono text-base tracking-wider">{setup.secret.match(/.{1,4}/g)?.join(' ')}</p>
            </div>
          </div>
        </div>
      )}
      {(setup || (security.totpEnabled && !policyAsks)) && (
        <label className="block text-sm font-semibold">
          {setup ? 'รหัส 6 หลักจากแอป' : 'ปิดการใช้งาน: กรอกรหัส 6 หลักปัจจุบันจากแอป'}
          <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(digits(e.target.value))} className={`${inputClass} mt-1 max-w-[12rem]`} />
        </label>
      )}
      {msg && <Msg kind={msg.kind}>{msg.text}</Msg>}
      {setup && (
        <div className="flex gap-2">
          <button type="button" disabled={busy || code.length !== 6} onClick={() => void enable()} className="btn-brand inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold cursor-pointer disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} ยืนยันและเปิดใช้งาน
          </button>
          <button type="button" onClick={() => setSetup(null)} className={btn}>
            ยกเลิก
          </button>
        </div>
      )}
      {security.totpEnabled && !setup && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void regenerate()} className={btn}>
              <KeyRound className="h-4 w-4" aria-hidden /> สร้างรหัสกู้คืนใหม่ <span className="text-xs font-normal text-ink-4">(เหลือ {security.backupLeft} ชุด)</span>
            </button>
            {security.trustDeviceDays > 0 && (
              <button type="button" disabled={busy} onClick={() => void forgetDevices()} className={btn}>
                <MonitorX className="h-4 w-4" aria-hidden /> ล้างอุปกรณ์ที่จำไว้
              </button>
            )}
            {!policyAsks && (
              <button type="button" disabled={busy || code.length !== 6} onClick={() => void disable()} className={btn}>
                ปิด Google Authenticator
              </button>
            )}
          </div>
          <p className="flex items-start gap-1.5 text-xs text-ink-4">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> ถ้าโทรศัพท์หาย ใช้รหัสกู้คืนแทนรหัสจากแอปตอนเข้าสู่ระบบได้ หรือติดต่อผู้ดูแลระบบเพื่อรีเซ็ต
          </p>
        </div>
      )}
    </section>
  );
};
