import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Bot, ShieldAlert, ChevronLeft, ChevronRight, DatabaseBackup, Fingerprint, History, Info, LayoutGrid, ListChecks, Lock, Palette, Plug, Settings, ShieldCheck, Users } from 'lucide-react';
import type { AuthUser } from '../../services/authService';
import type { ThemeColorConfig } from '../../services/themeService';
import { SecuritySettings } from '../auth/SecuritySettings';
import { SecurityCenter } from '../auth/SecurityCenter';
import { TwofaAdmin } from '../auth/TwofaAdmin';
import { AboutSection, ConnectionsSection, ThemeSection } from './sections';
import { BackupSection } from './BackupSection';

const UserAdminView = lazy(() => import('../users/UserAdminView').then((m) => ({ default: m.UserAdminView })));
const LookupsSection = lazy(() => import('./LookupsSection').then((m) => ({ default: m.LookupsSection })));
const NotificationsSection = lazy(() => import('./NotificationsSection').then((m) => ({ default: m.NotificationsSection })));
const AiSection = lazy(() => import('./AiSection').then((m) => ({ default: m.AiSection })));
const AuditView = lazy(() => import('../audit/AuditView').then((m) => ({ default: m.AuditView })));

export type SettingsSectionId = 'lookups' | 'users' | 'security' | 'twofa' | 'audit' | 'providers' | 'connections' | 'backup' | 'about' | 'theme' | 'ai' | 'notifications';

interface Props {
  user: AuthUser;
  activeTheme: ThemeColorConfig;
  onSelectTheme: (t: ThemeColorConfig) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  /** Open straight into a section (e.g. from a menu item elsewhere) */
  requested?: { section: SettingsSectionId; nonce: number } | null;
}

interface Section {
  id: SettingsSectionId;
  group: string;
  icon: React.ElementType;
  /** Tailwind gradient for the icon tile */
  tone: string;
  title: string;
  sub: string;
  adminOnly?: boolean;
  visible: boolean;
}

const GROUPS = [
  { id: 'data', label: 'ข้อมูลพื้นฐาน', hint: 'ตัวเลือกที่ใช้กรอกทะเบียน' },
  { id: 'connect', label: 'การเชื่อมต่อ', hint: 'ฐานข้อมูลและระบบยืนยันตัวตนภายนอก' },
  { id: 'access', label: 'ผู้ใช้และความปลอดภัย', hint: 'ใครเข้าได้ ทำอะไรได้ และตรวจสอบการใช้งาน' },
  { id: 'system', label: 'ระบบ', hint: 'สำรองข้อมูลและข้อมูลเวอร์ชัน' },
  { id: 'general', label: 'ทั่วไป', hint: 'การแสดงผลบนเครื่องนี้' },
] as const;

const LOADING = (
  <div className="p-6 text-sm font-medium text-ink-4" role="status">
    กำลังโหลดข้อมูล...
  </div>
);

