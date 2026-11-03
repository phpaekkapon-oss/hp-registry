import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Hourglass, Loader2, MonitorSmartphone, RotateCcw, ShieldCheck, ShieldOff, Users, UserCog, History } from 'lucide-react';
import { securityApi, type SecurityLogRow, type TwofaOverview, type TwofaPolicy, type TwofaUser } from './securityApi';

const dateTime = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const initials = (name: string) => Array.from(name.replace(/^[เแโใไ]+/, '').replace(/^(นาย|นางสาว|นาง)\s*/, ''))[0] ?? '?';

const POLICIES: { id: TwofaPolicy; title: string; hint: string; icon: React.ElementType }[] = [
  { id: 'off', title: 'ไม่บังคับ', hint: 'ผู้ใช้เลือกเปิดเอง', icon: ShieldOff },
  { id: 'admins', title: 'บังคับผู้ดูแลระบบ', hint: 'แนะนำ — บัญชีผู้ดูแลต้องใช้', icon: UserCog },
  { id: 'all', title: 'บังคับทุกคน', hint: 'ทุกบัญชี (มีระยะผ่อนผัน)', icon: Users },
];
const GRACE = [0, 3, 7, 14, 30];
const TRUST = [0, 1, 7, 30];

const Segmented: React.FC<{ value: number; options: number[]; label: (n: number) => string; onChange: (n: number) => void; name: string; busy: boolean }> = ({ value, options, label, onChange, name, busy }) => (
  <div role="radiogroup" aria-label={name} className="inline-flex flex-wrap rounded-xl bg-slate-100 p-1 ring-1 ring-inset ring-slate-200 dark:bg-white/5 dark:ring-white/10">
    {options.map((n) => (
      <button
        key={n}
        type="button"
        role="radio"
        aria-checked={value === n}
        disabled={busy}
        onClick={() => onChange(n)}
        className={`min-h-[36px] rounded-lg px-3 text-sm font-semibold transition-all cursor-pointer disabled:opacity-60 ${
          value === n ? 'bg-[var(--brand-strong,#1d4ed8)] text-white shadow-sm' : 'text-slate-600 hover:text-ink dark:hover:text-white'
        }`}
      >
        {label(n)}
      </button>
    ))}
  </div>
);

