import React, { useEffect, useRef, useState } from 'react';
import { InstallHelpDialog } from '../../components/InstallHelpDialog';
import {
  Building2,
  ShieldCheck,
  LockKeyhole,
  Timer,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Info,
  Sun,
  Moon,
  WifiOff,
  User,
  KeyRound,
  ArrowRight,
  Download,
  Share,
  Smartphone,
  IdCard,
  BadgeCheck,
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { GOVERNMENT_THEMES } from '../../services/themeService';
import { apiClient } from '../../services/apiClient';
import { setBrowserThemeColor, useInstallApp } from '../../services/pwa';
import { authService, type ProviderButton } from '../../services/authService';

/** The shell applies the saved theme once signed in; the login page needs it too. */
function applySavedTheme(): boolean {
  let isDark = false;
  try {
    const themeId = localStorage.getItem('his_egov_theme_id');
    const theme = GOVERNMENT_THEMES.find((t) => t.id === themeId) ?? GOVERNMENT_THEMES[0];
    isDark = localStorage.getItem('his_egov_dark_mode') === 'true';
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', theme.hex);
    root.style.setProperty('--brand-primary-hover', theme.hoverHex);
    root.classList.toggle('dark', isDark);
  } catch {
    // Storage unavailable: keep defaults
  }
  setBrowserThemeColor(isDark ? '#101A2D' : '#F1F5F9');
  return isDark;
}

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'คุ้มครองข้อมูลส่วนบุคคล',
    text: 'เป็นไปตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)',
  },
  {
    icon: LockKeyhole,
    title: 'ควบคุมสิทธิ์ตามบทบาท',
    text: 'ตรวจสอบสิทธิ์ที่เซิร์ฟเวอร์ทุกคำขอ ไม่ใช่แค่ซ่อนปุ่มบนหน้าจอ',
  },
  {
    icon: Timer,
    title: 'ปลอดภัยเมื่อไม่ได้ใช้งาน',
    text: 'ล็อกหน้าจอด้วย PIN และออกจากระบบอัตโนมัติเมื่อไม่ได้ใช้งาน',
  },
];

/** Live answer to "can I even sign in right now?" */
const ServiceStatus: React.FC<{ className?: string; onDark?: boolean }> = ({ className = '', onDark = false }) => {
  const [state, setState] = useState<'checking' | 'up' | 'down'>('checking');

  useEffect(() => {
    let alive = true;
    apiClient.checkHealth().then((h) => alive && setState(h ? 'up' : 'down'));
    return () => {
      alive = false;
    };
  }, []);

  const dot = state === 'up' ? 'bg-emerald-400' : state === 'down' ? 'bg-amber-400' : 'bg-slate-400 animate-pulse';
  const label = state === 'up' ? 'ระบบพร้อมให้บริการ' : state === 'down' ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' : 'กำลังตรวจสอบระบบ...';
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
        onDark ? 'bg-white/10 ring-1 ring-white/20 text-white/90' : 'bg-chroma-elevated border border-chroma-subtle text-ink-3'
      } ${className}`}
    >
      <span className={`w-2 h-2 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
};

