import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Select } from '../../components/ui/select';
import { CalendarClock, ChartColumn, CheckCircle2, FileSignature, FileSpreadsheet, Inbox, ListChecks, Loader2, RefreshCw, ShieldCheck, ShoppingCart, Volume2, VolumeX, XCircle, type LucideIcon } from 'lucide-react';
import { RBAC_MATRIX, type EnterpriseRole } from '../../services/enterpriseService';
import { procureApi, type Lookups, type PeriodMode, type Row, type Summary } from './api';
import type { FormValues } from './RecordDialog';
import { RESOURCE_DEFS } from './fields';
import { RegistryTab } from './RegistryTab';
import { ProgressTab } from './ProgressTab';
import { SummaryTab } from './SummaryTab';
import { Skr1Modal } from './Skr1Modal';
import { columnsFromFields, excelFilename, exportXlsx, type SheetSpec } from './excel';
import { fiscalYearOf, periodLabel, thaiDate, todayIso } from './format';
import type { Notify, Permissions } from './types';
import { Flash, playChime, readSoundPref, requestRefresh, saveSoundPref, subscribeLive, useLiveStatus, type LiveEvent } from './live';

/**
 * Each register has its own accent color so the tabs are told apart at a glance.
 * (Class names are written out in full on purpose: Tailwind only generates classes it can see in the source.)
 */
const TONES = {
  sky: {
    chip: 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300',
    chipActive: 'bg-sky-600 text-white shadow-sm shadow-sky-600/30 dark:bg-sky-400 dark:text-sky-950',
    active: 'border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-400/40 dark:bg-sky-400/10 dark:text-sky-50',
    hover: 'hover:border-sky-300 dark:hover:border-sky-400/40',
    bar: 'bg-sky-500 dark:bg-sky-400',
    badge: 'bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-200',
  },
  violet: {
    chip: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300',
    chipActive: 'bg-violet-600 text-white shadow-sm shadow-violet-600/30 dark:bg-violet-400 dark:text-violet-950',
    active: 'border-violet-300 bg-violet-50 text-violet-950 dark:border-violet-400/40 dark:bg-violet-400/10 dark:text-violet-50',
    hover: 'hover:border-violet-300 dark:hover:border-violet-400/40',
    bar: 'bg-violet-500 dark:bg-violet-400',
    badge: 'bg-violet-100 text-violet-800 dark:bg-violet-400/15 dark:text-violet-200',
  },
  teal: {
    chip: 'bg-teal-100 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300',
    chipActive: 'bg-teal-600 text-white shadow-sm shadow-teal-600/30 dark:bg-teal-400 dark:text-teal-950',
    active: 'border-teal-300 bg-teal-50 text-teal-950 dark:border-teal-400/40 dark:bg-teal-400/10 dark:text-teal-50',
    hover: 'hover:border-teal-300 dark:hover:border-teal-400/40',
    bar: 'bg-teal-500 dark:bg-teal-400',
    badge: 'bg-teal-100 text-teal-800 dark:bg-teal-400/15 dark:text-teal-200',
  },
  amber: {
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
    chipActive: 'bg-amber-500 text-white shadow-sm shadow-amber-500/30 dark:bg-amber-400 dark:text-amber-950',
    active: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-50',
    hover: 'hover:border-amber-300 dark:hover:border-amber-400/40',
    bar: 'bg-amber-500 dark:bg-amber-400',
    badge: 'bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200',
  },
  emerald: {
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
    chipActive: 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30 dark:bg-emerald-400 dark:text-emerald-950',
    active: 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-50',
    hover: 'hover:border-emerald-300 dark:hover:border-emerald-400/40',
    bar: 'bg-emerald-500 dark:bg-emerald-400',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200',
  },
  rose: {
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300',
    chipActive: 'bg-rose-600 text-white shadow-sm shadow-rose-600/30 dark:bg-rose-400 dark:text-rose-950',
    active: 'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-50',
    hover: 'hover:border-rose-300 dark:hover:border-rose-400/40',
    bar: 'bg-rose-500 dark:bg-rose-400',
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-200',
  },
} as const;