const Kpi: React.FC<{ icon: React.ElementType; tone: string; label: string; value: React.ReactNode }> = ({ icon: Icon, tone, label, value }) => (
  <div className="gov-card flex items-center gap-3 px-4 py-3">
    <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`} aria-hidden>
      <Icon className="h-5 w-5" />
    </span>
    <div className="min-w-0">
      <p className="text-xs font-semibold text-ink-4">{label}</p>
      <p className="font-prompt text-base font-bold leading-tight">{value}</p>
    </div>
  </div>
);

/** Admin: who must use Google Authenticator, how long they have, who already does, and what happened lately */
export const TwofaAdmin: React.FC = () => {
  const [data, setData] = useState<TwofaOverview | null>(null);
  const [log, setLog] = useState<SecurityLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, l] = await Promise.all([securityApi.twofaOverview(), securityApi.securityLog()]);
      setData(o);
      setLog(l);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (patch: { twofaPolicy?: TwofaPolicy; twofaGraceDays?: number; trustDeviceDays?: number }) => {
    setBusy(true);
    setNote(null);
    try {
      await securityApi.adminSave(patch);
      await load();
      setNote('บันทึกแล้ว');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const reset = async (u: TwofaUser) => {
    if (!window.confirm(`รีเซ็ต Google Authenticator ของ ${u.displayName}?\nผู้ใช้ต้องตั้งค่าใหม่เอง (และถ้านโยบายบังคับ จะถูกขอให้ตั้งทันที)`)) return;
    setResetting(u.username);
    try {
      await securityApi.adminReset(u.username, 'totp');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'รีเซ็ตไม่สำเร็จ');
    } finally {
      setResetting(null);
    }
  };

  if (!data) {
    return <div className="flex justify-center py-10">{error ? <p role="alert" className="text-sm font-medium text-rose-700 dark:text-rose-300">{error}</p> : <Loader2 className="h-6 w-6 animate-spin" aria-label="กำลังโหลด" />}</div>;
  }

  const policyName = POLICIES.find((p) => p.id === data.policy)?.title ?? '';
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Users} tone="bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" label="นโยบาย" value={policyName} />
        <Kpi icon={BadgeCheck} tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" label="เปิดใช้ 2FA แล้ว" value={`${data.counts.enabled} คน`} />
        <Kpi icon={Hourglass} tone="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" label="ยังไม่ตั้ง (ผ่อนผัน)" value={`${data.counts.pending} คน`} />
        <Kpi icon={MonitorSmartphone} tone="bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" label="จำเครื่อง" value={data.trustDeviceDays === 0 ? 'ถามทุกครั้ง' : `${data.trustDeviceDays} วัน`} />
      </div>

      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20">{error}</p>}

      <section className="gov-card space-y-4 p-5" aria-labelledby="tf-policy">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand" aria-hidden />
          <h2 id="tf-policy" className="font-prompt text-base font-semibold">นโยบาย 2FA</h2>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-label="กำลังบันทึก" />}
          {note && !busy && <span role="status" className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{note}</span>}
        </div>

        <div role="radiogroup" aria-label="นโยบาย 2FA" className="grid gap-3 md:grid-cols-3">
          {POLICIES.map((p) => {
            const on = data.policy === p.id;
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={busy}
                onClick={() => !on && void save({ twofaPolicy: p.id })}
                className={`relative flex min-h-[88px] flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors cursor-pointer disabled:opacity-70 ${
                  on ? 'border-[var(--brand-strong)] bg-brand-soft ring-1 ring-[var(--brand-strong)]' : 'border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5'
                }`}
              >
                <Icon className="h-5 w-5 text-ink-4" aria-hidden />
                <span className="text-sm font-bold">{p.title}</span>
                <span className="text-xs text-ink-4">{p.hint}</span>
                {on && <BadgeCheck className="absolute right-3 top-3 h-5 w-5 text-[var(--brand-strong)]" aria-hidden />}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-white/10">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-bold"><Hourglass className="h-4 w-4" aria-hidden /> ระยะผ่อนผัน</p>
            <p className="text-xs text-ink-4">ผู้ใช้ใช้งานต่อได้กี่วันก่อนต้องตั้ง 2FA (นับจากวันที่เปิดนโยบาย){data.policy === 'off' ? ' · ใช้เมื่อเปิดนโยบาย' : ''}</p>
          </div>
          <Segmented name="ระยะผ่อนผัน" value={data.graceDays} options={GRACE} label={(n) => (n === 0 ? 'ทันที' : `${n} วัน`)} onChange={(n) => void save({ twofaGraceDays: n })} busy={busy} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-white/10">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-bold"><MonitorSmartphone className="h-4 w-4" aria-hidden /> จำเครื่องหลังผ่าน 2FA</p>
            <p className="text-xs text-ink-4">เครื่องที่ผู้ใช้ติ๊ก "จำเครื่องนี้" ไม่ต้องกรอกรหัสซ้ำ · เครื่องที่ใช้ร่วมกันแนะนำ "ถามทุกครั้ง"</p>
          </div>
          <Segmented name="จำเครื่อง" value={data.trustDeviceDays} options={TRUST} label={(n) => (n === 0 ? 'ถามทุกครั้ง' : `${n} วัน`)} onChange={(n) => void save({ trustDeviceDays: n })} busy={busy} />
        </div>
      </section>

      <section className="gov-card" aria-labelledby="tf-users">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3 dark:border-white/10">
          <Users className="h-5 w-5 text-brand" aria-hidden />
          <h2 id="tf-users" className="font-prompt text-base font-semibold">ผู้ใช้ที่ตั้งค่า 2FA</h2>
          <span className="ml-auto text-xs text-ink-4">{data.counts.enabled} เปิดใช้ · {data.counts.pending} รอตั้งค่า</span>
        </div>
        {data.users.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-3">ยังไม่มีผู้ใช้ที่ตั้งค่า 2FA</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-white/10">
            {data.users.map((u) => (
              <li key={u.username} className="flex items-center gap-3 px-5 py-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full btn-brand text-sm font-bold" aria-hidden>{initials(u.displayName)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{u.displayName}</p>
                  <p className="truncate text-xs text-ink-4">@{u.username} · ใช้ล่าสุด {u.lastTotpAt ? dateTime(u.lastTotpAt) : '–'}</p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${u.totpEnabled ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25' : 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/25'}`}>
                  {u.totpEnabled ? <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> : <Hourglass className="h-3.5 w-3.5" aria-hidden />}
                  {u.totpEnabled ? 'เปิดใช้' : 'รอตั้งค่า'}
                </span>
                {u.totpEnabled && (
                  <button
                    type="button"
                    onClick={() => void reset(u)}
                    disabled={resetting !== null}
                    title="รีเซ็ต 2FA (ผู้ใช้ลืมหรือโทรศัพท์หาย)"
                    aria-label={`รีเซ็ต 2FA ของ ${u.displayName}`}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10 cursor-pointer disabled:opacity-60"
                  >
                    {resetting === u.username ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="gov-card" aria-labelledby="tf-log">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3 dark:border-white/10">
          <History className="h-5 w-5 text-brand" aria-hidden />
          <h2 id="tf-log" className="font-prompt text-base font-semibold">ประวัติความปลอดภัย</h2>
          <span className="ml-auto text-xs text-ink-4">{log.length} รายการล่าสุด</span>
        </div>
        {log.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-3">ยังไม่มีรายการ</p>
        ) : (
          <ul className="max-h-[22rem] divide-y divide-slate-200 overflow-y-auto dark:divide-white/10">
            {log.map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.action === 'login_failed' ? 'bg-amber-500' : 'bg-sky-500'}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{e.summary}</p>
                  <p className="text-xs text-ink-4">{e.actorName} · {dateTime(e.at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
