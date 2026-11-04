import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authService, claimLocalCache, clearLocalCaches, type AuthUser, type LoginResult, type SecurityInfo, type SessionInfo } from '../../services/authService';
import { reconnectLive } from '../procure/live';
import { setLockedHandler, setSetup2faHandler, setUnauthorizedHandler } from '../../services/apiClient';

const KEEP_ALIVE_MS = 5 * 60 * 1000;
/** The warning "you will be signed out" appears this long before the automatic sign-out */
const WARN_BEFORE_MS = 60_000;
/** Used until the server tells us the admin's settings (same defaults as backend/src/services/settings.ts) */
const DEFAULT_SECURITY: SecurityInfo = { hasPin: false, totpEnabled: false, lockMinutes: 5, logoutMinutes: 30, avatarUrl: null, backupLeft: 0, twofa: { required: false, enforced: false, deadline: null }, trustDeviceDays: 0 };

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: Status;
  user: AuthUser | null;
  security: SecurityInfo;
  /** The screen is locked: only the PIN pad is shown */
  locked: boolean;
  /** Message shown on the login page (session expired, signed out for inactivity, …) */
  notice: string | null;
  serverUnreachable: boolean;
  login: (username: string, password: string) => Promise<LoginResult>;
  loginTotp: (ticket: string, code: string, remember?: boolean) => Promise<LoginResult & { expired?: boolean }>;
  logout: (notice?: string) => Promise<void>;
  /** Seconds left before the automatic sign-out for inactivity (null = not close to it) */
  idleSecondsLeft: number | null;
  /** "I am still here": postpones the sign-out and renews the session */
  stayActive: () => void;
  /** Lock now (needs a PIN) */
  lock: () => Promise<void>;
  unlock: (pin: string) => Promise<string | null>;
  /** Reload the PIN / authenticator state after changing it */
  setSecurity: (s: SecurityInfo) => void;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [security, setSecurity] = useState<SecurityInfo>(DEFAULT_SECURITY);
  const [locked, setLocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [serverUnreachable, setServerUnreachable] = useState(false);
  const [idleSecondsLeft, setIdleSecondsLeft] = useState<number | null>(null);
  const lastActivity = useRef(Date.now());
  const lastKeepAlive = useRef(Date.now());
  const lockedRef = useRef(false);
  lockedRef.current = locked;

  const begin = useCallback((s: SessionInfo) => {
    claimLocalCache(s.user.username);
    lastActivity.current = Date.now();
    lastKeepAlive.current = Date.now();
    setServerUnreachable(false);
    setNotice(null);
    setUser(s.user);
    setSecurity(s.security);
    setLocked(s.locked);
    setStatus('authenticated');
  }, []);

  const checkSession = useCallback(async () => {
    setStatus('loading');
    const current = await authService.me();
    if (current === undefined) {
      setServerUnreachable(true);
      setUser(null);
      setStatus('anonymous');
      return;
    }
    setServerUnreachable(false);
    if (current) begin(current);
    else {
      setUser(null);
      setStatus('anonymous');
    }
  }, [begin]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const endSession = useCallback((message: string | null) => {
    clearLocalCaches();
    setUser(null);
    setLocked(false);
    setSecurity(DEFAULT_SECURITY);
    setNotice(message);
    setStatus('anonymous');
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<LoginResult> => {
      const result = await authService.login(username, password);
      if (result.ok) begin(result);
      return result;
    },
    [begin]
  );

  const loginTotp = useCallback(
    async (ticket: string, code: string, remember = false) => {
      const result = await authService.loginTotp(ticket, code, remember);
      if (result.ok) begin(result);
      return result;
    },
    [begin]
  );

  const logout = useCallback(
    async (message?: string) => {
      await authService.logout();
      endSession(message ?? null);
    },
    [endSession]
  );

  const lock = useCallback(async () => {
    if (await authService.lock()) setLocked(true);
  }, []);

  const unlock = useCallback(
    async (pin: string): Promise<string | null> => {
      const r = await authService.unlock(pin);
      if (r.ok) {
        lastActivity.current = Date.now();
        setLocked(false);
        reconnectLive();
        return null;
      }
      if (r.ended) endSession(r.message);
      return r.message;
    },
    [endSession]
  );

  // A 401 does not always mean "you were idle": the server may have restarted (a deploy) or the session may have
  // been revoked, so only blame inactivity when the person really was idle for that long
  const sessionEndedNotice = useCallback(() => {
    const idleMs = Date.now() - lastActivity.current;
    return idleMs >= security.logoutMinutes * 60_000
      ? `หมดเวลาการใช้งาน (ไม่มีการใช้งานเกิน ${security.logoutMinutes} นาที) กรุณาเข้าสู่ระบบอีกครั้ง`
      : 'การเชื่อมต่อสิ้นสุดลง (ระบบอาจเพิ่งอัปเดตหรือรีสตาร์ท หรือบัญชีถูกใช้งานจากที่อื่น) กรุณาเข้าสู่ระบบอีกครั้ง';
  }, [security.logoutMinutes]);

  // Any API call answered with 401 means the session is gone (expired or signed out elsewhere);
  // a 423 means the screen was locked (here after a reload, or from another tab)
  useEffect(() => {
    setUnauthorizedHandler(() => endSession(sessionEndedNotice()));
    setLockedHandler(() => setLocked(true));
    // 428: the admin's 2FA policy now requires this person to set it up; reload the session so the setup screen shows
    setSetup2faHandler(() => void authService.me().then((s) => s && begin(s)));
    return () => {
      setUnauthorizedHandler(null);
      setLockedHandler(null);
      setSetup2faHandler(null);
    };
  }, [endSession, begin, sessionEndedNotice]);

  const stayActive = useCallback(() => {
    lastActivity.current = Date.now();
    lastKeepAlive.current = Date.now();
    setIdleSecondsLeft(null);
    void authService.me().then((s) => {
      if (s === null) endSession(sessionEndedNotice());
    });
  }, [endSession, sessionEndedNotice]);

  // Idle handling (patient data must not stay on an unattended screen):
  //  - with a PIN: lock the screen after `lockMinutes`, sign out after `logoutMinutes`
  //  - without a PIN: sign out after `logoutMinutes`
  // Both times are admin settings. The server enforces the same limits.
  useEffect(() => {
    if (status !== 'authenticated') return;
    const markActive = () => {
      // Touching the lock screen is not "working": it must not postpone the sign-out
      if (!lockedRef.current) lastActivity.current = Date.now();
    };
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, markActive, { passive: true }));

    const timer = window.setInterval(() => {
      const now = Date.now();
      const idle = now - lastActivity.current;
      const untilLogout = security.logoutMinutes * 60_000 - idle;
      // Warn before the automatic sign-out (not while the PIN screen is up: that screen is the warning)
      setIdleSecondsLeft(!lockedRef.current && untilLogout > 0 && untilLogout <= WARN_BEFORE_MS ? Math.ceil(untilLogout / 1000) : null);
      if (idle > security.logoutMinutes * 60_000) {
        void logout(`ออกจากระบบอัตโนมัติ เนื่องจากไม่มีการใช้งานเกิน ${security.logoutMinutes} นาที`);
        return;
      }
      if (!lockedRef.current && security.hasPin && idle > security.lockMinutes * 60_000) {
        void lock();
        return;
      }
      if (!lockedRef.current && lastActivity.current > lastKeepAlive.current && now - lastKeepAlive.current > Math.min(KEEP_ALIVE_MS, security.logoutMinutes * 30_000)) {
        lastKeepAlive.current = now;
        void authService.me().then((s) => {
          if (s === null) endSession(sessionEndedNotice());
        });
      }
    }, 1000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, markActive));
      window.clearInterval(timer);
    };
  }, [status, security, logout, lock, endSession, sessionEndedNotice]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, security, locked, notice, serverUnreachable, idleSecondsLeft, stayActive, login, loginTotp, logout, lock, unlock, setSecurity, retry: () => void checkSession() }),
    [status, user, security, locked, notice, serverUnreachable, idleSecondsLeft, stayActive, login, loginTotp, logout, lock, unlock, checkSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