const TABS: { id: string; label: string; short?: string; hint: string; icon: LucideIcon; tone: keyof typeof TONES; count?: keyof Summary['counts']; unit: string }[] = [
  { id: 'incoming', label: 'ทะเบียนหนังสือรับ', short: 'หนังสือรับ', hint: 'เอกสารรับเข้า', icon: Inbox, tone: 'teal', count: 'incoming', unit: 'ฉบับ' },
  { id: 'orders', label: 'ทะเบียนใบสั่งซื้อ/จ้าง', short: 'ใบสั่งซื้อ/จ้าง', hint: 'ซื้อ/จ้างด้วยใบสั่ง', icon: ShoppingCart, tone: 'sky', count: 'orders', unit: 'รายการ' },
  { id: 'contracts', label: 'ทะเบียนสัญญา', short: 'ทะเบียนสัญญา', hint: 'สัญญาซื้อขาย/จ้าง', icon: FileSignature, tone: 'violet', count: 'contracts', unit: 'รายการ' },
  { id: 'guarantees', label: 'หลักประกันสัญญา', short: 'หลักประกัน', hint: 'รับ-คืนหลักประกัน', icon: ShieldCheck, tone: 'amber', count: 'guarantees', unit: 'รายการ' },
  { id: 'progress', label: 'ความก้าวหน้า', hint: 'ติดตาม 17 ขั้นตอน', icon: ListChecks, tone: 'emerald', count: 'progress', unit: 'โครงการ' },
  { id: 'summary', label: 'รายงานสรุป', hint: 'สรุปตามวิธีจัดหา', icon: ChartColumn, tone: 'rose', unit: '' },
];

type TabId = string;

const MODE_STORAGE_KEY = 'procure_period_mode';

/** The current year for each way of counting, from today's date in Thailand (always up to date, never saved) */
function currentYear(mode: PeriodMode): number {
  const today = todayIso();
  return mode === 'calendar' ? Number(today.slice(0, 4)) + 543 : fiscalYearOf(today);
}

/** Years offered in the selector: six back from the current one, and the next */
const yearOptions = (mode: PeriodMode) => {
  const cur = currentYear(mode);
  return Array.from({ length: 8 }, (_, i) => cur - 6 + i);
};

const RESOURCE_TH: Record<string, string> = { users: 'ผู้ใช้งาน', orders: 'ใบสั่ง', contracts: 'สัญญา', incoming: 'หนังสือรับ', guarantees: 'หลักประกันสัญญา', progress: 'ความก้าวหน้า', notes: 'รายงานสรุป' };
const ACTION_TH: Record<LiveEvent['action'], string> = { create: 'เพิ่ม', update: 'แก้ไข', delete: 'ลบ' };

/** Date and time in Thailand, kept current (shown beside the subtitle metadata) */
const NowChip: React.FC = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const text = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  return <span className="tabular-nums">{text} น.</span>;
};