export const LoginPage: React.FC = () => {
  const { login, loginTotp, notice, serverUnreachable, retry } = useAuth();
  const installApp = useInstallApp();
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(() => applySavedTheme());
  /** Set after a correct password when the account has Google Authenticator: the code is the next step */
  const [totpTicket, setTotpTicket] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [providers, setProviders] = useState<ProviderButton[]>([]);
  /** Days a browser can be remembered after passing 2FA (0 = the admin turned it off) */
  const [trustDays, setTrustDays] = useState(0);
  const [remember, setRemember] = useState(false);
  const totpRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const buddhistYear = new Date().getFullYear() + 543;

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  // ThaID / Provider ID buttons the admin has switched on, and the reason when one of those sign-ins sent the person back here
  useEffect(() => {
    let alive = true;
    void authService.publicConfig().then((c) => {
      if (!alive) return;
      setProviders(c.providers);
      setTrustDays(c.trustDeviceDays);
    });
    const params = new URLSearchParams(window.location.search);
    const reason = params.get('login_error');
    if (reason) {
      setError(reason);
      params.delete('login_error');
      const qs = params.toString();
      window.history.replaceState({}, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    }
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (totpTicket) totpRef.current?.focus();
  }, [totpTicket]);

  const toggleDark = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    setBrowserThemeColor(next ? '#101A2D' : '#F1F5F9');
    try {
      localStorage.setItem('his_egov_dark_mode', String(next));
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!username.trim() || !password) {
      setError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
      (username.trim() ? passwordRef : usernameRef).current?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await login(username.trim(), password);
    if (!result.ok && result.totpTicket) {
      setTotpTicket(result.totpTicket);
      setTotpCode('');
      setSubmitting(false);
      return;
    }
    if (!result.ok) {
      setError(result.message);
      setPassword('');
      setSubmitting(false);
      passwordRef.current?.focus();
    }
    // On success the gate swaps this page for the app, so there is nothing else to do
  };

  const handleTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !totpTicket) return;
    if (!/^\d{6}$/.test(totpCode) && !/^[a-z2-9]{4}-?[a-z2-9]{4}$/i.test(totpCode)) {
      setError('กรุณากรอกรหัส 6 หลักจากแอป Google Authenticator หรือรหัสกู้คืน (xxxx-xxxx)');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await loginTotp(totpTicket, totpCode, remember);
    if (!result.ok) {
      setSubmitting(false);
      setTotpCode('');
      if (result.expired || !result.totpTicket) {
        // The ticket is gone: start again from the password
        setTotpTicket(null);
        setPassword('');
      } else totpRef.current?.focus();
      setError(result.message);
    }
  };

  const fieldClass =
    'w-full min-h-[50px] pl-11 pr-3.5 py-2 text-base sm:text-sm rounded-xl bg-[var(--login-field-bg)] border border-[var(--login-field-border)] text-ink placeholder:text-slate-400 focus:outline-none focus:border-[color:var(--brand-accent)] focus:ring-4 focus:ring-[color:var(--brand-accent)]/15 transition-all';
  const iconClass =
    'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ink-6 peer-focus:text-[color:var(--brand-accent)] transition-colors';

  return (
    <div className="min-h-screen flex bg-chroma-canvas text-ink">
      {/* ---------- Brand panel (desktop) ---------- */}
      <aside
        className="relative hidden lg:flex lg:w-[46%] xl:w-[42%] overflow-hidden text-white"
        style={{
          background:
            'linear-gradient(155deg, var(--brand-strong) 0%, color-mix(in srgb, var(--brand-strong) 58%, #000) 100%)',
        }}
      >
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute -top-40 -left-32 w-[36rem] h-[36rem] rounded-full bg-white/12 blur-3xl" />
          <div className="absolute -bottom-48 -right-32 w-[34rem] h-[34rem] rounded-full bg-black/30 blur-3xl" />
          <svg className="absolute inset-0 w-full h-full opacity-[0.07]">
            <defs>
              <pattern id="login-grid" width="52" height="52" patternUnits="userSpaceOnUse">
                <path d="M52 0H0V52" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#login-grid)" />
          </svg>
          <Building2 className="absolute -bottom-12 -right-12 w-[22rem] h-[22rem] text-white/[0.07]" strokeWidth={0.8} />
        </div>

        <div className="relative z-10 flex flex-col justify-between w-full p-12 xl:p-14">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur flex items-center justify-center shadow-lg shadow-black/20">
              <Building2 className="w-6 h-6" aria-hidden="true" />
            </div>
            <div className="leading-tight">
              <p className="text-lg font-semibold tracking-wide">ระบบงานพัสดุ</p>
              <p className="text-sm text-white/75">กองโรคติดต่อทั่วไป กรมควบคุมโรค</p>
            </div>
          </div>

          <div>
            <h1 className="text-[clamp(1.75rem,2.4vw,2.5rem)] font-semibold leading-[1.3]">
              จัดการทะเบียนและงบประมาณ
              <br />
              อย่างปลอดภัยและเป็นระบบ
            </h1>
            <p className="mt-4 max-w-md text-base text-white/80 leading-relaxed">
              ศูนย์รวมข้อมูลผู้ป่วย การเบิกจ่าย และรายงาน สำหรับเจ้าหน้าที่ของหน่วยงาน
            </p>

            <ul className="mt-10 space-y-6 max-w-md">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex items-start gap-4">
                  <span className="mt-0.5 w-10 h-10 shrink-0 rounded-xl bg-white/12 ring-1 ring-white/25 flex items-center justify-center">
                    <Icon className="w-[19px] h-[19px]" aria-hidden="true" />
                  </span>
                  <span className="leading-snug">
                    <span className="block text-base font-semibold">{title}</span>
                    <span className="block mt-0.5 text-sm text-white/75 leading-relaxed">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-white/70">© {buddhistYear} กระทรวงสาธารณสุข สงวนลิขสิทธิ์</p>
            <ServiceStatus onDark />
          </div>
        </div>
      </aside>

      {/* ---------- Form ---------- */}
      <main
        className="login-surface relative flex-1 flex items-center justify-center p-5 sm:p-8"
      >
        <button
          type="button"
          onClick={toggleDark}
          aria-label={isDark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
          title={isDark ? 'โหมดสว่าง' : 'โหมดมืด'}
          className="absolute top-4 right-4 w-11 h-11 rounded-xl border border-chroma-subtle bg-chroma-card hover:bg-chroma-elevated inline-flex items-center justify-center text-ink-3 cursor-pointer transition-colors"
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>

        <div className="w-full max-w-[26.5rem] rise-in">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl btn-brand flex items-center justify-center shadow-md">
              <Building2 className="w-6 h-6" aria-hidden="true" />
            </div>
            <div className="leading-tight">
              <p className="text-lg font-semibold">ระบบงานพัสดุ</p>
              <p className="text-sm text-ink-4">กองโรคติดต่อทั่วไป กรมควบคุมโรค</p>
            </div>
          </div>

          <div className="gov-card login-card p-6 sm:p-9 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.35)]">
            <p className="text-sm font-semibold text-brand">ยินดีต้อนรับ</p>
            <h2 className="mt-1 text-[1.75rem] font-semibold leading-tight">เข้าสู่ระบบ</h2>
            <p className="mt-2 text-sm text-ink-4 text-balance">
              กรอกบัญชีผู้ใช้ที่ได้รับจากผู้ดูแลระบบของหน่วยงาน
            </p>

            {notice && !error && (
              <p role="status" className="mt-5 flex items-start gap-2.5 rounded-xl border border-sky-200 dark:border-sky-800/60 bg-sky-50 dark:bg-sky-950/30 px-3.5 py-3 text-sm text-sky-900 dark:text-sky-200">
                <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{notice}</span>
              </p>
            )}
            {serverUnreachable && !error && (
              <div role="alert" className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-3 text-sm text-amber-900 dark:text-amber-200">
                <WifiOff className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <div className="space-y-1.5">
                  <p>เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ในขณะนี้</p>
                  <button type="button" onClick={retry} className="font-semibold underline underline-offset-2 cursor-pointer">
                    ลองเชื่อมต่อใหม่
                  </button>
                </div>
              </div>
            )}
            {error && (
              <p role="alert" className="mt-5 flex items-start gap-2.5 rounded-xl border border-rose-300 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/30 px-3.5 py-3 text-sm font-medium text-rose-800 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </p>
            )}

            {totpTicket ? (
              <form onSubmit={handleTotp} noValidate className="mt-6 space-y-5">
                <div className="flex items-start gap-3 rounded-xl border border-chroma-subtle bg-chroma-elevated px-3.5 py-3 text-sm">
                  <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                  <p>บัญชีนี้เปิดใช้การยืนยัน 2 ขั้นตอน กรุณากรอกรหัส 6 หลักจากแอป <b>Google Authenticator</b> บนโทรศัพท์ของคุณ</p>
                </div>
                <div>
                  <label htmlFor="totp" className="block text-sm font-semibold mb-1.5">รหัส 6 หลัก หรือรหัสกู้คืน</label>
                  <input
                    id="totp"
                    ref={totpRef}
                    inputMode="text"
                    autoComplete="one-time-code"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={9}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/[^0-9a-zA-Z-]/g, ''))}
                    aria-invalid={error ? true : undefined}
                    className="w-full min-h-[56px] rounded-xl bg-[var(--login-field-bg)] border border-[var(--login-field-border)] text-center text-2xl tracking-[0.5em] tabular-nums text-ink focus:outline-none focus:border-[color:var(--brand-accent)] focus:ring-4 focus:ring-[color:var(--brand-accent)]/15"
                  />
                </div>
                {trustDays > 0 && (
                  <label className="flex min-h-[44px] items-center gap-3 rounded-xl border border-chroma-subtle bg-chroma-elevated px-3.5 text-sm cursor-pointer">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-[var(--brand-strong)]" />
                    <span>จำเครื่องนี้ไว้ {trustDays} วัน (ไม่ต้องกรอกรหัสอีก)</span>
                  </label>
                )}
                <button type="submit" disabled={submitting} className="btn-brand group w-full min-h-[50px] rounded-xl text-base sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-80 disabled:cursor-wait shadow-md">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" aria-hidden="true" />}
                  <span>{submitting ? 'กำลังตรวจสอบ...' : 'ยืนยันและเข้าสู่ระบบ'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTotpTicket(null);
                    setTotpCode('');
                    setPassword('');
                    setError(null);
                  }}
                  className="w-full min-h-[44px] rounded-xl text-sm font-medium text-ink-3 hover:bg-chroma-elevated cursor-pointer"
                >
                  ย้อนกลับ
                </button>
              </form>
            ) : (
            <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
              <div>
                <label htmlFor="username" className="block text-sm font-semibold mb-1.5">
                  ชื่อผู้ใช้
                </label>
                <div className="relative">
                  <input
                    id="username"
                    ref={usernameRef}
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint="next"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    aria-invalid={error ? true : undefined}
                    className={`peer ${fieldClass}`}
                  />
                  <User className={iconClass} aria-hidden="true" />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-semibold mb-1.5">
                  รหัสผ่าน
                </label>
                <div className="relative">
                  <input
                    id="password"
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    enterKeyHint="go"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
                    onBlur={() => setCapsLock(false)}
                    aria-invalid={error ? true : undefined}
                    className={`peer ${fieldClass} pr-12`}
                  />
                  <KeyRound className={iconClass} aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 w-12 inline-flex items-center justify-center text-slate-500 hover:text-ink-2 dark:hover:text-white cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                  </button>
                </div>
                {capsLock && (
                  <p className="mt-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">เปิด Caps Lock อยู่</p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn-brand group w-full min-h-[50px] rounded-xl text-base sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-80 disabled:cursor-wait shadow-md"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>กำลังตรวจสอบ...</span>
                  </>
                ) : (
                  <>
                    <span>เข้าสู่ระบบ</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </>
                )}
              </button>
            </form>
            )}

            {providers.length > 0 && !totpTicket && (
              <div className="mt-6">
                <div className="flex items-center gap-3 text-xs font-medium text-ink-4" aria-hidden="true">
                  <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                  หรือเข้าสู่ระบบด้วย
                  <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                </div>
                <div className={`mt-3 grid gap-2 ${providers.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {providers.map((p) => (
                    <a
                      key={p.id}
                      href={`/api/auth/oauth/${p.id}/start`}
                      className="min-h-[48px] rounded-xl border border-chroma-subtle bg-chroma-elevated hover:border-chroma-optical text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                    >
                      {p.id === 'thaid' ? <IdCard className="w-4 h-4 text-brand" aria-hidden="true" /> : <BadgeCheck className="w-4 h-4 text-brand" aria-hidden="true" />}
                      {p.label}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-5 text-center text-xs text-ink-4">
              ลืมรหัสผ่านหรือไม่มีบัญชี? กรุณาติดต่อผู้ดูแลระบบของหน่วยงาน
            </p>

            {!installApp.installed && (
              <div className="mt-6 pt-5 border-t border-slate-200/70 dark:border-white/10">
                {installApp.canInstall ? (
                  <button
                    type="button"
                    onClick={() => void installApp.install()}
                    className="w-full min-h-[46px] rounded-xl border border-chroma-subtle bg-chroma-elevated hover:border-chroma-optical text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <Download className="w-4 h-4 text-brand" aria-hidden="true" />
                    ติดตั้งเป็นแอปบนอุปกรณ์นี้
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setInstallHelpOpen(true)}
                    className="w-full min-h-[44px] rounded-xl text-sm font-medium text-ink-3 hover:bg-chroma-elevated inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <Share className="w-4 h-4 text-brand" aria-hidden="true" />
                    วิธีติดตั้งเป็นแอป
                  </button>
                )}
              </div>
            )}
          </div>

          <InstallHelpDialog open={installHelpOpen} onOpenChange={setInstallHelpOpen} />

          <div className="lg:hidden mt-6 flex flex-col items-center gap-3">
            <ServiceStatus />
            <p className="text-center text-xs text-ink-4">
              © {buddhistYear} กระทรวงสาธารณสุข สงวนลิขสิทธิ์
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