const SectionTile: React.FC<{ icon: React.ElementType; tone: string; size?: 'sm' | 'md' }> = ({ icon: Icon, tone, size = 'md' }) => (
  <span className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${tone} ${size === 'md' ? 'h-10 w-10' : 'h-8 w-8 rounded-lg'}`} aria-hidden>
    <Icon className={size === 'md' ? 'h-5 w-5' : 'h-4 w-4'} />
  </span>
);

/** One place for every setting: the left list jumps between pages, the overview shows them all as cards */
export const SettingsHub: React.FC<Props> = ({ user, activeTheme, onSelectTheme, isDarkMode, onToggleDarkMode, requested }) => {
  const isAdmin = user.menus.includes('usermgmt');
  const [current, setCurrent] = useState<SettingsSectionId | 'overview'>(() => {
    try {
      const urlSec = new URLSearchParams(window.location.search).get('section') as SettingsSectionId;
      if (urlSec) return urlSec;
      const stored = localStorage.getItem('app_settings_section') as SettingsSectionId;
      if (stored) return stored;
    } catch {
      /* ignore */
    }
    return 'overview';
  });

  const handleSetCurrent = useCallback((sec: SettingsSectionId | 'overview') => {
    setCurrent(sec);
    try {
      localStorage.setItem('app_settings_section', sec);
      const url = new URL(window.location.href);
      if (sec === 'overview') {
        url.searchParams.delete('section');
      } else {
        url.searchParams.set('section', sec);
      }
      window.history.replaceState({}, '', url.toString());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (requested) handleSetCurrent(requested.section);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested?.nonce]);

  const sections = useMemo<Section[]>(
    () => [
      { id: 'lookups', group: 'data', icon: ListChecks, tone: 'from-cyan-500 to-sky-600', title: 'ตัวเลือกข้อมูล (Dropdown)', sub: 'ผู้รับผิดชอบ · กลุ่มงาน · แหล่งงบ · วิธีจัดซื้อ · สถานะ · หน่วยนับ', adminOnly: true, visible: isAdmin },
      { id: 'users', group: 'access', icon: Users, tone: 'from-violet-500 to-fuchsia-600', title: 'ผู้ใช้งาน & สิทธิ์', sub: 'ดึงผู้ใช้จาก HOSxP · กลุ่มสิทธิ์ · ติ๊กเมนูรายบุคคล', adminOnly: true, visible: isAdmin },
      { id: 'security', group: 'access', icon: ShieldCheck, tone: 'from-rose-500 to-red-600', title: 'โปรไฟล์ & ความปลอดภัย', sub: 'รูปโปรไฟล์ · PIN ล็อกหน้าจอ · Google Authenticator · อุปกรณ์ที่เข้าระบบ', visible: true },
      { id: 'twofa', group: 'access', icon: ShieldAlert, tone: 'from-emerald-500 to-teal-600', title: 'ยืนยันตัวตนสองชั้น (2FA)', sub: 'นโยบายบังคับใช้ · ระยะผ่อนผัน · จำเครื่อง · ผู้ใช้ที่ตั้งค่า · ประวัติ', adminOnly: true, visible: isAdmin },
      { id: 'audit', group: 'access', icon: History, tone: 'from-slate-500 to-slate-700', title: 'ประวัติการใช้งาน', sub: 'ใครทำอะไร เมื่อไหร่ · ค่าก่อน-หลังการแก้ไข', adminOnly: true, visible: user.menus.includes('audit') },
      { id: 'providers', group: 'connect', icon: Fingerprint, tone: 'from-indigo-500 to-blue-600', title: 'ThaID / Provider ID', sub: 'เข้าสู่ระบบด้วยบัตรประชาชนดิจิทัล · เปิด/ปิดได้', adminOnly: true, visible: isAdmin },
      { id: 'connections', group: 'connect', icon: Plug, tone: 'from-sky-500 to-blue-600', title: 'การเชื่อมต่อฐานข้อมูล', sub: 'ฐานข้อมูลพัสดุ · HOSxP (อ่านอย่างเดียว) · ซิงก์ล่าสุด', adminOnly: true, visible: isAdmin },
      { id: 'ai', group: 'system', icon: Bot, tone: 'from-fuchsia-500 to-violet-600', title: 'ผู้ช่วย AI', sub: 'สลับโมเดลอัตโนมัติ · เขียนบันทึกเวอร์ชันตอน deploy · ดูความเคลื่อนไหวสด', adminOnly: true, visible: isAdmin },
      { id: 'backup', group: 'system', icon: DatabaseBackup, tone: 'from-amber-500 to-orange-600', title: 'สำรองข้อมูล', sub: 'สำรองอัตโนมัติทุกวัน · สำรองตอนนี้ · รายการไฟล์', adminOnly: true, visible: isAdmin },
      { id: 'about', group: 'system', icon: Info, tone: 'from-purple-500 to-indigo-600', title: 'เกี่ยวกับระบบ', sub: 'เวอร์ชัน · โหมดการทำงาน · เวลาเซิร์ฟเวอร์', visible: true },
      { id: 'notifications', group: 'general', icon: Bell, tone: 'from-rose-500 to-orange-500', title: 'การแจ้งเตือน', sub: 'เรื่องที่ต้องดำเนินการ · ประวัติทั้งหมด · เลือกทะเบียนที่แจ้ง', visible: true },
      { id: 'theme', group: 'general', icon: Palette, tone: 'from-emerald-500 to-teal-600', title: 'ธีมและการแสดงผล', sub: 'โทนสี 16 เฉด · ความโค้งมน · โหมดมืด/สว่าง', visible: user.menus.includes('settings') },
    ],
    [isAdmin, user.menus]
  );
  const visible = sections.filter((s) => s.visible);
  const active = visible.find((s) => s.id === current);
  const section = current === 'overview' || !active ? null : active;

  const content = (id: SettingsSectionId): React.ReactNode => {
    switch (id) {
      case 'lookups':
        return <LookupsSection />;
      case 'users':
        return <UserAdminView />;
      case 'audit':
        return <AuditView />;
      case 'security':
        return (
          <div className="space-y-5">
            <div className="gov-card p-5">
              <SecurityCenter />
            </div>
          </div>
        );
      case 'twofa':
        return (
          <div className="space-y-5">
            <TwofaAdmin />
            <SecuritySettings part="policy" />
          </div>
        );
      case 'providers':
        return <SecuritySettings part="providers" />;
      case 'connections':
        return <ConnectionsSection />;
      case 'backup':
        return <BackupSection />;
      case 'ai':
        return <AiSection />;
      case 'notifications':
        return <NotificationsSection menus={user.menus} />;
      case 'about':
        return <AboutSection />;
      case 'theme':
        return <ThemeSection activeTheme={activeTheme} onSelectTheme={onSelectTheme} isDarkMode={isDarkMode} onToggleDarkMode={onToggleDarkMode} />;
    }
  };

  const navBtn = (active: boolean) =>
    `flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition-colors cursor-pointer ${
      active ? 'bg-brand-soft text-slate-950 ring-1 ring-[var(--brand-strong)]/30 dark:text-white' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5'
    }`;

  return (
    <div className="mx-auto max-w-[2200px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      {/* Banner */}
      <header
        className="flex items-center gap-4 rounded-2xl px-5 py-4 text-white shadow-md"
        style={{ background: 'linear-gradient(120deg, var(--brand-strong) 0%, var(--brand-primary) 100%)' }}
      >
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30" aria-hidden>
          <Settings className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-prompt text-lg font-bold leading-tight">ตั้งค่าระบบ</h1>
          <p className="hidden text-sm text-white/85 sm:block">จัดการการตั้งค่าของระบบงานพัสดุไว้ในที่เดียว ผู้ใช้ ความปลอดภัย การเชื่อมต่อ และการสำรองข้อมูล</p>
        </div>
        <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold ring-1 ring-white/25">{visible.length} เมนู</span>
      </header>

      <div className="grid gap-5 lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        {/* Left list (desktop) */}
        <nav aria-label="เมนูตั้งค่า" className="hidden lg:block">
          <div className="gov-card sticky top-4 max-h-[calc(100dvh-8rem)] space-y-1 overflow-y-auto p-2.5">
            <button type="button" onClick={() => handleSetCurrent('overview')} aria-current={section === null ? 'page' : undefined} className={navBtn(section === null)}>
              <LayoutGrid className="h-[18px] w-[18px]" aria-hidden /> ภาพรวมการตั้งค่า
            </button>
            {GROUPS.map((g) => {
              const items = visible.filter((s) => s.group === g.id);
              if (items.length === 0) return null;
              return (
                <div key={g.id} className="pt-2">
                  <p className="px-3 pb-1 text-xs font-bold text-ink-5">{g.label}</p>
                  {items.map((s) => (
                    <button key={s.id} type="button" onClick={() => handleSetCurrent(s.id)} aria-current={section?.id === s.id ? 'page' : undefined} className={navBtn(section?.id === s.id)}>
                      <SectionTile icon={s.icon} tone={s.tone} size="sm" />
                      <span className="min-w-0 flex-1 truncate">{s.title}</span>
                      {s.adminOnly && <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="เฉพาะผู้ดูแลระบบ" />}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </nav>

        {/* Content */}
        <div className="min-w-0">
          {section === null ? (
            <div className="columns-1 md:columns-2 2xl:columns-3 gap-5 [column-fill:_balance]">
              {GROUPS.map((g) => {
                const items = visible.filter((s) => s.group === g.id);
                if (items.length === 0) return null;
                return (
                  <section key={g.id} aria-label={g.label} className="gov-card mb-5 inline-block w-full break-inside-avoid overflow-hidden shadow-xs">
                    <div className="flex flex-wrap items-baseline gap-x-2 border-b border-slate-200 px-4 py-3 dark:border-white/10">
                      <h2 className="font-prompt text-base font-bold">{g.label}</h2>
                      <span className="text-xs text-ink-4">{g.hint}</span>
                    </div>
                    <ul className="divide-y divide-slate-200 dark:divide-white/10">
                      {items.map((s) => (
                        <li key={s.id}>
                          <button type="button" onClick={() => handleSetCurrent(s.id)} className="group flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer">
                            <SectionTile icon={s.icon} tone={s.tone} />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold">
                                {s.title}
                                {s.adminOnly && (
                                  <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                                    <Lock className="h-3 w-3" aria-hidden /> ผู้ดูแล
                                  </span>
                                )}
                              </span>
                              <span className="mt-0.5 block text-xs text-ink-4">{s.sub}</span>
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => handleSetCurrent('overview')} className="inline-flex min-h-[40px] shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5 lg:hidden cursor-pointer">
                  <ChevronLeft className="h-4 w-4" aria-hidden /> ภาพรวม
                </button>
                <SectionTile icon={section.icon} tone={section.tone} />
                <div className="min-w-0">
                  <h2 className="font-prompt text-lg font-bold leading-tight">{section.title}</h2>
                  <p className="truncate text-sm text-ink-3">{section.sub}</p>
                </div>
              </div>
              <Suspense fallback={LOADING}>{content(section.id)}</Suspense>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
