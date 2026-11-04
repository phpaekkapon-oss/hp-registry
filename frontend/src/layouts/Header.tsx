import { useLiveStatus } from '../features/procure/live';
import { useNotifications, timeAgo } from '../features/audit/useNotifications';
import React, { useEffect, useRef, useState } from 'react';
import { InstallHelpDialog } from '../components/InstallHelpDialog';
import { VersionBadge } from '../components/VersionBadge';
import { SecurityDialog } from '../features/auth/SecurityDialog';
import { useAuth } from '../features/auth/AuthContext';
import { useInstallApp } from '../services/pwa';
import type { AuthUser } from '../services/authService';
import { UserAvatar } from '../features/auth/UserAvatar';
import { AvatarButton, AvatarEditorDialog } from '../features/auth/AvatarSection';
import { ROLE_LABELS, SHOW_DEMO_MODULES } from '../services/enterpriseService';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  Menu,
  Search,
  Shield,
  ShieldCheck,
  LockKeyhole,
  ShieldAlert,
  Sun,
  Moon,
  Palette,
  ChevronDown,
  X,
  Check,
  UserCheck,
  Wifi,
  WifiOff,
  RefreshCw,
  Maximize,
  Minimize,
  Bell,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Download,
  RotateCcw,
  PanelLeft,
} from 'lucide-react';
import {
  NavSection,
  EnterpriseRole,
  RBAC_MATRIX,
} from '../services/enterpriseService';
import { GOVERNMENT_THEMES, ThemeColorConfig } from '../services/themeService';
import { DEFAULT_SIDEBAR_STYLE, SIDEBAR_STYLES, sidebarPreviewBackground, type SidebarStyle } from '../services/sidebarStyle';
import { SyncEngineStatus } from '../components/compound/EnterprisePrimitives';

interface HeaderProps {
  activeNav: NavSection;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  onOpenMobileMenu: () => void;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  systemHealthy?: boolean;
  onToggleSystemHealth?: () => void;
  onSelectSettings: () => void;
  currentRole: EnterpriseRole;
  user: AuthUser;
  onRequestLogout: () => void;
  isDataMasked: boolean;
  onToggleDataMask: () => void;
  activeTheme: ThemeColorConfig;
  onSelectTheme: (theme: ThemeColorConfig) => void;
  sidebarStyle?: SidebarStyle;
  onSelectSidebarStyle?: (style: SidebarStyle) => void;
  /** Back to the default colour and menu look */
  onResetAppearance?: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  isOnline?: boolean;
  syncStatus?: SyncEngineStatus;
  pendingOutboxCount?: number;
  onToggleOfflineMode?: () => void;
  /** Open a procurement register (from a notification) */
  onOpenTab?: (tab: string) => void;
  /** Settings → notification centre (full history and preferences) */
  onOpenNotificationCenter?: () => void;
}

const SECTION_TITLES: Record<NavSection, { full: string; mobile: string }> = {
  home: {
    full: 'หน้าแรก',
    mobile: 'หน้าแรก',
  },
  procure: {
    full: 'งานพัสดุ: ทะเบียนคุมใบสั่ง/สัญญา',
    mobile: 'งานพัสดุ',
  },
  overview: {
    full: 'ภาพรวมระบบ',
    mobile: 'ภาพรวมระบบ',
  },
  users: {
    full: 'ทะเบียนผู้ป่วยและประชาชน',
    mobile: 'ทะเบียนประวัติ',
  },
  revenue: {
    full: 'งบประมาณและเบิกจ่าย',
    mobile: 'งบประมาณและเบิกจ่าย',
  },
  usermgmt: {
    full: 'จัดการผู้ใช้งานและสิทธิ์',
    mobile: 'จัดการผู้ใช้',
  },
  audit: {
    full: 'ประวัติการใช้งานระบบ',
    mobile: 'ประวัติการใช้งาน',
  },
  settings: {
    full: 'ตั้งค่าระบบ',
    mobile: 'ตั้งค่า',
  },
};

