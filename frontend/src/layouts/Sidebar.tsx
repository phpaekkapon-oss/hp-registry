import React from 'react';
import { LogOut } from 'lucide-react';
import type { AuthUser } from '../services/authService';
import { UserAvatar } from '../features/auth/UserAvatar';
import { ROLE_LABELS } from '../services/enterpriseService';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
  Plus,
  Building2,
  Zap,
  ClipboardList,
  House,
  Inbox,
  ShoppingCart,
  FileSignature,
  ShieldCheck,
  ListChecks,
} from 'lucide-react';
import {
  NavSection,
  EnterpriseRole,
  RBAC_MATRIX,
  SHOW_DEMO_MODULES,
} from '../services/enterpriseService';

interface SidebarProps {
  activeNav: NavSection;
  setActiveNav: (nav: NavSection) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  onOpenNewUserModal?: () => void;
  currentRole: EnterpriseRole;
  user: AuthUser;
  onRequestLogout: () => void;
  totalCount?: number;
  onPrefetchNav?: (nav: NavSection) => void;
  prefetchedNavs?: Record<NavSection, boolean>;
  onOpenTab?: (tab: string) => void;
}

const ALL_NAV_ITEMS: {
  id: NavSection;
  group: 'main' | 'system';
  label: string;
  subLabel: string;
  icon: React.ElementType;
  showCount?: boolean;
}[] = [
  { id: 'home', group: 'main', label: 'หน้าแรก', subLabel: 'ภาพรวมงานพัสดุ', icon: House },
  { id: 'procure', group: 'main', label: 'งานพัสดุ', subLabel: 'ทะเบียนคุมใบสั่ง/สัญญา', icon: ClipboardList },
  { id: 'overview', group: 'main', label: 'ภาพรวมระบบ', subLabel: 'สถิติและตัวชี้วัดหลัก', icon: LayoutDashboard },
  { id: 'users', group: 'main', label: 'ทะเบียนผู้ป่วยและประชาชน', subLabel: 'ทะเบียนประวัติ (PDPA)', icon: Users, showCount: true },
  { id: 'revenue', group: 'main', label: 'งบประมาณและเบิกจ่าย', subLabel: 'รายงานการเบิกจ่ายงบประมาณ', icon: FileSpreadsheet },
  { id: 'settings', group: 'system', label: 'ตั้งค่าระบบ', subLabel: 'ผู้ใช้ ความปลอดภัย สำรองข้อมูล', icon: Settings },
];

const DEMO_NAV: NavSection[] = ['overview', 'users', 'revenue'];
const VISIBLE_NAV_ITEMS = ALL_NAV_ITEMS.filter((i) => SHOW_DEMO_MODULES || !DEMO_NAV.includes(i.id));

const PROCURE_MENUS = ['orders', 'contracts', 'incoming', 'guarantees', 'progress', 'summary'];
const canSee = (id: NavSection, menus: string[]) =>
  id === 'procure' ? PROCURE_MENUS.some((m) => menus.includes(m)) : true;

const PROCURE_SUB_ITEMS = [
  { id: 'incoming',  label: 'หนังสือรับ (ต้นเรื่อง)',       icon: Inbox },
  { id: 'orders',    label: 'ใบสั่งซื้อ/สั่งจ้าง (PO)',    icon: ShoppingCart },
  { id: 'contracts', label: 'ทะเบียนสัญญา (Contract)',      icon: FileSignature },
  { id: 'guarantees',label: 'หลักประกันสัญญา',              icon: ShieldCheck },
  { id: 'progress',  label: 'ความก้าวหน้า 17 ขั้นตอน',     icon: ListChecks },
  { id: 'summary',   label: 'รายงานสรุป (แบบ สขร. 1)',     icon: FileSpreadsheet },
];

