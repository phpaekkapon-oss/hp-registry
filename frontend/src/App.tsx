/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PrintLetterhead } from './components/PrintLetterhead';
import { setBrowserThemeColor } from './services/pwa';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { LoginPage } from './features/auth/LoginPage';
import { LogoutDialog } from './features/auth/LogoutDialog';
import { setExporter } from './features/procure/format';
import { LockScreen } from './features/auth/LockScreen';
import { IdleWarning } from './features/auth/IdleWarning';
import { TwofaBanner, TwofaSetupScreen } from './features/auth/TwofaGate';
import type { AuthUser } from './services/authService';
import React, { Suspense, lazy, useState, useEffect, useCallback, useRef } from 'react';
import { EnterpriseRole, NavSection, RBAC_MATRIX } from './services/enterpriseService';
import { GOVERNMENT_THEMES, ThemeColorConfig } from './services/themeService';
import { Sidebar } from './layouts/Sidebar';
import { Header } from './layouts/Header';
import { MobileBottomNav } from './layouts/MobileBottomNav';
import { Footer } from './layouts/Footer';
import { UpdateBanner } from './components/UpdateBanner';
import { ScrollToTop } from './components/ScrollToTop';
import { apiClient } from './services/apiClient';
import { DEFAULT_SIDEBAR_STYLE, readSidebarStyle, saveSidebarStyle, type SidebarStyle } from './services/sidebarStyle';
import { PrefetchCacheEntry, RadiusTokenPreset, SecurityScopeProvider, SyncEngineStatus } from './components/compound/EnterprisePrimitives';

import type { SettingsSectionId } from './features/settings/SettingsHub';
const SettingsHub = lazy(() => import('./features/settings/SettingsHub').then((m) => ({ default: m.SettingsHub })));

const HomeView = lazy(() => import('./features/home/HomeView').then((m) => ({ default: m.HomeView })));

const ProcurementView = lazy(() => import('./features/procure/ProcurementView').then((m) => ({ default: m.ProcurementView })));

const NAV_SECTIONS: NavSection[] = ['home', 'procure', 'overview', 'users', 'revenue', 'settings', 'usermgmt', 'audit'];

const getInitialNav = (): NavSection => {
  try {
    const params = new URLSearchParams(window.location.search);
    const navFromUrl = params.get('page') as NavSection;
    if (navFromUrl && NAV_SECTIONS.includes(navFromUrl)) return navFromUrl;

    const stored = localStorage.getItem('app_active_nav') as NavSection;
    if (stored && NAV_SECTIONS.includes(stored)) return stored;
  } catch {
    /* ignore */
  }
  return 'home';
};

const getInitialTab = (): { tab: string; nonce: number } | null => {
  try {
    const params = new URLSearchParams(window.location.search);
    const tabFromUrl = params.get('tab');
    if (tabFromUrl) return { tab: tabFromUrl, nonce: Date.now() };

    const stored = localStorage.getItem('app_procure_tab');
    if (stored) return { tab: stored, nonce: Date.now() };
  } catch {
    /* ignore */
  }
  return null;
};

