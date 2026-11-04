import React, { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeft, ArrowUpCircle, CalendarDays, CheckCircle2, ChevronRight, ExternalLink, GitBranch, History, Search, Sparkles, X, Zap } from 'lucide-react';
import { CHANGELOG, type ReleaseKind, type ReleaseNote } from '../data/changelog';

const KIND_LABEL: Record<ReleaseKind, string> = {
  major: 'อัปเดตใหญ่',
  minor: 'เพิ่มความสามารถ',
  patch: 'ปรับปรุงและแก้ไข',
};

const formatDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

/** -1 / 0 / 1 for dotted version numbers such as 1.0.10 vs 1.0.2 */
const compareVersion = (a: string, b: string): number => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
};

// Notes written for a version that is not released yet must not show up in the running app
const RELEASED: ReleaseNote[] = CHANGELOG.filter((r) => compareVersion(r.version, __APP_VERSION__) <= 0);
const RUNNING: ReleaseNote | undefined = RELEASED.find((r) => r.version === __APP_VERSION__) ?? RELEASED[0];

// Keyed by build, not version number: every deploy (even without a version bump) must be acknowledged again
const ACK_KEY = 'his_egov_ack_build';

/** When this build was made, read back from the build id (a base-36 timestamp set in vite.config.ts) */
const builtAt = (): string => {
  const ms = parseInt(__APP_BUILD__, 36);
  // Dev server ids ("dev-1.0.1") are not timestamps
  if (!Number.isFinite(ms) || ms < 1e12) return '';
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms));
};

const readAcknowledged = (): string | null => {
  try {
    return localStorage.getItem(ACK_KEY);
  } catch {
    return null;
  }
};

const saveAcknowledged = (build: string): void => {
  try {
    localStorage.setItem(ACK_KEY, build);
  } catch {
    /* storage unavailable: the notice simply shows again next time */
  }
};

const releaseUrl = (version: string): string | null =>
  __APP_REPO_URL__ ? `${__APP_REPO_URL__}/releases/tag/v${version}` : null;

const Highlights: React.FC<{ items: string[] }> = ({ items }) => (
  <ul className="space-y-2.5">
    {items.map((h) => (
      <li key={h} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <span>{h}</span>
      </li>
    ))}
  </ul>
);

/** Focused "what's new" card shown right after a deploy */
const WhatsNew: React.FC<{ onShowHistory: () => void }> = ({ onShowHistory }) => (
  <>
    <div
      className="relative overflow-hidden px-6 pb-5 pt-6 text-white"
      style={{ background: 'linear-gradient(135deg, var(--brand-strong) 0%, var(--brand-primary) 100%)' }}
    >
      <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" aria-hidden />
      <div className="relative flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold ring-1 ring-white/30">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> อัปเดตใหม่
        </span>
        {RUNNING && <span className="text-xs font-semibold text-white/80">{KIND_LABEL[RUNNING.kind]}</span>}
      </div>
      <Dialog.Title className="relative mt-3 font-prompt text-2xl font-bold leading-tight">
        เวอร์ชัน {__APP_VERSION__}
      </Dialog.Title>
      {RUNNING && <p className="relative mt-1 text-sm font-semibold text-white/95">{RUNNING.title}</p>}
      <Dialog.Description className="relative mt-2 text-xs text-white/80">
        {builtAt() ? `อัปเดตระบบเมื่อ ${builtAt()} น.` : RUNNING ? `เผยแพร่เมื่อ ${formatDate(RUNNING.date)}` : 'ระบบงานพัสดุ'}
      </Dialog.Description>
    </div>

    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-5">มีอะไรใหม่</p>
      {RUNNING ? <Highlights items={RUNNING.highlights} /> : <p className="text-sm text-ink-3">ปรับปรุงประสิทธิภาพและความเสถียรของระบบ</p>}
      <button
        type="button"
        onClick={onShowHistory}
        className="mt-5 inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg text-sm font-semibold text-brand hover:underline"
      >
        <History className="h-4 w-4" aria-hidden /> ดูประวัติทุกเวอร์ชัน
      </button>
    </div>
  </>
);

const KIND_TAB: { id: 'all' | ReleaseKind; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'major', label: 'Major' },
  { id: 'minor', label: 'Minor' },
  { id: 'patch', label: 'Patch' },
];

const KIND_TONE: Record<ReleaseKind, string> = {
  major: 'text-rose-600 dark:text-rose-300',
  minor: 'text-violet-600 dark:text-violet-300',
  patch: 'text-emerald-600 dark:text-emerald-300',
};

const formatTime = (iso: string): string =>
  new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