export const Header: React.FC<HeaderProps> = ({
  activeNav,
  searchQuery = '',
  setSearchQuery = () => {},
  onOpenMobileMenu,
  isSidebarCollapsed,
  onToggleSidebar,
  currentRole,
  user,
  onRequestLogout,
  isDataMasked,
  onToggleDataMask,
  activeTheme,
  onSelectTheme,
  sidebarStyle = DEFAULT_SIDEBAR_STYLE,
  onSelectSidebarStyle,
  onResetAppearance,
  isDarkMode,
  onToggleDarkMode,
  onSelectSettings,
  isOnline = true,
  syncStatus = 'synced',
  pendingOutboxCount = 0,
  onToggleOfflineMode,
  onOpenTab,
  onOpenNotificationCenter,
}) => {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const installApp = useInstallApp();
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [securityTab, setSecurityTab] = useState<'profile' | 'totp' | 'pin'>('profile');
  // Other parts of the app (the 2FA reminder) can ask for this window
  useEffect(() => {
    const open = (e: Event) => {
      setSecurityTab(((e as CustomEvent).detail?.tab as 'profile' | 'totp' | 'pin') ?? 'profile');
      setSecurityOpen(true);
    };
    window.addEventListener('open-security', open);
    return () => window.removeEventListener('open-security', open);
  }, []);
  const { security, lock } = useAuth();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarToast, setAvatarToast] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  useEffect(() => {
    if (!avatarToast) return;
    const timer = setTimeout(() => setAvatarToast(null), 5000);
    return () => clearTimeout(timer);
  }, [avatarToast]);
  const searchRef = useRef<HTMLInputElement>(null);

  // Ctrl/Cmd + K focuses the global search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        onToggleSidebar();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onToggleSidebar]);

  // The real connection: this machine's network, the API server, and the live-update stream
  const liveStatus = useLiveStatus();
  const connection = !isOnline
    ? { tone: 'off' as const, label: 'ออฟไลน์ · บันทึกข้อมูลไม่ได้', hint: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ข้อมูลที่แก้ไขจะไม่ถูกบันทึกจนกว่าจะกลับมาออนไลน์' }
    : liveStatus === 'live'
    ? { tone: 'live' as const, label: 'ออนไลน์ · ข้อมูลสด', hint: 'ข้อมูลอัปเดตอัตโนมัติทันทีเมื่อมีคนแก้ไข' }
    : liveStatus === 'offline'
    ? { tone: 'warn' as const, label: 'ออนไลน์ · อัปเดตสดขาดช่วง', hint: 'ระบบกำลังเชื่อมต่อใหม่ และโหลดข้อมูลซ้ำทุก 45 วินาที' }
    : { tone: 'on' as const, label: 'ออนไลน์', hint: 'เชื่อมต่อเซิร์ฟเวอร์ปกติ' };

  const notifications = [
    !isOnline && { tone: 'warn', text: 'ออฟไลน์: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ การแก้ไขจะไม่ถูกบันทึกจนกว่าจะกลับมาออนไลน์ ตรวจสอบเครือข่ายแล้วลองใหม่' },
    isOnline && liveStatus === 'offline' && { tone: 'warn', text: 'การเชื่อมต่อแบบสดขาดช่วง ระบบกำลังเชื่อมต่อใหม่และโหลดข้อมูลซ้ำทุก 45 วินาที' },
    SHOW_DEMO_MODULES && isDataMasked && { tone: 'ok', text: 'PDPA: ซ่อนข้อมูลส่วนบุคคลอัตโนมัติ' },
    isOnline && liveStatus === 'live' && { tone: 'ok', text: 'ข้อมูลอัปเดตสดอัตโนมัติ' },
    isOnline && liveStatus !== 'live' && liveStatus !== 'offline' && { tone: 'ok', text: 'เชื่อมต่อเซิร์ฟเวอร์ปกติ' },
  ].filter(Boolean) as { tone: string; text: string }[];
  const { data: bell, markRead } = useNotifications();
  const [bellOpen, setBellOpen] = useState(false);
  const connectionWarnings = notifications.filter((n) => n.tone === 'warn');
  // Only what is NEW counts: unread changes and alerts not seen yet. Known alerts stay listed but do not keep the badge on.
  const hasNew = (bell?.unread ?? 0) + (bell?.newAlerts ?? 0) > 0;
  const alertCount = connectionWarnings.length + (bell?.newAlerts ?? 0) + (bell?.unread ?? 0);

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const handleToggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen?.().catch(() => {});
    }
  };
  const permissions = RBAC_MATRIX[currentRole];

  return (
    <header className="app-header pt-safe px-safe bg-white/85 dark:bg-slate-900/85 border-b border-slate-200 dark:border-[var(--token-border-subtle)] shrink-0">
      <div className="flex items-center justify-between gap-2 sm:gap-4 px-4 sm:px-6 h-16">
        {/* Zone 1: Mobile Menu Trigger + Official Department Title */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="flex lg:hidden items-center justify-center min-w-[48px] min-h-[48px] -ml-2 rounded-lg text-ink-4 hover:bg-slate-100 dark:hover:bg-[var(--token-surface-elevated)] transition-colors cursor-pointer shrink-0"
            aria-label="เปิดเมนูนำทาง"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Desktop: collapse / expand the sidebar */}
          <Tooltip.Provider delayDuration={150}>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  onClick={onToggleSidebar}
                  aria-label={isSidebarCollapsed ? 'ขยายแถบเมนู' : 'ย่อแถบเมนู'}
                  aria-pressed={isSidebarCollapsed}
                  className="hidden lg:inline-flex items-center justify-center w-10 h-10 -ml-1 rounded-lg text-ink-4 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[var(--token-surface-elevated)] transition-colors cursor-pointer shrink-0"
                >
                  {isSidebarCollapsed ? (
                    <PanelLeftOpen className="w-5 h-5" />
                  ) : (
                    <PanelLeftClose className="w-5 h-5" />
                  )}
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="bottom"
                  sideOffset={8}
                  className="z-[70] rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg ring-1 ring-white/10"
                >
                  {isSidebarCollapsed ? 'ขยายแถบเมนู' : 'ย่อแถบเมนู'}
                  <kbd className="ml-2 px-1.5 py-0.5 rounded bg-white/15 text-xs font-semibold">Ctrl B</kbd>
                  <Tooltip.Arrow className="fill-slate-900 dark:fill-slate-700" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
          <span className="hidden lg:block w-px h-6 bg-slate-200 dark:bg-[var(--token-border-subtle)] mr-1" aria-hidden="true" />

          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="hidden xl:inline text-ink-3 whitespace-nowrap text-sm font-medium">
              กระทรวงสาธารณสุข
            </span>
            <span className="hidden xl:inline text-slate-300 dark:text-slate-700" aria-hidden="true">
              /
            </span>
            <h1 className="font-prompt font-bold text-ink text-base line-clamp-1">
              <span className="sm:hidden">{SECTION_TITLES[activeNav].mobile}</span>
              <span className="hidden sm:inline">{SECTION_TITLES[activeNav].full}</span>
            </h1>
          </div>
        </div>

        {/* Zone 2: Clean Flat Search Bar */}
        <div className="hidden sm:block flex-1 max-w-md mx-2">
          <div className={`relative flex items-center ${SHOW_DEMO_MODULES ? '' : 'hidden'}`}>
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              ref={searchRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาเลขบัตรประชาชน, HN, ชื่อ-สกุล, แผนก..."
              aria-label="ค้นหาเลขบัตรประชาชน, HN, ชื่อ-สกุล, แผนก"
              className="w-full min-h-[44px] pl-10 pr-10 lg:pr-20 py-2 text-xs text-ellipsis bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-[var(--token-border-subtle)] rounded-lg text-ink placeholder:text-slate-400 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-slate-400 transition-colors"
            />
            {!searchQuery && (
              <kbd className="hidden lg:inline-flex absolute right-3 items-center gap-0.5 px-1.5 py-0.5 rounded border border-slate-200 dark:border-[var(--token-border-subtle)] text-xs font-semibold text-ink-5 pointer-events-none">
                Ctrl K
              </kbd>
            )}
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="ล้างคำค้นหา"
                className="absolute right-0 flex items-center justify-center min-w-[44px] min-h-[44px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Zone 3: Offline-First Sync Engine + PDPA Masking + 16-Color Theme Picker + Dark Mode + RBAC Role Menu */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Mobile Search Toggle Button (48x48px) */}
          <button
            type="button"
            onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
            aria-label="เปิดหรือปิดช่องค้นหา"
            className={`${SHOW_DEMO_MODULES ? 'flex sm:hidden' : 'hidden'} items-center justify-center min-w-[48px] min-h-[48px] rounded-lg text-ink-4 hover:bg-slate-100 dark:hover:bg-[var(--token-surface-elevated)] transition-colors cursor-pointer`}
          >
            {mobileSearchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
          </button>

          <div className="hidden sm:flex items-center">
            <VersionBadge announce />
          </div>

          {/* Real connection status (not a button: nothing to simulate) */}
          <div
            role="status"
            title={connection.hint}
            className={`min-h-[48px] hidden sm:inline-flex px-2.5 sm:px-3 py-2 rounded-lg border text-xs font-semibold items-center gap-1.5 whitespace-nowrap ${
              connection.tone === 'off'
                ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                : connection.tone === 'warn'
                ? 'bg-sky-50 dark:bg-sky-950/50 border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300'
                : 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-800/70 text-emerald-800 dark:text-emerald-300'
            }`}
          >
            {connection.tone === 'off' ? (
              <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden />
            ) : connection.tone === 'live' ? (
              <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
            ) : (
              <Wifi className="w-4 h-4 shrink-0" aria-hidden />
            )}
            <span className="hidden 2xl:inline">{connection.label}</span>
          </div>

          {/* PDPA Data Masking Quick Button (Desktop/Tablet) */}
          <button
            type="button"
            disabled={!permissions.canViewUnmaskedPII}
            onClick={onToggleDataMask}
            title={
              permissions.canViewUnmaskedPII
                ? 'เปิด/ปิด การซ่อนข้อมูลส่วนบุคคล (PDPA Masking)'
                : 'เจ้าหน้าที่ทั่วไป (Staff) บังคับซ่อนข้อมูล PDPA เสมอ'
            }
            className={`${SHOW_DEMO_MODULES ? 'hidden md:inline-flex' : 'hidden'} items-center justify-center gap-1.5 min-h-[48px] min-w-[48px] px-3 py-2 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap ${
              !permissions.canViewUnmaskedPII
                ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-[var(--token-border-subtle)] text-slate-400 cursor-not-allowed'
                : isDataMasked
                ? 'bg-white dark:bg-[var(--token-surface-card)] border-slate-200 dark:border-[var(--token-border-subtle)] text-ink-3 hover:bg-slate-50 dark:hover:bg-[var(--token-surface-elevated)] cursor-pointer'
                : 'btn-brand border-transparent cursor-pointer'
            }`}
          >
            {isDataMasked ? (
              <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-white shrink-0" />
            )}
            <span className="hidden 2xl:inline">{isDataMasked ? 'PDPA: ซ่อนข้อมูล' : 'PDPA: แสดงข้อมูลจริง'}</span>
          </button>


          <span className="hidden md:block w-px h-7 bg-slate-200 dark:bg-[var(--token-border-subtle)] mx-0.5" aria-hidden="true" />

          {/* 16-Color Official Theme Picker Popover */}
          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                type="button"
                aria-label="เปลี่ยนสีธีมและรูปแบบแถบเมนู"
                title={`ธีม: ${activeTheme.thaiName} (คลิกเพื่อเปลี่ยนสีและรูปแบบแถบเมนู)`}
                className="min-w-[48px] min-h-[48px] rounded-lg border border-slate-200 dark:border-[var(--token-border-subtle)] bg-white dark:bg-[var(--token-surface-card)] hover:bg-slate-50 dark:hover:bg-[var(--token-surface-elevated)] hidden sm:inline-flex items-center justify-center transition-colors cursor-pointer"
              >
                <Palette className="w-5 h-5" style={{ color: activeTheme.hex }} aria-hidden="true" />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="end"
                sideOffset={8}
                className="z-50 w-[24rem] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200 dark:border-[var(--token-border-subtle)] bg-white dark:bg-[var(--token-surface-card)] p-4 shadow-xl"
              >
                <div className="flex items-center gap-2.5">
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-white/70 dark:ring-white/20" style={{ backgroundColor: activeTheme.hex }} aria-hidden="true" />
                  <p className="text-sm font-bold text-ink">เลือกสีธีม</p>
                  <button
                    type="button"
                    onClick={() => onResetAppearance?.()}
                    className="ml-auto inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/25 dark:text-slate-100 dark:hover:border-white/40 dark:hover:bg-white/10 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> ค่ามาตรฐาน
                  </button>
                </div>

                <div role="radiogroup" aria-label="เลือกสีธีม" className="mt-3 grid grid-cols-8 gap-2">
                  {GOVERNMENT_THEMES.map((theme) => {
                    const isSelected = activeTheme.id === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        aria-label={theme.thaiName}
                        onClick={() => onSelectTheme(theme)}
                        title={`${theme.thaiName} (${theme.name})`}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-white transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 cursor-pointer"
                        style={{
                          backgroundColor: theme.hex,
                          boxShadow: isSelected ? `0 0 0 2px var(--token-surface-card, #fff), 0 0 0 4px ${theme.hex}` : undefined,
                        }}
                      >
                        {isSelected && <Check className="w-4 h-4" strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 flex items-center gap-2 text-sm font-bold text-ink">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: activeTheme.hex }} aria-hidden="true" />
                  {activeTheme.thaiName}
                  <span className="text-xs font-normal text-ink-5">สีปัจจุบัน</span>
                </p>

                <div className="mt-3 border-t border-slate-100 pt-3 dark:border-white/10">
                  <p className="flex items-center gap-2 text-sm font-bold text-ink">
                    <PanelLeft className="w-4 h-4" aria-hidden="true" /> สไตล์แถบเมนูด้านข้าง
                  </p>
                  <div role="radiogroup" aria-label="สไตล์แถบเมนูด้านข้าง" className="mt-2.5 grid grid-cols-5 gap-2">
                    {SIDEBAR_STYLES.map((st) => {
                      const on = sidebarStyle === st.id;
                      const slab = sidebarPreviewBackground(st.id, activeTheme.hex, isDarkMode);
                      return (
                        <button
                          key={st.id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => onSelectSidebarStyle?.(st.id)}
                          title={st.hint}
                          className={`flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                            on ? 'text-ink' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:border-white/25 dark:hover:bg-white/[0.08]'
                          }`}
                          style={on ? { borderColor: activeTheme.hex, backgroundColor: `color-mix(in srgb, ${activeTheme.hex} 14%, transparent)`, boxShadow: `0 0 0 1px ${activeTheme.hex}` } : undefined}
                        >
                          <span className="flex h-7 w-12 overflow-hidden rounded-md border border-slate-300 bg-slate-200 dark:border-white/20 dark:bg-white/10" aria-hidden="true">
                            <span className="w-4 border-r border-black/10 dark:border-white/10" style={{ background: slab }} />
                            <span className="flex flex-1 flex-col justify-center gap-1 px-1.5">
                              <span className="h-0.5 w-full rounded-full bg-slate-400/70 dark:bg-white/25" />
                              <span className="h-0.5 w-2/3 rounded-full bg-slate-400/70 dark:bg-white/25" />
                            </span>
                          </span>
                          {st.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2.5 text-xs text-ink-4">
                    {SIDEBAR_STYLES.find((st) => st.id === sidebarStyle)?.hint}
                  </p>
                </div>
                <p className="mt-2.5 border-t border-slate-100 pt-2.5 text-xs text-ink-5 dark:border-white/10">มีผลกับทั้งระบบ · บันทึกอัตโนมัติบนเครื่องนี้</p>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          {/* Notifications */}
          <Popover.Root
            open={bellOpen}
            onOpenChange={(open) => {
              setBellOpen(open);
              // Closing the bell counts as having read what was in it
              if (!open && hasNew) void markRead();
            }}
          >
            <Popover.Trigger asChild>
              <button
                type="button"
                aria-label="การแจ้งเตือน"
                title="การแจ้งเตือน"
                className="relative min-w-[48px] min-h-[48px] rounded-lg border border-slate-200 dark:border-[var(--token-border-subtle)] bg-white dark:bg-[var(--token-surface-card)] hover:bg-slate-50 dark:hover:bg-[var(--token-surface-elevated)] inline-flex items-center justify-center text-ink-3 transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {alertCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-xs font-bold inline-flex items-center justify-center ring-2 ring-white dark:ring-[var(--token-surface-card)]">
                    {alertCount > 9 ? '9+' : alertCount}
                  </span>
                )}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="end"
                sideOffset={8}
                className="z-50 w-80 rounded-xl border border-slate-200 dark:border-[var(--token-border-subtle)] bg-white dark:bg-[var(--token-surface-card)] p-3 shadow-lg"
              >
                <div className="flex items-center justify-between gap-2 px-1 pb-2 mb-2 border-b border-slate-100 dark:border-[var(--token-border-subtle)]">
                  <p className="text-sm font-bold text-ink">การแจ้งเตือน</p>
                  {hasNew && (
                    <button type="button" onClick={() => void markRead()} className="text-xs font-semibold text-brand hover:underline cursor-pointer">
                      ทำเครื่องหมายว่าอ่านแล้ว
                    </button>
                  )}
                </div>

                <div className="max-h-[min(70dvh,28rem)] space-y-3 overflow-y-auto pr-0.5">
                  {connectionWarnings.length > 0 && (
                    <ul className="space-y-1.5">
                      {connectionWarnings.map((n) => (
                        <li key={n.text} className="flex items-start gap-2.5 rounded-lg bg-amber-50 px-2.5 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                          <span>{n.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {bell && bell.alerts.length > 0 && (
                    <div>
                      <p className="px-1 pb-1 text-xs font-bold uppercase tracking-wide text-ink-4">ต้องดำเนินการ</p>
                      <ul className="space-y-1">
                        {bell.alerts.map((al) => (
                          <li key={al.key}>
                            <button
                              type="button"
                              onClick={() => {
                                setBellOpen(false);
                                onOpenTab?.(al.tab);
                              }}
                              className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-slate-900 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800/60 cursor-pointer"
                            >
                              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${al.tone === 'bad' ? 'bg-rose-500' : 'bg-amber-500'}`} aria-hidden />
                              <span className={`min-w-0 flex-1 ${al.isNew ? 'font-semibold' : ''}`}>{al.text}</span>
                              {al.isNew && <span className="shrink-0 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-300">ใหม่</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <p className="px-1 pb-1 text-xs font-bold uppercase tracking-wide text-ink-4">ความเคลื่อนไหวล่าสุดจากผู้ใช้อื่น</p>
                    {!bell || bell.items.length === 0 ? (
                      <p className="px-2.5 py-2 text-sm text-ink-4">ยังไม่มีความเคลื่อนไหว</p>
                    ) : (
                      <ul className="space-y-1">
                        {bell.items.map((it) => (
                          <li key={it.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setBellOpen(false);
                                if (it.action !== 'delete') onOpenTab?.(it.resource === 'notes' ? 'summary' : it.resource);
                              }}
                              className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer ${it.unread ? 'bg-brand-soft/60' : ''}`}
                            >
                              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${it.unread ? 'bg-[var(--brand-strong,#1d4ed8)]' : 'bg-slate-300 dark:bg-slate-600'}`} aria-hidden />
                              <span className="min-w-0">
                                <span className={`block ${it.unread ? 'font-semibold' : ''} text-ink`}>{it.summary}</span>
                                <span className="block text-xs text-ink-4">
                                  {it.actorName} · {timeAgo(it.at)}
                                </span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {connectionWarnings.length === 0 && (
                    <p className="flex items-center gap-2 px-1 text-xs text-ink-4">
                      <span className={`h-2 w-2 rounded-full ${connection.tone === 'live' ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden />
                      {connection.label}
                    </p>
                  )}
                </div>
                {onOpenNotificationCenter && (
                  <button
                    type="button"
                    onClick={() => {
                      setBellOpen(false);
                      onOpenNotificationCenter();
                    }}
                    className="mt-2 flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg border-t border-slate-100 pt-2 text-sm font-semibold text-brand hover:bg-slate-50 dark:border-[var(--token-border-subtle)] dark:hover:bg-[var(--token-surface-elevated)] cursor-pointer"
                  >
                    ดูประวัติทั้งหมดและตั้งค่าการแจ้งเตือน
                  </button>
                )}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          {/* Fullscreen Toggle Button (48x48px) */}
          <button
            type="button"
            onClick={handleToggleFullscreen}
            aria-label={isFullscreen ? 'ออกจากโหมดเต็มจอ' : 'เปิดโหมดเต็มจอ'}
            title={isFullscreen ? 'ออกจากโหมดเต็มจอ (Esc)' : 'เปิดโหมดเต็มจอ'}
            className="hidden sm:inline-flex min-w-[48px] min-h-[48px] rounded-lg border border-slate-200 dark:border-[var(--token-border-subtle)] bg-white dark:bg-[var(--token-surface-card)] hover:bg-slate-50 dark:hover:bg-[var(--token-surface-elevated)] items-center justify-center text-ink-3 transition-colors cursor-pointer"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>

          {/* Dark / Light Mode Toggle Button (48x48px) */}
          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label={isDarkMode ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
            title={isDarkMode ? 'โหมดสว่าง' : 'โหมดมืด'}
            className="hidden sm:inline-flex min-w-[48px] min-h-[48px] rounded-lg border border-slate-200 dark:border-[var(--token-border-subtle)] bg-white dark:bg-[var(--token-surface-card)] hover:bg-slate-50 dark:hover:bg-[var(--token-surface-elevated)] items-center justify-center text-ink-3 transition-colors cursor-pointer"
          >
            {isDarkMode ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>

          <span className="hidden md:block w-px h-7 bg-slate-200 dark:bg-[var(--token-border-subtle)] mx-0.5" aria-hidden="true" />

          {/* Officer Profile & RBAC Role Switcher Dropdown */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="relative flex items-center justify-center sm:justify-start gap-2 min-h-[48px] min-w-[48px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[var(--token-border-subtle)] bg-white dark:bg-[var(--token-surface-card)] hover:bg-slate-50 dark:hover:bg-[var(--token-surface-elevated)] transition-colors cursor-pointer"
                aria-label="เมนูบัญชีผู้ใช้"
              >
                <UserAvatar name={user.displayName} className="h-8 w-8 rounded-md text-xs font-bold" />
                <div className="hidden sm:flex flex-col items-start text-left">
                  <span className="text-xs font-bold text-ink leading-snug whitespace-nowrap">
                    {user.displayName}
                  </span>
                  <span className="text-xs text-ink-5 leading-snug whitespace-nowrap">
                    {user.position || ROLE_LABELS[currentRole]}
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
                <span
                  className={`sm:hidden absolute top-1 right-1 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-[var(--token-surface-card)] ${
                    !isOnline ? 'bg-amber-500' : syncStatus === 'syncing' ? 'bg-sky-500' : 'bg-emerald-500'
                  }`}
                  aria-hidden="true"
                />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={8}
                className="z-50 min-w-[260px] rounded-xl border border-slate-200 dark:border-[var(--token-border-subtle)] bg-white dark:bg-[var(--token-surface-card)] p-2 text-ink shadow-lg"
              >
                <DropdownMenu.Label className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    {/* Selecting it closes the menu and opens the photo editor */}
                    <DropdownMenu.Item asChild onSelect={() => setAvatarOpen(true)}>
                      <AvatarButton name={user.displayName} className="h-14 w-14 rounded-xl text-lg" />
                    </DropdownMenu.Item>
                    <div className="min-w-0 leading-snug">
                      <p className="text-sm font-semibold truncate">{user.displayName}</p>
                      {user.position && <p className="text-xs font-semibold text-ink-2 truncate">{user.position}</p>}
                      <p className="text-xs text-ink-4 truncate">
                        {ROLE_LABELS[currentRole]} · @{user.username}
                      </p>
                      <p className="text-xs text-ink-4 truncate">{user.organization}</p>
                    </div>
                  </div>
                </DropdownMenu.Label>

                {/* What protects this account right now; tapping opens the profile & security window */}
                <DropdownMenu.Item
                  onSelect={() => setSecurityOpen(true)}
                  aria-label="เปิดโปรไฟล์และความปลอดภัย"
                  className="mx-1 mb-1 flex flex-wrap gap-1.5 rounded-lg px-2 py-1.5 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-[var(--token-surface-elevated)]"
                >
                  {[
                    { on: security.totpEnabled, label: `2FA: ${security.totpEnabled ? 'เปิดใช้งาน' : 'ยังไม่เปิด'}`, Icon: ShieldCheck },
                    { on: security.hasPin, label: `PIN: ${security.hasPin ? `เปิดใช้งาน · ${security.lockMinutes} น.` : 'ยังไม่ตั้ง'}`, Icon: LockKeyhole },
                  ].map(({ on, label, Icon }) => (
                    <span
                      key={label}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                        on
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25'
                          : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                      {label}
                    </span>
                  ))}
                </DropdownMenu.Item>

                <div className="sm:hidden">
                  <DropdownMenu.Separator className="my-1.5 h-px bg-slate-100 dark:bg-[var(--token-border-subtle)]" />
                  <p className="px-3 py-1.5 text-xs text-ink-4">
                    สถานะ:{' '}
                    <strong className="font-semibold text-ink">
                      {connection.label}
                    </strong>
                  </p>
                  <p className="px-3 pt-1.5 pb-1 text-xs font-semibold text-ink">
                    โทนสี: {activeTheme.thaiName}
                  </p>
                  <div role="radiogroup" aria-label="เลือกโทนสีหน่วยงาน" className="grid grid-cols-8 gap-1 px-2 pb-2">
                    {GOVERNMENT_THEMES.map((theme) => {
                      const isSelected = activeTheme.id === theme.id;
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          aria-label={theme.thaiName}
                          onClick={() => onSelectTheme(theme)}
                          className="min-h-[32px] flex items-center justify-center rounded-md cursor-pointer"
                        >
                          <span
                            className="w-6 h-6 rounded-full flex items-center justify-center text-white border border-black/10 dark:border-white/25"
                            style={{
                              backgroundColor: theme.hex,
                              boxShadow: isSelected ? `0 0 0 2px ${theme.hex}` : undefined,
                            }}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <DropdownMenu.Item
                    onSelect={onToggleDarkMode}
                    className="min-h-[48px] flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium rounded-lg outline-none hover:bg-slate-100 dark:hover:bg-[var(--token-surface-elevated)] cursor-pointer"
                  >
                    {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-500" />}
                    <span>{isDarkMode ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}</span>
                  </DropdownMenu.Item>
                </div>

                <DropdownMenu.Separator className="my-1.5 h-px bg-slate-100 dark:bg-[var(--token-border-subtle)]" />

                <DropdownMenu.Item
                  onSelect={onToggleDataMask}
                  className="min-h-[48px] flex items-center justify-between gap-2.5 px-3 py-1.5 text-xs font-medium rounded-lg outline-none hover:bg-slate-100 dark:hover:bg-[var(--token-surface-elevated)] cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-slate-500" />
                    <span>การซ่อนข้อมูลส่วนบุคคล (PDPA)</span>
                  </div>
                  <span className="font-mono-tabular text-xs font-bold text-brand">
                    {isDataMasked ? 'เปิด' : 'ปิด'}
                  </span>
                </DropdownMenu.Item>

                <DropdownMenu.Item
                  onSelect={onSelectSettings}
                  className="min-h-[48px] flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium rounded-lg outline-none hover:bg-slate-100 dark:hover:bg-[var(--token-surface-elevated)] cursor-pointer"
                >
                  <UserCheck className="w-4 h-4 text-slate-500" />
                  <span>ตั้งค่าระบบ</span>
                </DropdownMenu.Item>
                {installApp.canInstall ? (
                  <DropdownMenu.Item
                    onSelect={() => void installApp.install()}
                    className="min-h-[48px] flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium rounded-lg outline-none hover:bg-slate-100 dark:hover:bg-[var(--token-surface-elevated)] cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-slate-500" />
                    <span>ติดตั้งแอปบนอุปกรณ์นี้</span>
                  </DropdownMenu.Item>
                ) : (
                  !installApp.installed && (
                    <DropdownMenu.Item
                      onSelect={() => setInstallHelpOpen(true)}
                      className="min-h-[48px] flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium rounded-lg outline-none hover:bg-slate-100 dark:hover:bg-[var(--token-surface-elevated)] cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-slate-500" />
                      <span>วิธีติดตั้งเป็นแอป</span>
                    </DropdownMenu.Item>
                  )
                )}

                <DropdownMenu.Separator className="my-1.5 h-px bg-slate-100 dark:bg-[var(--token-border-subtle)]" />
                {security.hasPin && (
                  <DropdownMenu.Item
                    onSelect={() => void lock()}
                    className="min-h-[48px] flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium rounded-lg outline-none hover:bg-slate-100 dark:hover:bg-[var(--token-surface-elevated)] cursor-pointer"
                  >
                    <LockKeyhole className="w-4 h-4 text-amber-500" />
                    <span>ล็อกหน้าจอทันที</span>
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Item
                  onSelect={() => setSecurityOpen(true)}
                  className="min-h-[48px] flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium rounded-lg outline-none hover:bg-slate-100 dark:hover:bg-[var(--token-surface-elevated)] cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span>โปรไฟล์ &amp; ความปลอดภัย (รูป, 2FA, PIN)</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={onRequestLogout}
                  className="min-h-[48px] flex items-center gap-2.5 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400 rounded-lg outline-none hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>ออกจากระบบ</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      {/* Expandable Mobile Search Drawer Row */}
      {SHOW_DEMO_MODULES && mobileSearchOpen && (
        <div className="sm:hidden px-3 pb-3 border-t border-slate-100 dark:border-[var(--token-border-subtle)]">
          <div className="relative flex items-center mt-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              type="search"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาเลขบัตรประชาชน, HN, ชื่อ-สกุล..."
              className="w-full min-h-[48px] pl-10 pr-12 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-[var(--token-border-subtle)] rounded-lg text-ink"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="ล้างคำค้นหา"
                className="absolute right-0 flex items-center justify-center min-w-[48px] min-h-[48px] text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
      <AvatarEditorDialog open={avatarOpen} onOpenChange={setAvatarOpen} onDone={setAvatarToast} />
      {avatarToast && (
        <div role={avatarToast.kind === 'error' ? 'alert' : 'status'} className={`fixed bottom-20 left-1/2 z-[120] -translate-x-1/2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ring-1 lg:bottom-6 ${avatarToast.kind === 'ok' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-rose-50 text-rose-800 ring-rose-200'}`}>
          {avatarToast.text}
        </div>
      )}
      <InstallHelpDialog open={installHelpOpen} onOpenChange={setInstallHelpOpen} />
      <SecurityDialog open={securityOpen} onOpenChange={(o) => { setSecurityOpen(o); if (!o) setSecurityTab('profile'); }} tab={securityTab} />
    </header>
  );
};