function AppShell({ user, onLogout }: { user: AuthUser; onLogout: () => Promise<void> }) {
  // Exports carry who made them (name · position), like the printed reports
  useEffect(() => {
    setExporter(user.position ? `${user.displayName} · ${user.position}` : user.displayName);
    return () => setExporter('');
  }, [user.displayName, user.position]);

  const [activeNav, setActiveNavState] = useState<NavSection>(getInitialNav);
  /** A notification or menu asked to open a register: the page switches and the register's tab is selected */
  const [openTab, setOpenTab] = useState<{ tab: string; nonce: number } | null>(getInitialTab);
  // Open the settings page straight at one section (e.g. the bell → notification centre)
  const [settingsRequest, setSettingsRequest] = useState<{ section: SettingsSectionId; nonce: number } | null>(null);

  const setActiveNav = useCallback((nav: NavSection) => {
    setActiveNavState(nav);
    try {
      localStorage.setItem('app_active_nav', nav);
      const url = new URL(window.location.href);
      url.searchParams.set('page', nav);
      if (nav !== 'procure') {
        url.searchParams.delete('tab');
      }
      window.history.replaceState({}, '', url.toString());
    } catch {
      /* ignore */
    }
  }, []);

  const handleOpenProcureTab = useCallback((tab: string) => {
    setActiveNav('procure');
    setOpenTab({ tab, nonce: Date.now() });
    try {
      localStorage.setItem('app_procure_tab', tab);
      const url = new URL(window.location.href);
      url.searchParams.set('page', 'procure');
      url.searchParams.set('tab', tab);
      window.history.replaceState({}, '', url.toString());
    } catch {
      /* ignore */
    }
  }, [setActiveNav]);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('page', activeNav);
      if (activeNav === 'procure' && openTab?.tab) {
        url.searchParams.set('tab', openTab.tab);
      }
      window.history.replaceState({}, '', url.toString());
    } catch {
      /* ignore */
    }
  }, []);
  const mainRef = useRef<HTMLElement>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Which pages the person has hovered / opened (the layouts use it to warm the next page)
  const [prefetchedMap, setPrefetchedMap] = useState<Record<NavSection, PrefetchCacheEntry>>(() =>
    Object.fromEntries(NAV_SECTIONS.map((s) => [s, { section: s, warmedAt: s === 'home' ? 'Initial' : 'Ready', hits: s === 'home' ? 1 : 0 }])) as Record<NavSection, PrefetchCacheEntry>
  );

  const handlePrefetchNav = useCallback((section: NavSection) => {
    setPrefetchedMap((prev) => {
      const existing = prev[section];
      if (existing && existing.hits > 0) return prev;
      const nowTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return { ...prev, [section]: { section, warmedAt: `${nowTime} น.`, hits: (existing?.hits || 0) + 1 } };
    });
  }, []);

  const prefetchedNavs = Object.fromEntries(NAV_SECTIONS.map((s) => [s, prefetchedMap[s].hits > 0])) as Record<NavSection, boolean>;

  // Online means: this machine has a network AND the API server answers (checked every 20 s)
  const [browserOnline, setBrowserOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [backendUp, setBackendUp] = useState<boolean>(true);
  const isOnline = browserOnline && backendUp;
  const syncStatus: SyncEngineStatus = isOnline ? 'synced' : 'offline-draft';

  useEffect(() => {
    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => setBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const ping = async () => {
      const health = await apiClient.checkHealth();
      if (alive) setBackendUp(health !== null);
    };
    void ping();
    const timer = setInterval(() => void ping(), 20_000);
    // Coming back to this tab or regaining the network re-checks at once
    const recheck = () => void ping();
    window.addEventListener('online', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('online', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, []);

  // 16-colour official theme & dark mode (kept in localStorage)
  const [activeTheme, setActiveTheme] = useState<ThemeColorConfig>(() => {
    try {
      const savedThemeId = localStorage.getItem('his_egov_theme_id');
      if (savedThemeId) {
        const found = GOVERNMENT_THEMES.find((t) => t.id === savedThemeId);
        if (found) return found;
      }
    } catch {
      // Ignore storage access errors in restricted environments
    }
    return GOVERNMENT_THEMES[0]; // Default: Vivid Blue (#3B82F6)
  });

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('his_egov_dark_mode') === 'true';
    } catch {
      return false;
    }
  });

  const [radiusToken, setRadiusToken] = useState<RadiusTokenPreset>(() => {
    try {
      const savedRadius = localStorage.getItem('his_egov_radius_token');
      if (savedRadius === '8px' || savedRadius === '12px' || savedRadius === '16px') return savedRadius;
    } catch {
      // Ignore storage access errors
    }
    return '12px';
  });

  // Look of the left menu bar (chosen in the palette menu)
  const [sidebarStyle, setSidebarStyle] = useState<SidebarStyle>(readSidebarStyle);
  useEffect(() => {
    document.documentElement.dataset.sidebarStyle = sidebarStyle;
    saveSidebarStyle(sidebarStyle);
  }, [sidebarStyle]);

  // Sync CSS variables, the dark class on <html>, and localStorage
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', activeTheme.hex);
    root.style.setProperty('--brand-primary-hover', activeTheme.hoverHex);
    root.style.setProperty('--token-radius-card', radiusToken);
    setBrowserThemeColor(isDarkMode ? '#0D1424' : '#FFFFFF');
    root.classList.toggle('dark', isDarkMode);

    try {
      localStorage.setItem('his_egov_theme_id', activeTheme.id);
      localStorage.setItem('his_egov_dark_mode', String(isDarkMode));
      localStorage.setItem('his_egov_radius_token', radiusToken);
    } catch {
      // Ignore storage write errors
    }
  }, [activeTheme, isDarkMode, radiusToken]);

  // The role comes from the server-side session; it cannot be changed from the UI
  const currentRole: EnterpriseRole = user.role;
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [printedAt, setPrintedAt] = useState(() => new Date());

  // Paper is always printed in the light palette (dark mode would print a black page),
  // and the letterhead gets the real print time.
  useEffect(() => {
    let wasDark = false;
    const before = () => {
      setPrintedAt(new Date());
      wasDark = document.documentElement.classList.contains('dark');
      document.documentElement.classList.remove('dark');
    };
    const after = () => {
      if (wasDark) document.documentElement.classList.add('dark');
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  // PDPA masking of personal data on screen and in print; roles without PII access are always masked
  const [isDataMasked, setIsDataMasked] = useState(true);
  const permissions = RBAC_MATRIX[currentRole];
  useEffect(() => {
    if (!RBAC_MATRIX[currentRole].canViewUnmaskedPII) setIsDataMasked(true);
  }, [currentRole]);

  const handleToggleDataMask = () => {
    if (!permissions.canViewUnmaskedPII) {
      setIsDataMasked(true);
      return;
    }
    setIsDataMasked((prev) => !prev);
  };

  return (
    <div className="font-sarabun flex h-[100dvh] w-full overflow-hidden bg-chroma-canvas text-ink transition-colors duration-200">
      {/* Left sidebar (desktop) & off-canvas drawer (mobile/tablet) */}
      <Sidebar
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        isMobileOpen={isMobileMenuOpen}
        setIsMobileOpen={setIsMobileMenuOpen}
        currentRole={currentRole}
        user={user}
        onRequestLogout={() => setIsLogoutOpen(true)}
        onPrefetchNav={handlePrefetchNav}
        prefetchedNavs={prefetchedNavs}
        onOpenTab={handleOpenProcureTab}
      />

      {/* Right workspace column */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TwofaBanner />
        <Header
          activeNav={activeNav}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
          onSelectSettings={() => setActiveNav('settings')}
          onOpenNotificationCenter={() => {
            setSettingsRequest({ section: 'notifications', nonce: Date.now() });
            setActiveNav('settings');
          }}
          onOpenTab={handleOpenProcureTab}
          currentRole={currentRole}
          user={user}
          onRequestLogout={() => setIsLogoutOpen(true)}
          isDataMasked={isDataMasked}
          onToggleDataMask={handleToggleDataMask}
          activeTheme={activeTheme}
          onSelectTheme={setActiveTheme}
          sidebarStyle={sidebarStyle}
          onSelectSidebarStyle={setSidebarStyle}
          onResetAppearance={() => {
            setActiveTheme(GOVERNMENT_THEMES[0]);
            setSidebarStyle(DEFAULT_SIDEBAR_STYLE);
          }}
          isDarkMode={isDarkMode}
          onToggleDarkMode={() => setIsDarkMode((prev) => !prev)}
          isOnline={isOnline}
          syncStatus={syncStatus}
        />

        {/* Scrollable main viewport */}
        <SecurityScopeProvider
          role={currentRole}
          isDataMasked={isDataMasked}
          onToggleGlobalMask={handleToggleDataMask}
          radiusToken={radiusToken}
          onChangeRadiusToken={setRadiusToken}
          prefetchedMap={prefetchedMap}
          onPrefetchNav={handlePrefetchNav}
          isOnline={isOnline}
          syncStatus={syncStatus}
          pendingOutboxCount={0}
        >
          <main ref={mainRef} className="flex-1 overflow-y-auto overscroll-y-contain">
            <PrintLetterhead user={user} activeNav={activeNav} isDataMasked={isDataMasked} printedAt={printedAt} />
            <div className="pb-24 lg:pb-20">
              <Suspense
                fallback={
                  <div className="p-6 text-sm font-medium text-ink-4" role="status">
                    กำลังโหลดข้อมูล...
                  </div>
                }
              >
                {activeNav === 'home' ? (
                  <HomeView
                    onOpen={handleOpenProcureTab}
                    onOpenSecurity={() => window.dispatchEvent(new CustomEvent('open-security', { detail: { tab: 'totp' } }))}
                  />
                ) : activeNav === 'procure' ? (
                  <div className="max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <ProcurementView currentRole={currentRole} menus={user.menus} username={user.username} requestedTab={openTab} />
                  </div>
                ) : (
                  <SettingsHub
                    user={user}
                    activeTheme={activeTheme}
                    onSelectTheme={setActiveTheme}
                    isDarkMode={isDarkMode}
                    onToggleDarkMode={() => setIsDarkMode((prev) => !prev)}
                    requested={settingsRequest}
                  />
                )}
              </Suspense>
            </div>
          </main>
          <Footer isOnline={isOnline} />
        </SecurityScopeProvider>
        <ScrollToTop containerRef={mainRef} />
        <UpdateBanner />
      </div>

      {/* Bottom navigation for phones (< lg) */}
      {!isMobileMenuOpen && (
        <MobileBottomNav
          activeNav={activeNav}
          setActiveNav={setActiveNav}
          onOpenSettingsDrawer={() => setIsMobileMenuOpen(true)}
          onPrefetchNav={handlePrefetchNav}
        />
      )}

      <LogoutDialog open={isLogoutOpen} onOpenChange={setIsLogoutOpen} onConfirm={onLogout} pendingCount={0} />
    </div>
  );
}

/** Shows the login page until the server confirms a session, then the application */
function AuthGate() {
  const { status, user, logout, locked, security } = useAuth();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-chroma-canvas text-ink-4" role="status">
        <span className="text-sm font-medium">กำลังตรวจสอบสถานะการเข้าสู่ระบบ...</span>
      </div>
    );
  }
  if (status === 'anonymous' || !user) return <LoginPage />;
  // The admin's policy asks for 2FA and the grace period is over: only the setup screen works
  if (security.twofa.enforced && !locked) return <TwofaSetupScreen />;
  return (
    <>
      {/* While locked nothing behind the PIN pad can be focused or read */}
      <div inert={locked || undefined}>
        <AppShell key={user.username} user={user} onLogout={() => logout()} />
      </div>
      {locked && <LockScreen user={user} />}
      <IdleWarning />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