const NavTooltip: React.FC<{ label: string; enabled: boolean; children: React.ReactNode }> = ({
  label, enabled, children,
}) => {
  if (!enabled) return <>{children}</>;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <div className="w-full">{children}</div>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={12}
          className="z-[70] rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg ring-1 ring-white/10"
        >
          {label}
          <Tooltip.Arrow className="fill-slate-900" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeNav,
  setActiveNav,
  isCollapsed,
  setIsCollapsed,
  isMobileOpen,
  setIsMobileOpen,
  onOpenNewUserModal,
  currentRole,
  user,
  onRequestLogout,
  totalCount = 0,
  onPrefetchNav,
  prefetchedNavs,
  onOpenTab,
}) => {
  const permissions = RBAC_MATRIX[currentRole];
  const NAV_ITEMS = VISIBLE_NAV_ITEMS.filter((i) => canSee(i.id, user.menus));
  const showLabels = !isCollapsed || isMobileOpen;

  const handleSelectNav = (id: NavSection) => {
    setActiveNav(id);
    setIsMobileOpen(false);
  };

  return (
    <Tooltip.Provider delayDuration={80} skipDelayDuration={300}>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="gpu-accelerated fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm transition-opacity lg:hidden"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="เมนูนำทางหลัก"
        className={[
          'app-sidebar gpu-accelerated ios-spring-120hz fixed inset-y-0 left-0 z-50 flex flex-col',
          'lg:static lg:translate-x-0',
          isMobileOpen ? 'translate-x-0 w-80 shadow-2xl' : '-translate-x-full',
          isCollapsed ? 'lg:w-20' : 'lg:w-[19rem]',
          'shrink-0',
        ].join(' ')}
      >
        {/* ── Brand Header ─────────────────────────────── */}
        <div className="sb-hairline flex items-center h-16 px-4 border-b shrink-0">
          {/* Logo mark */}
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
            style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 62%, #ffffff) 0%, var(--brand-primary) 100%)' }}
          >
            <Building2 className="w-[18px] h-[18px] text-white" />
          </div>

          {showLabels && (
            <div className="ml-3 min-w-0 flex-1">
              <p className="text-[16px] font-bold leading-tight tracking-tight truncate">
                โรงพยาบาลพังโคน
              </p>
              <p
                className="sb-brand-sub text-[12px] leading-tight mt-0.5 truncate"
                title="ระบบงานพัสดุ"
              >
                ระบบงานพัสดุ
              </p>
            </div>
          )}

          {/* Mobile close */}
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            className="sb-quiet-btn lg:hidden ml-auto w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0"
            aria-label="ปิดเมนู"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Register button (demo modules only) ─────── */}
        <div className={SHOW_DEMO_MODULES ? 'px-3 pt-3' : 'hidden'}>
          <NavTooltip
            label={permissions.canCreateRecord ? 'ลงทะเบียนใหม่' : 'จำกัดสิทธิ์'}
            enabled={!showLabels}
          >
            <button
              type="button"
              disabled={!permissions.canCreateRecord}
              onClick={() => {
                if (!permissions.canCreateRecord) return;
                setIsMobileOpen(false);
                onOpenNewUserModal?.();
              }}
              className={[
                'instant-press w-full min-h-[44px] rounded-xl text-sm font-semibold flex items-center justify-center gap-2 px-3 py-2.5 transition-all cursor-pointer whitespace-nowrap',
                permissions.canCreateRecord
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md hover:shadow-lg hover:brightness-110'
                  : 'bg-white/[0.04] text-slate-500 cursor-not-allowed',
              ].join(' ')}
            >
              <Plus className="w-4 h-4 shrink-0" />
              {showLabels && (
                <span>{permissions.canCreateRecord ? 'ลงทะเบียนประวัติใหม่' : 'จำกัดสิทธิ์'}</span>
              )}
            </button>
          </NavTooltip>
        </div>

        {/* ── Navigation ──────────────────────────────── */}
        <nav className="flex-1 px-2 py-2 overflow-y-auto overflow-x-hidden space-y-0.5 scrollbar-thin">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            const isProcureExpanded = item.id === 'procure' && showLabels;

            return (
              <React.Fragment key={item.id}>

                <NavTooltip label={item.label} enabled={!showLabels}>
                  <button
                    type="button"
                    aria-label={item.label}
                    onMouseEnter={() => onPrefetchNav?.(item.id)}
                    onFocus={() => onPrefetchNav?.(item.id)}
                    onTouchStart={() => onPrefetchNav?.(item.id)}
                    onClick={() => handleSelectNav(item.id)}
                    className={`instant-press group relative w-full min-h-[50px] flex items-center px-3 py-3 rounded-xl text-left transition-all cursor-pointer sb-nav-btn${isActive ? ' is-active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {/* Icon */}
                    <Icon
                      className="w-[22px] h-[22px] shrink-0 ml-1"
                      strokeWidth={isActive ? 2.3 : 1.8}
                      aria-hidden
                    />

                    {/* Label */}
                    {showLabels && (
                      <span className="sb-title ml-3 text-[14.5px] flex-1 truncate leading-snug">
                        {item.label}
                      </span>
                    )}

                    {/* Count badge (expanded) */}
                    {showLabels && item.showCount && (
                      <span className="sb-badge ml-2 shrink-0 min-w-[26px] h-5 px-1.5 rounded-md text-[11px] font-bold font-mono inline-flex items-center justify-center">
                        {totalCount > 999 ? '999+' : totalCount.toLocaleString('en-US')}
                      </span>
                    )}
                    {/* Count badge (collapsed) */}
                    {!showLabels && item.showCount && (
                      <span className="sb-badge absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-0.5 rounded-full text-[9px] font-bold inline-flex items-center justify-center">
                        {totalCount > 99 ? '99+' : totalCount}
                      </span>
                    )}
                  </button>
                </NavTooltip>

                {/* Procurement sub-menu: flat monochrome list on a thin tree line */}
                {isProcureExpanded && (
                  <div className="sb-tree ml-6 mt-0.5 mb-1.5 pl-3 space-y-px">
                    {PROCURE_SUB_ITEMS.map((sub) => {
                      const SubIcon = sub.icon;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            onOpenTab?.(sub.id);
                            setActiveNav('procure');
                            setIsMobileOpen(false);
                          }}
                          className="sb-sublink group flex min-h-[36px] w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left cursor-pointer"
                        >
                          <SubIcon className="w-[17px] h-[17px] shrink-0" strokeWidth={1.8} aria-hidden />
                          <span className="text-[13px] font-medium truncate">
                            {sub.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </nav>

        {/* ── User Profile Card ────────────────────── */}
        <div className="sb-hairline px-2 pb-2 pt-2 border-t shrink-0">
          <NavTooltip
            label={`${user.displayName} · ${user.position || ROLE_LABELS[currentRole]}`}
            enabled={!showLabels}
          >
            <div className="sb-card sb-hoverable flex items-center gap-3 rounded-xl px-3 py-3 transition-colors">
              <UserAvatar name={user.displayName} className="h-10 w-10 rounded-xl text-sm shrink-0" />
              {showLabels && (
                <>
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="text-[14px] font-bold truncate" title={user.displayName}>
                      {user.displayName}
                    </p>
                    <p
                      className="sb-brand-sub text-[12px] truncate mt-0.5"
                      title={user.position || ROLE_LABELS[currentRole]}
                    >
                      {user.position || ROLE_LABELS[currentRole]}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onRequestLogout}
                    aria-label="ออกจากระบบ"
                    title="ออกจากระบบ"
                    className="sb-logout-btn w-9 h-9 shrink-0 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </NavTooltip>

          {/* Collapsed logout button */}
          {!showLabels && (
            <NavTooltip label="ออกจากระบบ" enabled>
              <button
                type="button"
                onClick={onRequestLogout}
                aria-label="ออกจากระบบ"
                className="sb-logout-btn mt-1.5 w-full min-h-[40px] rounded-xl flex items-center justify-center transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </NavTooltip>
          )}

          {/* ── DB Status ──────────────────────── */}
          {showLabels && (
            <div
              className="mt-1 flex items-center gap-1.5 px-2 py-1"
              title={import.meta.env.DEV ? 'prefetch active' : undefined}
            >
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <span className="sb-quiet min-w-0 truncate font-mono text-[10px] tracking-wide">dw_hp_procure</span>
              {import.meta.env.DEV && <Zap className="sb-warn w-2.5 h-2.5 shrink-0" aria-label="prefetch active" />}
              <span className="sb-ok ml-auto text-[10px] font-medium">ออนไลน์</span>
            </div>
          )}
        </div>

        {/* ── Collapse Toggle ───────────────────────── */}
        <div className="sb-hairline hidden lg:flex shrink-0 h-14 items-center border-t">
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="sb-quiet-btn w-full h-full flex items-center justify-center gap-2 px-3 text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap"
            aria-label={isCollapsed ? 'ขยายแถบเมนู' : 'ย่อแถบเมนู'}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                <span>ย่อแถบเมนู</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </Tooltip.Provider>
  );
};
