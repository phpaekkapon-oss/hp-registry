import React from 'react';
import {
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  Settings,
  Plus,
  ClipboardList,
  House,
} from 'lucide-react';
import { NavSection, SHOW_DEMO_MODULES } from '../services/enterpriseService';

interface MobileBottomNavProps {
  activeNav: NavSection;
  setActiveNav: (nav: NavSection) => void;
  onOpenSettingsDrawer: () => void;
  onOpenNewUserModal?: () => void;
  canCreateRecord?: boolean;
  onPrefetchNav?: (nav: NavSection) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeNav,
  setActiveNav,
  onOpenSettingsDrawer,
  onOpenNewUserModal,
  canCreateRecord = false,
  onPrefetchNav,
}) => {
  // Procurement-only build: just the procurement page and the settings drawer
  if (!SHOW_DEMO_MODULES) {
    const tabs = [
      { id: 'home' as const, label: 'หน้าแรก', icon: House, onClick: () => setActiveNav('home') },
      { id: 'procure' as const, label: 'งานพัสดุ', icon: ClipboardList, onClick: () => setActiveNav('procure') },
      { id: 'settings' as const, label: 'เมนู/ตั้งค่า', icon: Settings, onClick: onOpenSettingsDrawer },
    ];
    return (
      <nav
        aria-label="เมนูนำทางสำหรับมือถือ"
        className="gpu-accelerated font-prompt fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-white/95 dark:bg-[color-mix(in_srgb,var(--token-surface-chrome)_95%,transparent)] backdrop-blur-md border-t border-slate-200 dark:border-[var(--token-border-subtle)] pb-safe px-safe"
      >
        <div className="grid grid-cols-3 items-center h-16 max-w-lg mx-auto px-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={tab.onClick}
              onTouchStart={() => onPrefetchNav?.(tab.id)}
              className={`instant-press min-h-[48px] min-w-[48px] flex flex-col items-center justify-center rounded-lg transition-colors cursor-pointer ${
                activeNav === tab.id ? 'text-brand font-bold' : 'text-ink-5 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <tab.icon className="w-5 h-5 shrink-0" />
              <span className="text-xs tracking-tight mt-1 whitespace-nowrap">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav
      aria-label="เมนูนำทางสำหรับมือถือ"
      className="gpu-accelerated font-prompt fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-white/95 dark:bg-[color-mix(in_srgb,var(--token-surface-chrome)_95%,transparent)] backdrop-blur-md border-t border-slate-200 dark:border-[var(--token-border-subtle)] pb-safe px-safe"
    >
      <div className="grid grid-cols-5 items-center h-16 max-w-lg mx-auto px-1">
        {/* Tab 1: Overview */}
        <button
          type="button"
          onTouchStart={() => onPrefetchNav?.('overview')}
          onMouseEnter={() => onPrefetchNav?.('overview')}
          onFocus={() => onPrefetchNav?.('overview')}
          onClick={() => setActiveNav('overview')}
          className={`instant-press min-h-[48px] min-w-[48px] flex flex-col items-center justify-center rounded-lg transition-colors cursor-pointer ${
            activeNav === 'overview'
              ? 'text-brand font-bold'
              : 'text-ink-5 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <LayoutDashboard className="w-5 h-5 shrink-0" />
          <span className="text-xs tracking-tight mt-1 whitespace-nowrap">
            ภาพรวม
          </span>
        </button>

        {/* Tab 2: Patients & Citizens */}
        <button
          type="button"
          onTouchStart={() => onPrefetchNav?.('users')}
          onMouseEnter={() => onPrefetchNav?.('users')}
          onFocus={() => onPrefetchNav?.('users')}
          onClick={() => setActiveNav('users')}
          className={`instant-press min-h-[48px] min-w-[48px] flex flex-col items-center justify-center rounded-lg transition-colors cursor-pointer ${
            activeNav === 'users'
              ? 'text-brand font-bold'
              : 'text-ink-5 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Users className="w-5 h-5 shrink-0" />
          <span className="text-xs tracking-tight mt-1 whitespace-nowrap">
            ผู้ป่วย/ปชช.
          </span>
        </button>

        {/* Tab 3: Primary Action in Natural Thumb Zone */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            disabled={!canCreateRecord}
            onClick={() => {
              if (canCreateRecord) onOpenNewUserModal?.();
            }}
            aria-label="ลงทะเบียนประวัติใหม่"
            className={`instant-press min-w-[48px] min-h-[48px] px-3.5 rounded-xl flex flex-col items-center justify-center transition-transform ${
              canCreateRecord
                ? 'btn-brand active:scale-95 cursor-pointer shadow-xs'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Plus className="w-5 h-5 shrink-0" />
            <span className="text-xs font-semibold tracking-tight mt-0.5 whitespace-nowrap">
              {canCreateRecord ? 'เพิ่มประวัติ' : 'ล็อกสิทธิ์'}
            </span>
          </button>
        </div>

        {/* Tab 4: Budget & Reports */}
        <button
          type="button"
          onTouchStart={() => onPrefetchNav?.('revenue')}
          onMouseEnter={() => onPrefetchNav?.('revenue')}
          onFocus={() => onPrefetchNav?.('revenue')}
          onClick={() => setActiveNav('revenue')}
          className={`instant-press min-h-[48px] min-w-[48px] flex flex-col items-center justify-center rounded-lg transition-colors cursor-pointer ${
            activeNav === 'revenue'
              ? 'text-brand font-bold'
              : 'text-ink-5 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <FileSpreadsheet className="w-5 h-5 shrink-0" />
          <span className="text-xs tracking-tight mt-1 whitespace-nowrap">
            งบประมาณ
          </span>
        </button>

        {/* Tab 5: Settings & Theme Drawer */}
        <button
          type="button"
          onTouchStart={() => onPrefetchNav?.('settings')}
          onMouseEnter={() => onPrefetchNav?.('settings')}
          onFocus={() => onPrefetchNav?.('settings')}
          onClick={onOpenSettingsDrawer}
          className={`instant-press min-h-[48px] min-w-[48px] flex flex-col items-center justify-center rounded-lg transition-colors cursor-pointer ${
            activeNav === 'settings'
              ? 'text-brand font-bold'
              : 'text-ink-5 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Settings className="w-5 h-5 shrink-0" />
          <span className="text-xs tracking-tight mt-1 whitespace-nowrap">
            เมนู/ตั้งค่า
          </span>
        </button>
      </div>
    </nav>
  );
};

