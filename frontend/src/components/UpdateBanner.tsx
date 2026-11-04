import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

interface DeployedVersion {
  version: string;
  build: string;
}

const CHECK_EVERY_MS = 5 * 60 * 1000;

async function fetchDeployed(): Promise<DeployedVersion | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<DeployedVersion>;
    return typeof data.version === 'string' && typeof data.build === 'string' ? { version: data.version, build: data.build } : null;
  } catch {
    return null;
  }
}

/**
 * Tells people who already have the app open that a newer build was deployed.
 * It never reloads by itself, so nobody loses a half-filled form; the new version's
 * release notes then open once after the reload (see VersionBadge).
 */
export const UpdateBanner: React.FC = () => {
  const [next, setNext] = useState<DeployedVersion | null>(null);
  const [dismissedBuild, setDismissedBuild] = useState<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let cancelled = false;
    const check = async () => {
      const deployed = await fetchDeployed();
      if (!cancelled && deployed && deployed.build !== __APP_BUILD__) setNext(deployed);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    void check();
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!next || dismissedBuild === next.build) return null;

  return (
    <div role="status" className="print-hide fixed bottom-4 left-1/2 z-[90] flex w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 items-center gap-3 rounded-2xl border border-chroma-subtle bg-chroma-card p-3.5 pl-4 shadow-2xl max-lg:bottom-20">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft" aria-hidden>
        <RefreshCw className="h-5 w-5 text-brand" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">มีเวอร์ชันใหม่ v{next.version} พร้อมใช้งาน</p>
        <p className="text-xs text-ink-4">บันทึกงานที่กำลังกรอกอยู่ก่อน แล้วกดอัปเดตเมื่อพร้อม</p>
      </div>
      <button type="button" onClick={() => window.location.reload()} className="btn-brand min-h-[40px] shrink-0 cursor-pointer rounded-lg px-4 text-sm font-semibold">
        อัปเดตตอนนี้
      </button>
      <button
        type="button"
        onClick={() => setDismissedBuild(next.build)}
        aria-label="ไว้ทีหลัง"
        title="ไว้ทีหลัง"
        className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