export const ProcurementView: React.FC<{ currentRole: EnterpriseRole; menus: string[]; username: string; requestedTab?: { tab: string; nonce: number } | null }> = ({ currentRole, menus, username, requestedTab }) => {
  // Only the registers this user was given (ticked in user management); ids match the menu ids
  const tabs = TABS.filter((tb) => menus.includes(tb.id));
  const [tab, setTab] = useState<TabId>(() => {
    try {
      const urlTab = new URLSearchParams(window.location.search).get('tab') as TabId;
      if (urlTab && tabs.some((t) => t.id === urlTab)) return urlTab;
      const stored = localStorage.getItem('app_procure_tab') as TabId;
      if (stored && tabs.some((t) => t.id === stored)) return stored;
    } catch {
      /* ignore */
    }
    return tabs[0]?.id ?? 'orders';
  });

  const handleTabChange = useCallback((nextTab: TabId) => {
    setTab(nextTab);
    try {
      localStorage.setItem('app_procure_tab', nextTab);
      const url = new URL(window.location.href);
      url.searchParams.set('tab', nextTab);
      window.history.replaceState({}, '', url.toString());
    } catch {
      /* ignore */
    }
  }, []);
  const [mode, setModeState] = useState<PeriodMode>(() => {
    try {
      return localStorage.getItem(MODE_STORAGE_KEY) === 'calendar' ? 'calendar' : 'fiscal';
    } catch {
      return 'fiscal';
    }
  });
  const setMode = (m: PeriodMode) => {
    setModeState(m);
    setFy(currentYear(m));
    try {
      localStorage.setItem(MODE_STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
  };
  // Opens on the current year; changing the way of counting jumps to the current year of that way (fiscal 2570 vs calendar 2569)
  const [fy, setFy] = useState(() => currentYear(mode));
  const [pendingNewOrder, setPendingNewOrder] = useState<FormValues | null>(null);
  const [pendingNewContract, setPendingNewContract] = useState<FormValues | null>(null);

  const handleCreateOrderFromIncoming = (letter: Row) => {
    setPendingNewOrder({
      incoming_id: String(letter.id),
      job_title: String(letter.subject ?? ''),
      vendor_name: String(letter.from_name ?? ''),
      budget_amount: letter.amount !== null && letter.amount !== undefined ? String(letter.amount) : '',
      agreed_price: letter.amount !== null && letter.amount !== undefined ? String(letter.amount) : '',
      median_price: letter.amount !== null && letter.amount !== undefined ? String(letter.amount) : '',
      received_date: typeof letter.doc_date === 'string' ? letter.doc_date.slice(0, 10) : '',
      status: 'อยู่ระหว่างกระบวนการจัดซื้อจัดจ้าง',
      method: 'วิธีเฉพาะเจาะจง',
      budget_source: 'เงินบำรุง',
    });
    handleTabChange('orders');
  };

  const handleCreateContractFromIncoming = (letter: Row) => {
    setPendingNewContract({
      incoming_id: String(letter.id),
      job_title: String(letter.subject ?? ''),
      vendor_name: String(letter.from_name ?? ''),
      budget_amount: letter.amount !== null && letter.amount !== undefined ? String(letter.amount) : '',
      agreed_price: letter.amount !== null && letter.amount !== undefined ? String(letter.amount) : '',
      median_price: letter.amount !== null && letter.amount !== undefined ? String(letter.amount) : '',
      received_date: typeof letter.doc_date === 'string' ? letter.doc_date.slice(0, 10) : '',
      status: 'อยู่ระหว่างบริหารสัญญา',
      method: 'วิธีเฉพาะเจาะจง',
      budget_source: 'เงินบำรุง',
    });
    handleTabChange('contracts');
  };

  useEffect(() => {
    if (requestedTab && tabs.some((t) => t.id === requestedTab.tab)) {
      handleTabChange(requestedTab.tab as TabId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedTab?.nonce]);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [notice, setNotice] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [exportingAll, setExportingAll] = useState(false);
  const [showSkr1, setShowSkr1] = useState(false);
  const [stats, setStats] = useState<Summary | null>(null);
  /** Bumped after every successful change so the tab badges refresh */
  const [changes, setChanges] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  /** "Somebody else just changed something", shown for a few seconds */
  const [liveNote, setLiveNote] = useState<string | null>(null);
  const liveNoteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const liveStatus = useLiveStatus();
  const [soundOn, setSoundOn] = useState(readSoundPref);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  useEffect(() => {
    let cancelled = false;
    procureApi
      .summary(fy, mode)
      .then((s) => !cancelled && setStats(s))
      .catch(() => !cancelled && setStats(null))
      .finally(() => {
        if (cancelled) return;
        setUpdatedAt(new Date());
        setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fy, mode, changes]);

  // Everyone's changes refresh the counts; other people's changes are also announced
  useEffect(() => {
    const off = subscribeLive((e) => {
      setChanges((n) => n + 1);
      if (e.resource === '*' || !e.by || e.by === username) return;
      if (soundRef.current) playChime();
      const count = e.ids.length > 1 ? ` ${e.ids.length} รายการ` : '';
      setLiveNote(`${e.byName || e.by} ${ACTION_TH[e.action]}${RESOURCE_TH[e.resource] ?? e.resource}${count}`);
      clearTimeout(liveNoteTimer.current);
      liveNoteTimer.current = setTimeout(() => setLiveNote(null), 6000);
    });
    return () => {
      off();
      clearTimeout(liveNoteTimer.current);
    };
  }, [username]);

  const refresh = () => {
    setRefreshing(true);
    requestRefresh();
    setChanges((n) => n + 1);
  };

  /** One workbook with a sheet per register (all rows of the selected fiscal year) */
  const exportAll = async () => {
    setExportingAll(true);
    try {
      const keys = (['orders', 'contracts', 'incoming', 'guarantees'] as const).filter((k) => menus.includes(k));
      const [lists, progress] = await Promise.all([
        Promise.all(keys.map((k) => procureApi.list(k, fy, undefined, mode))),
        menus.includes('progress') ? procureApi.progress(fy, mode) : Promise.resolve([]),
      ]);
      const sheets: SheetSpec[] = keys.map((k, i) => ({
        name: RESOURCE_DEFS[k].tab,
        title: `${RESOURCE_DEFS[k].tab} ${periodLabel(mode, fy)}`,
        notes: [k === 'guarantees' && mode === 'fiscal' ? 'หลักประกันสัญญาทุกปี' : periodLabel(mode, fy)],
        columns: columnsFromFields(RESOURCE_DEFS[k].fields),
        rows: lists[i],
        totalKey: RESOURCE_DEFS[k].totalKey,
      }));
      const stepNames = lookups?.steps ?? [];
      const stepKeys = Array.from({ length: 17 }, (_, i) => i + 1);
      if (menus.includes('progress')) sheets.push({
        name: 'ความก้าวหน้า',
        title: `ความก้าวหน้าการจัดหา ${periodLabel(mode, fy)}`,
        notes: [periodLabel(mode, fy)],
        columns: [
          { header: 'โครงการ', key: 'project', type: 'text', width: 48 },
          { header: 'วิธีซื้อจ้าง', key: 'method', type: 'text', width: 24 },
          { header: 'ผู้ดำเนินการ', key: 'operator', type: 'text', width: 16 },
          ...stepKeys.map((n) => ({ header: `${n}. ${stepNames.find((s) => s.step_no === n)?.name ?? ''}`, key: `step${n}`, type: 'date' as const, width: 16 })),
        ],
        rows: progress.map((p) => ({ ...p, ...Object.fromEntries(stepKeys.map((n) => [`step${n}`, p.steps[String(n)] ?? null])) })),
      });
      await exportXlsx(excelFilename(`ทะเบียนพัสดุ-${mode === 'calendar' ? 'ปีพศ' : 'ปีงบ'}-${fy}`), sheets);
      notify('ส่งออก Excel ทุกทะเบียนแล้ว', 'success');
    } catch (e) {
      notify(e instanceof Error ? `ส่งออก Excel ไม่สำเร็จ: ${e.message}` : 'ส่งออก Excel ไม่สำเร็จ', 'error');
    } finally {
      setExportingAll(false);
    }
  };

  const rbac = RBAC_MATRIX[currentRole];
  const perms: Permissions = { canCreate: rbac.canCreateRecord, canEdit: rbac.canEditRecord, canDelete: rbac.canDeleteRecord };

  useEffect(() => {
    procureApi.lookups().then(setLookups).catch(() => setLookups(null));
    return () => clearTimeout(noticeTimer.current);
  }, []);

  const notify: Notify = useCallback((message, kind) => {
    clearTimeout(noticeTimer.current);
    if (kind === 'success') setChanges((n) => n + 1);
    setNotice({ message, kind });
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }, []);

  if (tabs.length === 0) {
    return (
      <p role="alert" className="gov-card p-6 text-sm font-medium text-ink-2">
        บัญชีของคุณยังไม่ได้รับสิทธิ์เข้าถึงทะเบียนใด ๆ กรุณาติดต่อผู้ดูแลระบบ
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Executive Government Header Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white/80 p-4 shadow-xs backdrop-blur-md dark:border-[var(--token-border-subtle)] dark:bg-[var(--token-surface-card)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: Title & System Status */}
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-prompt text-xl font-bold tracking-tight text-ink sm:text-2xl">
                ทะเบียนคุมใบสั่ง/สัญญา
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15">
                กองโรคติดต่อทั่วไป กรมควบคุมโรค
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-4">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-semibold ring-1 ring-inset ${
                  liveStatus === 'live'
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20'
                    : liveStatus === 'connecting'
                    ? 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20'
                    : 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20'
                }`}
                title={liveStatus === 'live' ? 'รับการเปลี่ยนแปลงจากผู้ใช้อื่นทันที' : 'ขาดการเชื่อมต่อแบบสด'}
              >
                <span className="relative flex h-2 w-2">
                  {liveStatus === 'live' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />}
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${liveStatus === 'live' ? 'bg-emerald-500' : liveStatus === 'connecting' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                </span>
                {liveStatus === 'live' ? 'ข้อมูลสด' : liveStatus === 'connecting' ? 'กำลังเชื่อมต่อ' : 'ออฟไลน์'}
              </span>

              <span className="hidden sm:inline opacity-40">|</span>
              <span className="font-mono text-ink-5">ฐานข้อมูล: dw_hp_procure</span>

              {updatedAt && (
                <>
                  <span className="opacity-40">|</span>
                  <span>
                    อัปเดต <Flash value={updatedAt.getTime()}><span className="tabular-nums font-semibold text-ink-2">{updatedAt.toLocaleTimeString('th-TH')}</span></Flash>
                  </span>
                </>
              )}

              <span className="opacity-40">|</span>
              <span className="inline-flex items-center gap-1 font-medium text-ink-3">
                <CalendarClock className="h-3.5 w-3.5 text-brand" />
                <NowChip />
              </span>
            </div>
          </div>

          {/* Right: Controls & Actions Toolbar */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            {/* Period Segmented Switch */}
            <div className="inline-flex min-h-[40px] items-center rounded-xl bg-slate-100 p-1 ring-1 ring-inset ring-slate-200 dark:bg-white/5 dark:ring-white/10">
              <button
                type="button"
                onClick={() => setMode('fiscal')}
                className={`min-h-[32px] rounded-lg px-3 text-xs font-semibold transition-all cursor-pointer ${
                  mode === 'fiscal'
                    ? 'bg-white text-slate-950 shadow-xs ring-1 ring-slate-200 dark:bg-[var(--pf-surface)] dark:text-white dark:ring-white/15'
                    : 'text-slate-600 hover:text-ink dark:text-slate-300 dark:hover:text-white'
                }`}
                title="ปีงบประมาณ (ต.ค.–ก.ย.)"
              >
                ปีงบประมาณ
              </button>
              <button
                type="button"
                onClick={() => setMode('calendar')}
                className={`min-h-[32px] rounded-lg px-3 text-xs font-semibold transition-all cursor-pointer ${
                  mode === 'calendar'
                    ? 'bg-white text-slate-950 shadow-xs ring-1 ring-slate-200 dark:bg-[var(--pf-surface)] dark:text-white dark:ring-white/15'
                    : 'text-slate-600 hover:text-ink dark:text-slate-300 dark:hover:text-white'
                }`}
                title="ปีปฏิทิน (ม.ค.–ธ.ค.)"
              >
                ปี พ.ศ.
              </button>
            </div>

            {/* Year Dropdown */}
            <div className="w-[12rem] shrink-0">
              <Select
                id="procure-fy"
                value={String(fy)}
                onValueChange={(v) => setFy(Number(v))}
                options={yearOptions(mode).map((y) => ({ value: String(y), label: `พ.ศ. ${y}${y === currentYear(mode) ? ' (ปัจจุบัน)' : ''}` }))}
                ariaLabel={mode === 'calendar' ? 'ปี พ.ศ.' : 'ปีงบประมาณ (พ.ศ.)'}
                className="min-h-[40px] w-full text-xs font-semibold"
              />
            </div>

            <div className="hidden h-6 w-px bg-slate-200 dark:bg-white/15 sm:block" />

            {/* Quick Action Buttons */}
            <button
              type="button"
              onClick={() => setShowSkr1(true)}
              className="btn-brand-outline inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold shadow-xs transition-all cursor-pointer"
              title="เปิดแบบสรุปผลการจัดซื้อจัดจ้างในรอบเดือน (แบบ สขร. 1 ตาม พ.ร.บ. ข้อมูลข่าวสาร)"
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              <span>แบบ สขร. 1</span>
            </button>

            <button
              type="button"
              onClick={() => void exportAll()}
              disabled={exportingAll}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-emerald-200/90 bg-emerald-50/90 px-3.5 py-2 text-xs font-semibold text-emerald-800 shadow-xs transition-all hover:bg-emerald-100 hover:border-emerald-300 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20 cursor-pointer disabled:opacity-60"
              title="ส่งออก Excel ข้อมูลทุกทะเบียน"
            >
              {exportingAll ? <Loader2 className="h-4 w-4 animate-spin text-emerald-700 dark:text-emerald-400" /> : <FileSpreadsheet className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden />}
              <span>ส่งออก Excel</span>
            </button>

            {/* Utility group: Refresh + Sound */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-0.5 ring-1 ring-inset ring-slate-200 dark:bg-white/5 dark:ring-white/10">
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing}
                title="โหลดข้อมูลทุกทะเบียนใหม่ทันที"
                aria-label="รีเฟรชข้อมูล"
                className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-700 hover:bg-white hover:text-emerald-700 hover:shadow-xs dark:text-slate-300 dark:hover:bg-[var(--pf-surface)] dark:hover:text-emerald-400 cursor-pointer transition disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-emerald-600' : ''}`} aria-hidden />
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = !soundOn;
                  setSoundOn(next);
                  saveSoundPref(next);
                  if (next) playChime();
                }}
                aria-pressed={soundOn}
                title={soundOn ? 'เสียงแจ้งเตือน: เปิดอยู่' : 'เปิดเสียงแจ้งเตือน'}
                aria-label="เสียงแจ้งเตือน"
                className={`inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg cursor-pointer transition ${
                  soundOn
                    ? 'bg-white text-brand shadow-xs dark:bg-[var(--pf-surface)]'
                    : 'text-slate-500 hover:bg-white hover:text-slate-800 dark:hover:bg-[var(--pf-surface)] dark:hover:text-slate-200'
                }`}
              >
                {soundOn ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div aria-live="polite" className="min-h-0">
        {liveNote && (
          <div role="status" className="flex items-center gap-2 rounded-lg bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-900 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-400/20">
            <RefreshCw className="h-4 w-4" aria-hidden />
            {liveNote}
          </div>
        )}
        {notice && (
          <div
            role={notice.kind === 'error' ? 'alert' : 'status'}
            className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold ring-1 ${
              notice.kind === 'success'
                ? 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-400/20'
                : 'bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20'
            }`}
          >
            {notice.kind === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {notice.message}
          </div>
        )}
      </div>

      <Tabs.Root value={tab} onValueChange={(v) => handleTabChange(v as TabId)}>
        <Tabs.List aria-label="หมวดทะเบียน" className="grid grid-cols-2 gap-2 pb-1 pt-1 sm:grid-cols-3 xl:grid-cols-6">
          {tabs.map((tb) => {
            const tone = TONES[tb.tone];
            const active = tab === tb.id;
            const count = tb.count && stats ? stats.counts[tb.count] : null;
            const overdue = tb.id === 'guarantees' ? (stats?.guarantees.overdue ?? 0) : 0;
            return (
              <Tabs.Trigger
                key={tb.id}
                value={tb.id}
                title={`${tb.label}: ${tb.hint}`}
                aria-label={tb.label}
                className={`group relative flex min-h-[60px] min-w-0 items-center gap-2.5 overflow-hidden rounded-xl border px-2.5 py-2 text-left transition-all duration-150 focus-visible:!outline-none focus-visible:border-[var(--brand-accent)] focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand-accent)_22%,transparent)] cursor-pointer ${
                  active
                    ? `${tone.active} shadow-sm`
                    : `border-[var(--pf-field-border)] bg-[var(--token-surface-card)] text-slate-700 dark:text-slate-200 hover:-translate-y-px hover:text-ink dark:hover:text-white ${tone.hover}`
                }`}
              >
                <span className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${active ? tone.chipActive : tone.chip}`}>
                  <tb.icon className="h-[18px] w-[18px]" aria-hidden />
                  {overdue > 0 && (
                    <span
                      className="absolute -right-1.5 -top-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-[var(--token-surface-card)]"
                      title={`เลยกำหนดคืน ${overdue} รายการ`}
                      aria-label={`เลยกำหนดคืน ${overdue} รายการ`}
                    >
                      {overdue}
                    </span>
                  )}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold leading-tight">{tb.short ?? tb.label}</span>
                  <span className={`truncate text-xs leading-tight tabular-nums ${active ? 'opacity-80' : 'text-ink-4'}`}>
                    {count !== null ? <Flash value={count} format={(n) => `${Math.round(n).toLocaleString('th-TH')} ${tb.unit}`}>{`${count.toLocaleString('th-TH')} ${tb.unit}`}</Flash> : tb.hint}
                  </span>
                </span>
                {active && <span className={`absolute inset-x-0 bottom-0 h-[3px] ${tone.bar}`} aria-hidden />}
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>

        <Tabs.Content value={tab} className="pt-5 focus-visible:outline-none">
          {tab === 'progress' ? (
            <ProgressTab fy={fy} mode={mode} lookups={lookups} perms={perms} notify={notify} />
          ) : tab === 'summary' ? (
            <SummaryTab fy={fy} mode={mode} perms={perms} notify={notify} />
          ) : (
            <RegistryTab
              key={tab}
              def={RESOURCE_DEFS[tab as keyof typeof RESOURCE_DEFS]}
              fy={fy}
              mode={mode}
              lookups={lookups}
              perms={perms}
              notify={notify}
              onCreateOrderFromIncoming={handleCreateOrderFromIncoming}
              onCreateContractFromIncoming={handleCreateContractFromIncoming}
              pendingNewRow={tab === 'orders' ? pendingNewOrder : tab === 'contracts' ? pendingNewContract : null}
              onClearPendingNewRow={() => {
                setPendingNewOrder(null);
                setPendingNewContract(null);
              }}
            />
          )}
        </Tabs.Content>
      </Tabs.Root>

      <Skr1Modal
        open={showSkr1}
        onClose={() => setShowSkr1(false)}
        fy={fy}
        mode={mode}
        notify={notify}
      />
    </div>
  );
};
