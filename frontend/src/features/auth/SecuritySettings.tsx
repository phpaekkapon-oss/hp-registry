import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Copy, IdCard, Loader2, RotateCcw, Save, TriangleAlert } from 'lucide-react';
import { securityApi, type AdminSecurity, type ProviderAdmin } from './securityApi';

const DEFAULTS = { lockMinutes: 5, logoutMinutes: 30 };

interface ProviderDraft extends ProviderAdmin {
  /** Typed in this session; empty = keep the stored one */
  clientSecret: string;
}

const fieldClass = 'pf-field w-full min-h-[40px] rounded-lg px-3 text-sm';

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block text-sm font-semibold">
    {label}
    <span className="mt-1 block">{children}</span>
    {hint && <span className="mt-1 block text-xs font-normal text-ink-4">{hint}</span>}
  </label>
);

const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors cursor-pointer ${checked ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'}`}
  >
    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
);

/** Admin page: idle times, ThaID / Provider ID sign-in switches, and recovery for people who lost their PIN or phone */
export const SecuritySettings: React.FC<{ part: 'policy' | 'providers' }> = ({ part }) => {
  const [data, setData] = useState<AdminSecurity | null>(null);
  const [lock, setLock] = useState(DEFAULTS.lockMinutes);
  const [logout, setLogout] = useState(DEFAULTS.logoutMinutes);
  const [publicUrl, setPublicUrl] = useState('');
  const [providers, setProviders] = useState<ProviderDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [resetUser, setResetUser] = useState('');

  const apply = useCallback((d: AdminSecurity) => {
    setData(d);
    setLock(d.security.lockMinutes);
    setLogout(d.security.logoutMinutes);
    setPublicUrl(d.security.publicUrl);
    setProviders(d.providers.map((p) => ({ ...p, clientSecret: '' })));
  }, []);

  useEffect(() => {
    securityApi.adminGet().then(apply).catch((e) => setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'โหลดไม่สำเร็จ' }));
  }, [apply]);

  const patchProvider = (id: string, patch: Partial<ProviderDraft>) => setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      // Each page saves only its own part; the server keeps everything else as it was
      const d = await securityApi.adminSave(
        part === 'policy'
          ? { lockMinutes: lock, logoutMinutes: logout }
          : {
              publicUrl,
              providers: Object.fromEntries(
                providers.map((p) => [p.id, { enabled: p.enabled, clientId: p.clientId, clientSecret: p.clientSecret, authUrl: p.authUrl, tokenUrl: p.tokenUrl, userinfoUrl: p.userinfoUrl, scope: p.scope, pidField: p.pidField }])
              ),
            }
      );
      apply(d);
      setMsg({ kind: 'ok', text: 'บันทึกแล้ว ค่าเวลาใหม่มีผลกับการเข้าสู่ระบบครั้งถัดไปของแต่ละคน' });
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ' });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!resetUser.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await securityApi.adminReset(resetUser.trim());
      setMsg({ kind: 'ok', text: r.reset ? `รีเซ็ต PIN และ Google Authenticator ของ ${resetUser.trim()} แล้ว` : `${resetUser.trim()} ยังไม่ได้ตั้ง PIN หรือ Google Authenticator` });
      setResetUser('');
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'รีเซ็ตไม่สำเร็จ' });
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <div className="flex justify-center py-12 text-ink-4">
        {msg ? <p role="alert" className="text-sm font-medium text-rose-700 dark:text-rose-300">{msg.text}</p> : <Loader2 className="h-6 w-6 animate-spin" aria-label="กำลังโหลด" />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {part === 'policy' && (
      <section className="gov-card space-y-4 p-5" aria-labelledby="set-idle">
        <div>
          <h2 id="set-idle" className="font-prompt text-base font-semibold">เวลาเมื่อไม่ได้ใช้งาน</h2>
          <p className="mt-1 text-sm text-ink-3">
            ผู้ที่ตั้ง PIN: ล็อกหน้าจอเมื่อไม่ได้ใช้งานครบเวลาล็อก แล้วออกจากระบบทันทีเมื่อครบเวลาออกจากระบบ · ผู้ที่ไม่ได้ตั้ง PIN: ออกจากระบบเมื่อครบเวลาออกจากระบบ
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ล็อกหน้าจอ (นาที)" hint={`ค่ามาตรฐาน ${DEFAULTS.lockMinutes} นาที`}>
            <input type="number" min={1} max={240} value={lock} onChange={(e) => setLock(Number(e.target.value))} className={fieldClass} />
          </Field>
          <Field label="ออกจากระบบ ให้ล็อกอินใหม่ (นาที)" hint={`ค่ามาตรฐาน ${DEFAULTS.logoutMinutes} นาที · ต้องมากกว่าเวลาล็อกหน้าจอ`}>
            <input type="number" min={2} max={720} value={logout} onChange={(e) => setLogout(Number(e.target.value))} className={fieldClass} />
          </Field>
        </div>
        <button
          type="button"
          onClick={() => {
            setLock(DEFAULTS.lockMinutes);
            setLogout(DEFAULTS.logoutMinutes);
          }}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg px-3 text-sm font-semibold underline-offset-2 hover:underline cursor-pointer"
        >
          <RotateCcw className="h-4 w-4" aria-hidden /> ใช้ค่ามาตรฐาน ({DEFAULTS.lockMinutes} / {DEFAULTS.logoutMinutes} นาที)
        </button>
      </section>

      )}

      {part === 'providers' && (
      <section className="gov-card space-y-5 p-5" aria-labelledby="set-ext">
        <div>
          <h2 id="set-ext" className="font-prompt text-base font-semibold">เข้าสู่ระบบด้วย ThaID / Provider ID</h2>
          <p className="mt-1 text-sm text-ink-3">
            เปิดสวิตช์เพื่อแสดงปุ่มในหน้า login ระบบจะจับคู่เลขประจำตัวประชาชนที่ได้จากผู้ให้บริการ กับชื่อผู้ใช้ HOSxP (ซึ่งคือเลขประจำตัวประชาชน) ที่ได้รับอนุญาตแล้วในหน้ารายชื่อผู้ใช้
          </p>
        </div>

        <Field label="ที่อยู่เว็บของระบบนี้ (Public URL)" hint="ใช้สร้าง Redirect URI ที่ต้องลงทะเบียนกับผู้ให้บริการ เช่น https://procure.ddc.go.th · เว้นว่างเพื่อใช้ที่อยู่ที่เปิดอยู่ตอนนี้">
          <input value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} placeholder="https://..." className={fieldClass} />
        </Field>

        {providers.map((p) => (
          <div key={p.id} className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-white/10">
            <div className="flex items-center gap-3">
              {p.id === 'thaid' ? <IdCard className="h-5 w-5 text-brand" aria-hidden /> : <BadgeCheck className="h-5 w-5 text-brand" aria-hidden />}
              <h3 className="font-prompt text-base font-semibold">{p.label}</h3>
              <span className={`text-xs font-semibold ${p.enabled ? (p.ready ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300') : 'text-ink-4'}`}>{p.enabled ? (p.ready ? 'เปิดใช้งาน · แสดงปุ่มในหน้า login' : 'เปิดอยู่ แต่ยังตั้งค่าไม่ครบ (ผู้ใช้จะกดแล้วเข้าไม่ได้)') : 'ปิดอยู่'}</span>
              <div className="ml-auto">
                <Switch checked={p.enabled} onChange={(v) => patchProvider(p.id, { enabled: v })} label={`เปิดใช้งาน ${p.label}`} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Client ID">
                <input value={p.clientId} onChange={(e) => patchProvider(p.id, { clientId: e.target.value })} autoComplete="off" className={fieldClass} />
              </Field>
              <Field label="Client Secret" hint={p.hasSecret ? 'บันทึกไว้แล้ว (เข้ารหัส) — เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยน' : undefined}>
                <input type="password" value={p.clientSecret} onChange={(e) => patchProvider(p.id, { clientSecret: e.target.value })} placeholder={p.hasSecret ? '••••••••' : ''} autoComplete="new-password" className={fieldClass} />
              </Field>
              <Field label="Authorize URL">
                <input value={p.authUrl} onChange={(e) => patchProvider(p.id, { authUrl: e.target.value })} className={fieldClass} />
              </Field>
              <Field label="Token URL">
                <input value={p.tokenUrl} onChange={(e) => patchProvider(p.id, { tokenUrl: e.target.value })} className={fieldClass} />
              </Field>
              <Field label="Userinfo URL (ถ้ามี)" hint="ใช้เมื่อ Token ไม่ส่งเลขประจำตัวประชาชนมาให้">
                <input value={p.userinfoUrl} onChange={(e) => patchProvider(p.id, { userinfoUrl: e.target.value })} className={fieldClass} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Scope">
                  <input value={p.scope} onChange={(e) => patchProvider(p.id, { scope: e.target.value })} className={fieldClass} />
                </Field>
                <Field label="ชื่อฟิลด์เลขประชาชน">
                  <input value={p.pidField} onChange={(e) => patchProvider(p.id, { pidField: e.target.value })} className={fieldClass} />
                </Field>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-[var(--pf-head-bg)]">
              <span className="font-semibold">Redirect URI ที่ต้องลงทะเบียน:</span>
              <code className="min-w-0 break-all">{p.redirectUri}</code>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(p.redirectUri)} aria-label="คัดลอก Redirect URI" className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 cursor-pointer">
                <Copy className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        ))}
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Client ID/Secret ได้จากการลงทะเบียนระบบกับผู้ให้บริการ (ThaID: กรมการปกครอง, Provider ID: กระทรวงสาธารณสุข) และ URL ต่าง ๆ ต้องตรงกับคู่มือของผู้ให้บริการที่ได้รับ ผู้ให้บริการส่วนใหญ่บังคับ https สำหรับ Redirect URI</span>
        </p>
      </section>

      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={() => void save()} className="btn-brand inline-flex min-h-[44px] items-center gap-2 rounded-lg px-5 text-sm font-semibold cursor-pointer disabled:opacity-70">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />} บันทึกการตั้งค่า
        </button>
        {msg && (
          <p role={msg.kind === 'error' ? 'alert' : 'status'} className={`text-sm font-medium ${msg.kind === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
            {msg.text}
          </p>
        )}
      </div>

      {part === 'policy' && (
      <section className="gov-card space-y-3 p-5" aria-labelledby="set-reset">
        <h2 id="set-reset" className="font-prompt text-base font-semibold">ช่วยผู้ใช้ที่ลืม PIN หรือโทรศัพท์หาย</h2>
        <p className="text-sm text-ink-3">รีเซ็ตแล้ว ผู้ใช้จะเข้าสู่ระบบด้วยรหัสผ่านอย่างเดียวได้ และต้องตั้ง PIN / Google Authenticator ใหม่เอง</p>
        <div className="flex flex-wrap gap-2">
          <input value={resetUser} onChange={(e) => setResetUser(e.target.value)} placeholder="ชื่อผู้ใช้ (เช่น เลขประจำตัวประชาชน)" aria-label="ชื่อผู้ใช้ที่ต้องการรีเซ็ต" className={`${fieldClass} max-w-xs`} />
          <button type="button" disabled={busy || !resetUser.trim()} onClick={() => void reset()} className="min-h-[40px] rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50 dark:border-[var(--pf-field-border)] dark:hover:bg-[var(--pf-hover)] cursor-pointer disabled:opacity-60">
            รีเซ็ต PIN และ 2FA
          </button>
        </div>
      </section>
      )}
    </div>
  );
};