/** "4 พ.ย. 2569 09:07 น." when the release has a time, otherwise just the date */
const stamp = (r: ReleaseNote): string =>
  r.at
    ? `${new Date(r.at).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' })} ${formatTime(r.at)} น.`
    : new Date(`${r.date}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

/** Short date for the version list (the time is shown in the detail pane) */
const shortDate = (r: ReleaseNote): string =>
  new Date(r.at ?? `${r.date}T00:00:00`).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' });

/** Full release history: searchable version list on the left, the chosen release on the right */
const ReleaseHistory: React.FC<{ onBack?: () => void; closable: boolean }> = ({ onBack, closable }) => {
  const [selected, setSelected] = useState(RUNNING?.version ?? '');
  const [kind, setKind] = useState<'all' | ReleaseKind>('all');
  const [query, setQuery] = useState('');

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return RELEASED.filter((r) => (kind === 'all' || r.kind === kind) && (!q || `v${r.version} ${r.title} ${r.highlights.join(' ')}`.toLowerCase().includes(q)));
  }, [kind, query]);
  const current = list.find((r) => r.version === selected) ?? list[0];
  const url = current ? releaseUrl(current.version) : null;
  const featured = current ? (current.highlights.length > 2 ? current.highlights.slice(0, 2) : current.highlights) : [];
  const rest = current && current.highlights.length > 2 ? current.highlights.slice(2) : [];

  return (
    <>
      <div className="flex items-start gap-3.5 border-b border-chroma-subtle p-5">
        {onBack ? (
          <button type="button" onClick={onBack} aria-label="กลับไปหน้ามีอะไรใหม่" className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-brand-soft hover:opacity-90">
            <ArrowLeft className="h-5 w-5 text-brand" aria-hidden="true" />
          </button>
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft">
            <ArrowUpCircle className="h-5 w-5 text-brand" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Dialog.Title className="text-lg font-semibold text-ink">บันทึกการอัปเดตระบบ</Dialog.Title>
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-bold text-brand ring-1 ring-[var(--brand-accent)]/40">
              <GitBranch className="h-3 w-3" aria-hidden="true" /> v{__APP_VERSION__} ใช้งานอยู่
            </span>
          </div>
          <Dialog.Description className="mt-1 text-sm text-ink-4">
            ประวัติเวอร์ชันและการปรับปรุงของระบบงานพัสดุ ({RELEASED.length} รุ่น){builtAt() && ` · อัปเดตล่าสุด ${builtAt()} น.`}
          </Dialog.Description>
        </div>
        {closable && (
          <Dialog.Close asChild>
            <button type="button" aria-label="ปิดหน้าต่าง" className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-chroma-subtle text-slate-500 hover:bg-slate-100 hover:text-ink-2 dark:hover:bg-white/10 dark:hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </Dialog.Close>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <div className="flex max-h-56 shrink-0 flex-col gap-2.5 border-b border-chroma-subtle p-3 sm:max-h-none sm:w-[19rem] sm:border-b-0 sm:border-r">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาเวอร์ชัน หรือรายการ..."
              aria-label="ค้นหาเวอร์ชัน"
              className="pf-field min-h-[40px] w-full rounded-lg pl-9 pr-3 text-sm"
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <div role="tablist" aria-label="ประเภทการอัปเดต" className="inline-flex rounded-lg bg-slate-100 p-0.5 ring-1 ring-inset ring-slate-200 dark:bg-white/5 dark:ring-white/10">
              {KIND_TAB.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={kind === t.id}
                  onClick={() => setKind(t.id)}
                  className={`min-h-[28px] cursor-pointer rounded-md px-2.5 text-xs font-semibold transition-colors ${
                    kind === t.id ? 'bg-[var(--brand-strong)] text-white shadow-xs' : 'text-slate-600 hover:text-ink dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <span className="shrink-0 text-xs text-ink-4">{list.length} รุ่น</span>
          </div>

          <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5" aria-label="รายการเวอร์ชัน">
            {list.length === 0 && <li className="px-2 py-6 text-center text-sm text-ink-4">ไม่พบเวอร์ชันที่ค้นหา</li>}
            {list.map((r) => {
              const active = r.version === current?.version;
              return (
                <li key={r.version}>
                  <button
                    type="button"
                    onClick={() => setSelected(r.version)}
                    aria-current={active ? 'true' : undefined}
                    className={`w-full cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      active ? 'border-[var(--brand-accent)] bg-brand-soft' : 'border-chroma-subtle hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <GitBranch className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-brand' : 'text-ink-4'}`} aria-hidden="true" />
                      <span className="shrink-0 text-sm font-bold text-ink">v{r.version}</span>
                      {r.version === __APP_VERSION__ && (
                        <span className="shrink-0 whitespace-nowrap rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">ใช้งานอยู่</span>
                      )}
                      <span className="ml-auto shrink-0 whitespace-nowrap text-[11px] text-ink-5">{shortDate(r)}</span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-ink-3">{r.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {current ? (
          <div className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="rounded-lg bg-brand-soft px-2.5 py-1 text-sm font-bold text-brand ring-1 ring-[var(--brand-accent)]/40">v{current.version}</span>
                  <h3 className="text-lg font-semibold text-ink">{current.title}</h3>
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-4">
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  <span>เผยแพร่เมื่อ {stamp(current)}</span>
                  <span>ประเภท: <strong className={`font-semibold ${KIND_TONE[current.kind]}`}>{KIND_LABEL[current.kind]}</strong></span>
                </p>
              </div>
              {url && (
                <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-chroma-subtle px-3 text-sm font-semibold text-ink-2 hover:bg-slate-100 dark:hover:bg-white/5">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Release v{current.version} บน GitHub
                </a>
              )}
            </div>

            <div className="mt-5 border-t border-chroma-subtle pt-5">
              <h4 className="flex items-center gap-2 text-sm font-bold text-brand">
                <Sparkles className="h-4 w-4" aria-hidden="true" /> ไฮไลท์เด่นในเวอร์ชันนี้
              </h4>
              <ul className="mt-3 space-y-2.5">
                {featured.map((h) => (
                  <li key={h} className="flex items-start gap-3 rounded-xl border border-chroma-subtle px-4 py-3 text-sm leading-relaxed text-ink-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>

            {rest.length > 0 && (
              <div className="mt-5">
                <h4 className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                  <Zap className="h-4 w-4" aria-hidden="true" /> รายการปรับปรุงอื่นๆ
                </h4>
                <ul className="mt-2.5 space-y-2">
                  {rest.map((h) => (
                    <li key={h} className="flex items-start gap-2 text-sm leading-relaxed text-ink-3">
                      <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-5" aria-hidden="true" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-ink-4">เลือกเวอร์ชันทางซ้ายเพื่อดูรายละเอียด</div>
        )}
      </div>
    </>
  );
};

/**
 * Pill showing the running version; opens the release history.
 * With `announce`, a "what's new" card opens by itself after every deploy and cannot be dismissed
 * (no X, Esc or click-outside) until the user presses the confirm button; that is remembered per device and build.
 */
export const VersionBadge: React.FC<{ announce?: boolean }> = ({ announce = false }) => {
  const [mustAck, setMustAck] = useState(() => announce && readAcknowledged() !== __APP_BUILD__);
  const [open, setOpen] = useState(mustAck);
  const [showHistory, setShowHistory] = useState(false);
  const focused = mustAck && !showHistory;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && mustAck) return;
        setOpen(next);
        if (next) setShowHistory(false);
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          title="ดูประวัติการอัปเดตระบบ"
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--brand-primary)] px-2.5 py-1 text-xs font-semibold text-white cursor-pointer transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-accent)]"
        >
          v{__APP_VERSION__}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm" />
        <Dialog.Content
          onEscapeKeyDown={(e) => mustAck && e.preventDefault()}
          onPointerDownOutside={(e) => mustAck && e.preventDefault()}
          onInteractOutside={(e) => mustAck && e.preventDefault()}
          className={`fixed left-1/2 top-1/2 z-[80] flex max-h-[88dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-chroma-subtle bg-chroma-card shadow-2xl focus:outline-none ${
            focused ? 'max-w-lg' : 'max-w-3xl'
          }`}
        >
          {focused ? (
            <WhatsNew onShowHistory={() => setShowHistory(true)} />
          ) : (
            <ReleaseHistory onBack={mustAck ? () => setShowHistory(false) : undefined} closable={!mustAck} />
          )}

          {mustAck ? (
            <div className="border-t border-chroma-subtle p-4 sm:px-6">
              <button
                type="button"
                autoFocus
                onClick={() => {
                  saveAcknowledged(__APP_BUILD__);
                  setMustAck(false);
                  setOpen(false);
                }}
                className="btn-brand min-h-[48px] w-full cursor-pointer rounded-xl px-6 text-sm font-bold"
              >
                รับทราบและเริ่มใช้งาน
              </button>
              <p className="mt-2 text-center text-xs text-ink-5">ต้องกดรับทราบก่อนจึงจะใช้งานระบบเวอร์ชันใหม่ได้</p>
            </div>
          ) : (
            <div className="flex justify-end border-t border-chroma-subtle p-4">
              <Dialog.Close asChild>
                <button type="button" className="btn-brand min-h-[44px] cursor-pointer rounded-lg px-6 text-sm font-semibold">
                  ปิด
                </button>
              </Dialog.Close>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
