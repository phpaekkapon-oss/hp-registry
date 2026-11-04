import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Loader2, Moon, RefreshCw, ServerCog, Sun } from 'lucide-react';
import { GOVERNMENT_THEMES, type ThemeColorConfig } from '../../services/themeService';
import { useSecurityScope, type RadiusTokenPreset } from '../../components/compound/EnterprisePrimitives';
import { systemApi, type About, type SystemStatus } from './systemApi';

const dateTime = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

const Card: React.FC<{ title: string; hint?: string; actions?: React.ReactNode; children: React.ReactNode }> = ({ title, hint, actions, children }) => (
  <section className="gov-card space-y-4 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-prompt text-base font-semibold">{title}</h2>
        {hint && <p className="mt-1 text-sm text-ink-3">{hint}</p>}
      </div>
      {actions}
    </div>
    {children}
  </section>
);

const Dot: React.FC<{ ok: boolean | null }> = ({ ok }) => (
  <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok === null ? 'bg-slate-400' : ok ? 'bg-emerald-500' : 'bg-rose-500'}`} aria-hidden />
);

// ---------------------------------------------------------------------------
// Theme & display
// ---------------------------------------------------------------------------

export const ThemeSection: React.FC<{ activeTheme: ThemeColorConfig; onSelectTheme: (t: ThemeColorConfig) => void; isDarkMode: boolean; onToggleDarkMode: () => void }> = ({
  activeTheme, onSelectTheme, isDarkMode, onToggleDarkMode,
}) => {
  const { radiusToken, onChangeRadiusToken } = useSecurityScope();
  const radii: { value: RadiusTokenPreset; label: string }[] = [
    { value: '8px', label: 'คมชัด (8px)' },
    { value: '12px', label: 'มาตรฐาน (12px)' },
    { value: '16px', label: 'โค้งมน (16px)' },
  ];
  return (
    <Card
      title="ธีมและการแสดงผล"
      hint="เลือกโทนสีประจำหน่วยงาน ความโค้งมนของมุม และโหมดมืด/สว่าง มีผลกับทั้งระบบและจำไว้ในเบราว์เซอร์เครื่องนี้"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="segmented" role="group" aria-label="ความโค้งมนของมุม">
            {radii.map((o) => (
              <button key={o.value} type="button" onClick={() => onChangeRadiusToken?.(o.value)} className="segmented-item" aria-pressed={radiusToken === o.value}>
                {o.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={onToggleDarkMode} className="pf-btn inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold cursor-pointer">
            {isDarkMode ? <Sun className="h-4 w-4 text-amber-400" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
            {isDarkMode ? 'โหมดสว่าง' : 'โหมดมืด'}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
        {GOVERNMENT_THEMES.map((theme) => {
          const selected = activeTheme.id === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => onSelectTheme(theme)}
              aria-pressed={selected}
              className={`flex min-h-[64px] flex-col justify-between rounded-lg border p-2.5 text-left transition-all cursor-pointer ${
                selected ? 'border-slate-900 bg-slate-50 ring-2 ring-slate-900/15 dark:border-white dark:bg-slate-800 dark:ring-white/20' : 'border-slate-200 hover:border-slate-300 dark:border-slate-800'
              }`}
            >
              <span className="flex w-full items-center justify-between">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-white" style={{ backgroundColor: theme.hex }}>
                  {selected && <Check className="h-3 w-3" aria-hidden />}
                </span>
                <span className="font-mono-tabular text-xs text-slate-500">{theme.hex}</span>
              </span>
              <span className="mt-2 block">
                <span className="block truncate text-sm font-bold text-ink">{theme.shortName}</span>
                <span className="block truncate text-xs font-medium text-ink-3">{theme.thaiName}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

export const ConnectionsSection: React.FC = () => {
  const [data, setData] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await systemApi.status());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดสถานะไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshBtn = (
    <button type="button" onClick={() => void load()} disabled={busy} className="pf-btn inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold cursor-pointer">
      <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden /> ตรวจสอบอีกครั้ง
    </button>
  );

  if (error) return <p role="alert" className="text-sm font-medium text-rose-700 dark:text-rose-300">{error}</p>;
  if (!data) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" aria-label="กำลังตรวจสอบ" /></div>;

  const { procure, hosxp, lastSync } = data;
  return (
    <div className="space-y-5">
      <Card title="ฐานข้อมูลระบบพัสดุ" hint="เก็บทะเบียนใบสั่ง สัญญา หนังสือรับ หลักประกัน ความก้าวหน้า และประวัติการใช้งาน" actions={refreshBtn}>
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs font-semibold text-ink-4">สถานะ</dt><dd className="mt-0.5 flex items-center gap-2 font-semibold"><Dot ok={procure.ok} />{procure.ok ? 'เชื่อมต่อได้' : `ผิดพลาด (${procure.error})`}</dd></div>
          <div><dt className="text-xs font-semibold text-ink-4">ฐานข้อมูล</dt><dd className="mt-0.5 font-semibold">{procure.database}</dd></div>
          <div><dt className="text-xs font-semibold text-ink-4">เซิร์ฟเวอร์</dt><dd className="mt-0.5 font-semibold">{procure.host ?? '–'}</dd></div>
          <div><dt className="text-xs font-semibold text-ink-4">ตอบสนอง / จำนวนตาราง</dt><dd className="mt-0.5 font-semibold tabular-nums">{procure.latencyMs ?? '–'} ms · {procure.tables ?? '–'} ตาราง</dd></div>
        </dl>
      </Card>

      <Card title="HOSxP (อ่านอย่างเดียว)" hint="ใช้ตรวจรหัสผ่านตอนเข้าสู่ระบบและซิงก์รายชื่อผู้ใช้จากตาราง opduser และ doctor เท่านั้น">
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs font-semibold text-ink-4">สถานะ</dt><dd className="mt-0.5 flex items-center gap-2 font-semibold"><Dot ok={hosxp.configured ? hosxp.ok : null} />{!hosxp.configured ? 'ยังไม่ได้ตั้งค่า' : hosxp.ok ? 'เชื่อมต่อได้' : `ผิดพลาด (${hosxp.error})`}</dd></div>
          <div><dt className="text-xs font-semibold text-ink-4">เซิร์ฟเวอร์ / ฐานข้อมูล</dt><dd className="mt-0.5 font-semibold">{hosxp.host ?? '–'} · {hosxp.database ?? '–'}</dd></div>
          <div><dt className="text-xs font-semibold text-ink-4">บัญชีที่ใช้เชื่อมต่อ</dt><dd className="mt-0.5 font-semibold">{hosxp.user ?? '–'}</dd></div>
          <div><dt className="text-xs font-semibold text-ink-4">ตอบสนอง</dt><dd className="mt-0.5 font-semibold tabular-nums">{hosxp.latencyMs ?? '–'} ms</dd></div>
        </dl>
        {hosxp.ok && hosxp.canWrite === true && (
          <div role="alert" className="flex items-start gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">บัญชี {hosxp.user} มีสิทธิ์แก้ไข/ลบข้อมูลใน HOSxP ซึ่งเกินความจำเป็น</p>
              <p className="mt-1">ระบบนี้ต้องการเพียง SELECT บนตาราง opduser และ doctor ควรให้ผู้ดูแลฐานข้อมูลสร้างบัญชีอ่านอย่างเดียว แล้วเปลี่ยน HOS_DB_USER / HOS_DB_PASSWORD ใน backend/.env</p>
              <p className="mt-1 break-all font-mono text-xs">{hosxp.grants.join(' ; ')}</p>
            </div>
          </div>
        )}
        {hosxp.ok && hosxp.canWrite === false && (
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" aria-hidden /> บัญชีนี้อ่านอย่างเดียว (ปลอดภัย)</p>
        )}
        <p className="text-sm text-ink-3">
          ซิงก์รายชื่อล่าสุด: {lastSync ? <><b>{dateTime(lastSync.at)}</b> · {lastSync.status === 'ok' ? 'สำเร็จ' : lastSync.status === 'error' ? 'ผิดพลาด' : 'กำลังทำงาน'}{lastSync.users != null && ` · ${lastSync.users.toLocaleString('th-TH')} คน`}{lastSync.by && ` · โดย ${lastSync.by}`}</> : 'ยังไม่เคยซิงก์'} (กดซิงก์ได้ที่หน้า "ผู้ใช้งาน & สิทธิ์")
        </p>
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------

export const AboutSection: React.FC = () => {
  const [about, setAbout] = useState<About | null>(null);
  useEffect(() => {
    systemApi.about().then(setAbout).catch(() => setAbout(null));
  }, []);
  const up = about ? Math.floor(about.uptimeSeconds / 3600) : 0;
  return (
    <Card title="เกี่ยวกับระบบ" hint="ระบบงานพัสดุ · กองโรคติดต่อทั่วไป กรมควบคุมโรค">
      <dl className="grid gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs font-semibold text-ink-4">เวอร์ชัน</dt><dd className="mt-0.5 font-semibold">v{about?.version ?? '–'}</dd></div>
        <div><dt className="text-xs font-semibold text-ink-4">โหมด</dt><dd className="mt-0.5 font-semibold">{about ? (about.environment === 'production' ? 'ใช้งานจริง (production)' : 'พัฒนา (development)') : '–'}</dd></div>
        <div><dt className="text-xs font-semibold text-ink-4">เซิร์ฟเวอร์เริ่มทำงาน</dt><dd className="mt-0.5 font-semibold">{about ? dateTime(about.startedAt) : '–'}</dd></div>
        <div><dt className="text-xs font-semibold text-ink-4">ทำงานต่อเนื่อง</dt><dd className="mt-0.5 font-semibold tabular-nums">{about ? (up >= 1 ? `${up} ชั่วโมง` : `${Math.floor(about.uptimeSeconds / 60)} นาที`) : '–'}</dd></div>
      </dl>
      <p className="flex items-center gap-2 text-xs text-ink-4"><ServerCog className="h-4 w-4" aria-hidden /> Node {about?.node ?? '–'} · React + Express + MySQL</p>
    </Card>
  );
};
