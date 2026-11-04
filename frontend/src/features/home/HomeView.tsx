import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, BellRing, CalendarDays, CheckCircle2, ClipboardList, FilePlus2, FileSignature, Inbox, ListChecks, Loader2, LockKeyhole,
  PackageCheck, ShieldCheck, ShoppingCart, Wallet,
} from 'lucide-react';
import { Select } from '../../components/ui/select';
import { useAuth } from '../auth/AuthContext';
import { auditApi, type NotificationData } from '../audit/api';
import { procureApi, type PeriodMode, type ProgressProject, type Row, type Summary } from '../procure/api';
import { Flash, useLiveReload } from '../procure/live';
import { fiscalYearOf, money, periodLabel, todayIso } from '../procure/format';
import { timeAgo } from '../audit/useNotifications';
import { ROLE_LABELS } from '../../services/enterpriseService';

interface Props {
  /** Open a register (orders, contracts, ...) in the procurement page */
  onOpen: (tab: string) => void;
  /** Go to the settings page's security section */
  onOpenSecurity: () => void;
}

const FISCAL_MONTHS = ['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.'];
const CALENDAR_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const PERIOD_OPTIONS: { id: PeriodMode; label: string }[] = [
  { id: 'fiscal', label: 'ปีงบประมาณ' },
  { id: 'calendar', label: 'ปี พ.ศ.' },
];

/** The current year for each way of counting, from today's date in Thailand */
const HISTORY_YEARS = 5;

const currentYear = (mode: PeriodMode): number => {
  const today = todayIso();
  return mode === 'calendar' ? Number(today.slice(0, 4)) + 543 : fiscalYearOf(today);
};
const STEPS = 17;
const METHOD_COLOR = ['#2563eb', '#0d9488', '#f59e0b', '#8b5cf6', '#94a3b8'];

const greeting = () => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  return h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';
};

const int = (n: number) => Math.round(n).toLocaleString('th-TH');
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

/** Month slot of an ISO date (fiscal: 0 = October, calendar: 0 = January), or null when it is outside the chosen year */
function monthSlot(iso: unknown, year: number, mode: PeriodMode): number | null {
  if (typeof iso !== 'string') return null;
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mode === 'calendar') return y + 543 === year ? mo - 1 : null;
  if (fiscalYearOf(`${y}-${String(mo).padStart(2, '0')}-01`) !== year) return null;
  return (mo + 2) % 12;
}

// ---------------------------------------------------------------------------

const Card: React.FC<{ title: string; icon: React.ElementType; action?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, icon: Icon, action, children, className = '' }) => (
  <section className={`gov-card flex flex-col ${className}`} aria-label={title}>
    <div className="flex min-h-[56px] items-center gap-2.5 border-b border-slate-200 px-5 py-2 dark:border-white/10">
      <Icon className="h-[18px] w-[18px] text-brand" aria-hidden />
      <h2 className="font-prompt text-[15px] font-bold">{title}</h2>
      {action && <div className="ml-auto">{action}</div>}
    </div>
    <div className="min-h-0 flex-1 p-5">{children}</div>
  </section>
);

const Kpi: React.FC<{ icon: React.ElementType; tone: string; label: string; value: number; format?: (n: number) => string; sub: string; onClick?: () => void; warn?: boolean }> = ({ icon: Icon, tone, label, value, format = int, sub, onClick, warn }) => {
  const body = (
    <>
      <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`} aria-hidden>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-xs font-semibold text-ink-4">{label}</span>
        <span className={`block font-prompt text-2xl font-bold leading-tight tabular-nums ${warn ? 'text-amber-700 dark:text-amber-300' : ''}`}>
          <Flash value={value} format={format}>{format(value)}</Flash>
        </span>
        <span className="block truncate text-xs text-ink-4">{sub}</span>
      </span>
    </>
  );
  const cls = 'gov-card flex items-center gap-3.5 px-4 py-4 transition-all';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-strong)]`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
};

type ChartKind = 'bar' | 'line' | 'area';
type ChartMetric = 'count' | 'amount';

const KIND_OPTIONS: { id: ChartKind; label: string }[] = [
  { id: 'bar', label: 'แท่ง' },
  { id: 'line', label: 'เส้น' },
  { id: 'area', label: 'พื้นที่' },
];
const METRIC_OPTIONS: { id: ChartMetric; label: string }[] = [
  { id: 'count', label: 'จำนวน' },
  { id: 'amount', label: 'มูลค่า' },
];

/** Round the axis maximum up to 1 / 2 / 2.5 / 5 x 10^n so the four grid steps stay readable */
function niceTop(max: number): number {
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * pow >= max) ?? 10;
  return step * pow;
}

const axisLabel = (v: number, metric: ChartMetric): string => {
  if (metric === 'count') return String(Math.round(v));
  if (v >= 1_000_000) return `${+(v / 1_000_000).toFixed(1)} ล้าน`;
  if (v >= 1_000) return `${+(v / 1_000).toFixed(1)} พัน`;
  return String(Math.round(v));
};

const Segmented = <T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) => (
  <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-slate-100 p-0.5 ring-1 ring-inset ring-slate-200 dark:bg-white/5 dark:ring-white/10">
    {options.map((o) => (
      <button
        key={o.id}
        type="button"
        role="radio"
        aria-checked={value === o.id}
        onClick={() => onChange(o.id)}
        className={`min-h-[28px] rounded-md px-2.5 text-xs font-semibold transition-colors cursor-pointer ${
          value === o.id ? 'bg-white text-slate-950 shadow-xs dark:bg-[var(--pf-surface)] dark:text-white' : 'text-slate-600 hover:text-ink dark:text-slate-300 dark:hover:text-white'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

/** Orders and contracts per fiscal-year month, as bars, lines or areas, by count or by value */
const TrendChart: React.FC<{ orders: number[]; contracts: number[]; kind: ChartKind; metric: ChartMetric; mode: PeriodMode }> = ({ orders, contracts, kind, metric, mode }) => {
  const months = mode === 'calendar' ? CALENDAR_MONTHS : FISCAL_MONTHS;
  const max = Math.max(1, ...orders, ...contracts);
  const top = metric === 'count' ? Math.max(4, Math.ceil(max / 4) * 4) : niceTop(max);
  const W = 640;
  const H = 220;
  const pad = { l: metric === 'count' ? 30 : 52, r: 8, t: 10, b: 26 };
  const cw = (W - pad.l - pad.r) / 12;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const cx = (i: number) => pad.l + i * cw + cw / 2;
  const tip = (m: string, label: string, v: number) => (metric === 'count' ? `${m} · ${label} ${v} รายการ` : `${m} · ${label} ${money(v)} บาท`);
  const series = [
    { label: 'ใบสั่ง', values: orders, color: 'var(--brand-strong, #1d4ed8)' },
    { label: 'สัญญา', values: contracts, color: '#14b8a6' },
  ];
  const linePath = (values: number[]) => values.map((v, i) => `${i === 0 ? 'M' : 'L'}${cx(i)},${y(v)}`).join(' ');
  const areaPath = (values: number[]) => `${linePath(values)} L${cx(11)},${y(0)} L${cx(0)},${y(0)} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${metric === 'count' ? 'จำนวน' : 'มูลค่า'}ใบสั่งและสัญญาแยกตามเดือน`} className="h-auto w-full">
        {[0, 0.25, 0.5, 0.75, 1].map((fr) => (
          <g key={fr}>
            <line x1={pad.l} x2={W - pad.r} y1={y(top * fr)} y2={y(top * fr)} className="stroke-slate-200 dark:stroke-white/10" strokeWidth={1} />
            <text x={pad.l - 6} y={y(top * fr) + 4} textAnchor="end" className="fill-slate-500 text-[10px] dark:fill-slate-400">{axisLabel(top * fr, metric)}</text>
          </g>
        ))}
        {months.map((m, i) => (
          <text key={m} x={cx(i)} y={H - 8} textAnchor="middle" className="fill-slate-600 text-[10.5px] dark:fill-slate-300">{m}</text>
        ))}
        {kind === 'bar' &&
          months.map((m, i) => {
            const bw = Math.min(14, cw * 0.32);
            return (
              <g key={m}>
                {series.map((sr, k) =>
                  sr.values[i] > 0 ? (
                    <rect key={sr.label} x={cx(i) + (k === 0 ? -bw - 1.5 : 1.5)} y={y(sr.values[i])} width={bw} height={Math.max(2, y(0) - y(sr.values[i]))} rx={3} fill={sr.color}>
                      <title>{tip(m, sr.label, sr.values[i])}</title>
                    </rect>
                  ) : null
                )}
              </g>
            );
          })}
        {kind !== 'bar' &&
          series.map((sr) => (
            <g key={sr.label}>
              {kind === 'area' && <path d={areaPath(sr.values)} fill={sr.color} fillOpacity={0.18} />}
              <path d={linePath(sr.values)} fill="none" stroke={sr.color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
              {months.map((m, i) => (
                <circle key={m} cx={cx(i)} cy={y(sr.values[i])} r={sr.values[i] > 0 ? 3.5 : 0} fill={sr.color} className="stroke-white dark:stroke-slate-900" strokeWidth={1.5}>
                  <title>{tip(m, sr.label, sr.values[i])}</title>
                </circle>
              ))}
            </g>
          ))}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-4 text-xs font-medium text-ink-3">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--brand-strong,#1d4ed8)]" /> ใบสั่ง</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-teal-500" /> สัญญา</span>
        <span className="ml-auto text-ink-5">นับตามวันที่ลงเอกสาร ({months[0]} – {months[11]}){metric === 'amount' ? ' · หน่วย: บาท' : ''}</span>
      </div>
    </div>
  );
};

const Donut: React.FC<{ parts: { label: string; value: number; amount: number }[] }> = ({ parts }) => {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center justify-center gap-5">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0" role="img" aria-label="สัดส่วนวิธีจัดซื้อจัดจ้าง">
        <circle cx="70" cy="70" r={R} fill="none" strokeWidth="18" className="stroke-slate-200 dark:stroke-white/10" />
        {total > 0 &&
          parts.map((p, i) => {
            const len = (p.value / total) * C;
            const el = (
              <circle key={p.label} cx="70" cy="70" r={R} fill="none" strokeWidth="18" stroke={METHOD_COLOR[i % METHOD_COLOR.length]} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)">
                <title>{`${p.label}: ${p.value} รายการ`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        <text x="70" y="66" textAnchor="middle" className="fill-slate-900 font-prompt text-[22px] font-bold dark:fill-white">{total}</text>
        <text x="70" y="84" textAnchor="middle" className="fill-slate-500 text-[10px] dark:fill-slate-400">รายการ</text>
      </svg>
      <ul className="min-w-[12rem] flex-1 space-y-2 text-sm">
        {parts.map((p, i) => (
          <li key={p.label} className="flex items-center gap-2.5">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: METHOD_COLOR[i % METHOD_COLOR.length] }} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{p.label}</span>
            <span className="font-semibold tabular-nums">{p.value}</span>
            <span className="w-20 text-right text-xs tabular-nums text-ink-4">{money(p.amount)}</span>
          </li>
        ))}
        {total === 0 && <li className="text-ink-4">ยังไม่มีข้อมูลในปีนี้</li>}
      </ul>
    </div>
  );
};

const ACTION_TH: Record<string, string> = { create: 'เพิ่ม', update: 'แก้ไข', delete: 'ลบ' };

// ---------------------------------------------------------------------------

export const HomeView: React.FC<Props> = ({ onOpen, onOpenSecurity }) => {
  const { user, security } = useAuth();
  const menus = user?.menus ?? [];
  const has = (m: string) => menus.includes(m);
  const [mode, setMode] = useState<PeriodMode>('fiscal');
  const [pickedYear, setPickedYear] = useState<number | null>(null);
  const nowYear = currentYear(mode);
  const fy = pickedYear ?? nowYear;
  const yearChoices = Array.from({ length: HISTORY_YEARS + 1 }, (_, i) => nowYear - i);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [orders, setOrders] = useState<Row[]>([]);
  const [contracts, setContracts] = useState<Row[]>([]);
  const [progress, setProgress] = useState<ProgressProject[]>([]);
  const [bell, setBell] = useState<NotificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartKind, setChartKind] = useState<ChartKind>('bar');
  const [chartMetric, setChartMetric] = useState<ChartMetric>('count');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, o, c, p, n] = await Promise.all([
        has('summary') || has('orders') || has('contracts') ? procureApi.summary(fy, mode).catch(() => null) : Promise.resolve(null),
        has('orders') ? procureApi.list('orders', fy, undefined, mode) : Promise.resolve([] as Row[]),
        has('contracts') ? procureApi.list('contracts', fy, undefined, mode) : Promise.resolve([] as Row[]),
        has('progress') ? procureApi.progress(fy, mode) : Promise.resolve([] as ProgressProject[]),
        auditApi.notifications().catch(() => null),
      ]);
      setSummary(s);
      setOrders(o);
      setContracts(c);
      setProgress(p);
      setBell(n);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy, mode, menus.join(',')]);

  useEffect(() => {
    void load();
  }, [load]);
  useLiveReload(['orders', 'contracts', 'incoming', 'guarantees', 'progress'], load);

  const stats = useMemo(() => {
    const rows = [...orders, ...contracts];
    const sum = (list: Row[]) => list.reduce((s, r) => s + num(r.agreed_price ?? r.budget_amount), 0);
    const byMonth = (list: Row[], amount = false) => {
      const out = Array<number>(12).fill(0);
      for (const r of list) {
        const slot = monthSlot(r.doc_date ?? r.received_date, fy, mode);
        if (slot !== null) out[slot] += amount ? num(r.agreed_price ?? r.budget_amount) : 1;
      }
      return out;
    };
    return {
      orderValue: sum(orders),
      contractValue: sum(contracts),
      notInspected: rows.filter((r) => !r.inspected_date).length,
      notDisbursed: rows.filter((r) => !r.disbursed_date).length,
      monthOrders: byMonth(orders),
      monthContracts: byMonth(contracts),
      monthOrderAmounts: byMonth(orders, true),
      monthContractAmounts: byMonth(contracts, true),
    };
  }, [orders, contracts, fy, mode]);

  const methods = useMemo(() => {
    if (!summary) return [];
    return summary.orders
      .map((b, i) => ({ label: b.label.replace(/^วิธี/, ''), value: b.count + summary.contracts[i].count, amount: b.amount + summary.contracts[i].amount }))
      .filter((p) => p.value > 0);
  }, [summary]);

  const avgProgress = progress.length ? Math.round((progress.reduce((s, p) => s + Object.values(p.steps).filter(Boolean).length, 0) / (progress.length * STEPS)) * 100) : 0;
  const todayLabel = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { timeZone: 'Asia/Bangkok', dateStyle: 'full' }).format(new Date());
  const alerts = bell?.alerts ?? [];
  const items = (bell?.items ?? []).slice(0, 6);

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-ink-4">
        <Loader2 className="h-7 w-7 animate-spin" aria-label="กำลังโหลด" />
      </div>
    );
  }

  const quick = [
    has('incoming') && { tab: 'incoming', label: 'หนังสือรับ', icon: Inbox },
    has('orders') && { tab: 'orders', label: 'ทะเบียนใบสั่งซื้อ/จ้าง', icon: ShoppingCart },
    has('contracts') && { tab: 'contracts', label: 'ทะเบียนสัญญา', icon: FileSignature },
    has('guarantees') && { tab: 'guarantees', label: 'หลักประกันสัญญา', icon: ShieldCheck },
    has('progress') && { tab: 'progress', label: 'ความก้าวหน้า', icon: ListChecks },
    has('summary') && { tab: 'summary', label: 'รายงานสรุป', icon: ClipboardList },
  ].filter(Boolean) as { tab: string; label: string; icon: React.ElementType }[];

  return (
    <div className="mx-auto max-w-[2200px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      {/* Welcome */}
      <header
        className="relative overflow-hidden rounded-xl px-4 py-3 text-white shadow-md sm:px-5"
        style={{ background: 'linear-gradient(120deg, var(--brand-strong) 0%, var(--brand-primary) 100%)' }}
      >
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-prompt text-lg font-bold leading-tight sm:text-xl">
              {greeting()}, {user?.displayName}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-white/85">
              <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" aria-hidden /> {todayLabel}</span>
              <span aria-hidden>·</span>
              <span>{user?.position ? `${user.position} · ` : ''}{user ? ROLE_LABELS[user.role] : ''}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="เลือกวิธีนับปี" className="inline-flex items-center gap-0.5 rounded-full bg-white/20 p-0.5 ring-1 ring-white/30">
              {PERIOD_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === o.id}
                  onClick={() => {
                    setMode(o.id);
                    setPickedYear(null);
                  }}
                  title={o.id === 'fiscal' ? 'ปีงบประมาณ (ต.ค.–ก.ย.)' : 'ปีปฏิทิน (ม.ค.–ธ.ค.)'}
                  className={`min-h-[28px] rounded-full px-3 text-xs font-bold transition-colors cursor-pointer ${mode === o.id ? 'bg-white text-slate-900 shadow-xs' : 'text-white/85 hover:text-white'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <Select
              key={mode}
              ariaLabel={mode === 'calendar' ? 'เลือกปี พ.ศ.' : 'เลือกปีงบประมาณ'}
              value={String(fy)}
              onValueChange={(v) => setPickedYear(Number(v) === nowYear ? null : Number(v))}
              options={yearChoices.map((y) => ({ value: String(y), label: `${y}${y === nowYear ? ' (ปัจจุบัน)' : ''}` }))}
              className="!min-h-[32px] !rounded-full !border-0 !bg-white/20 !px-3 text-xs font-bold !text-white ring-1 ring-white/30 hover:!bg-white/30"
            />
            {has('orders') && (
              <button type="button" onClick={() => onOpen('orders')} className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-white px-3.5 text-sm font-bold text-slate-900 shadow-sm hover:bg-slate-100 cursor-pointer">
                <FilePlus2 className="h-4 w-4 text-[var(--brand-strong)]" aria-hidden /> เปิดทะเบียนใบสั่ง
              </button>
            )}
          </div>
        </div>
      </header>

      {error && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20">{error}</p>}

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {has('orders') && (
          <Kpi icon={ShoppingCart} tone="bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" label="ใบสั่งซื้อ/จ้าง" value={summary?.counts.orders ?? orders.length} sub={`มูลค่า ${money(stats.orderValue)} บาท`} onClick={() => onOpen('orders')} />
        )}
        {has('contracts') && (
          <Kpi icon={FileSignature} tone="bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300" label="สัญญา" value={summary?.counts.contracts ?? contracts.length} sub={`มูลค่า ${money(stats.contractValue)} บาท`} onClick={() => onOpen('contracts')} />
        )}
        {(has('orders') || has('contracts')) && (
          <Kpi icon={Wallet} tone="bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" label="มูลค่ารวม (บาท)" value={stats.orderValue + stats.contractValue} format={(n) => money(n)} sub="ราคาที่ตกลง (หรือวงเงินที่ได้รับจัดสรร)" />
        )}
        {(has('orders') || has('contracts')) && (
          <Kpi icon={PackageCheck} tone="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" label="ยังไม่ตรวจรับ" value={stats.notInspected} warn={stats.notInspected > 0} sub="ใบสั่งและสัญญาที่ยังไม่มีวันที่ตรวจรับ" onClick={() => onOpen(has('orders') ? 'orders' : 'contracts')} />
        )}
        {has('incoming') && (
          <Kpi icon={Inbox} tone="bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" label="หนังสือรับ" value={summary?.counts.incoming ?? 0} sub="ในปีงบประมาณนี้" onClick={() => onOpen('incoming')} />
        )}
        {has('guarantees') && (
          <Kpi icon={ShieldCheck} tone="bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" label="หลักประกันรอคืน" value={summary?.guarantees.pending ?? 0} warn={(summary?.guarantees.overdue ?? 0) > 0} sub={`เลยกำหนด ${summary?.guarantees.overdue ?? 0} · ใกล้ครบ ${summary?.guarantees.dueSoon ?? 0}`} onClick={() => onOpen('guarantees')} />
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* Trend */}
        {(has('orders') || has('contracts')) && (
          <Card title="ใบสั่งและสัญญารายเดือน" icon={ClipboardList} className="xl:col-span-2" action={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Segmented options={METRIC_OPTIONS} value={chartMetric} onChange={setChartMetric} label="ตัวชี้วัดกราฟ" />
                <Segmented options={KIND_OPTIONS} value={chartKind} onChange={setChartKind} label="ชนิดกราฟ" />
                <span className="text-xs font-semibold text-ink-4">{periodLabel(mode, fy)}</span>
              </div>
            }>
            <TrendChart
              orders={chartMetric === 'count' ? stats.monthOrders : stats.monthOrderAmounts}
              contracts={chartMetric === 'count' ? stats.monthContracts : stats.monthContractAmounts}
              kind={chartKind}
              metric={chartMetric}
              mode={mode}
            />
          </Card>
        )}

        {/* Needs attention */}
        <Card
          title="ต้องติดตาม"
          icon={BellRing}
          action={alerts.length > 0 ? <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">{alerts.length}</span> : undefined}
        >
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-500" aria-hidden />
              <p className="font-semibold">ไม่มีเรื่องค้าง</p>
              <p className="text-sm text-ink-4">ทุกอย่างอยู่ในกำหนด</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {alerts.map((a) => (
                <li key={a.key}>
                  <button
                    type="button"
                    onClick={() => onOpen(a.tab)}
                    className={`group flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                      a.tone === 'bad' ? 'border-rose-200 bg-rose-50 hover:bg-rose-100/70 dark:border-rose-400/25 dark:bg-rose-500/10 dark:hover:border-rose-400/45 dark:hover:bg-rose-500/20' : 'border-amber-200 bg-amber-50 hover:bg-amber-100/70 dark:border-amber-400/25 dark:bg-amber-500/10 dark:hover:border-amber-400/45 dark:hover:bg-amber-500/20'
                    }`}
                  >
                    <span className={`mt-0.5 inline-flex h-7 min-w-[28px] items-center justify-center rounded-full px-2 text-xs font-bold text-white ${a.tone === 'bad' ? 'bg-rose-600' : 'bg-amber-600'}`}>{a.count}</span>
                    <span className="min-w-0 flex-1 text-sm font-medium text-ink">{a.text}</span>
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5 dark:text-slate-400 dark:group-hover:text-slate-200" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Methods */}
        {(has('orders') || has('contracts')) && (
          <Card title="วิธีจัดซื้อจัดจ้าง" icon={ListChecks}>
            <Donut parts={methods} />
          </Card>
        )}

        {/* Progress */}
        {has('progress') && (
          <Card title="ความก้าวหน้าการจัดหา" icon={ListChecks} action={<button type="button" onClick={() => onOpen('progress')} className="inline-flex min-h-[32px] items-center gap-1 text-xs font-semibold text-brand cursor-pointer hover:underline">ดูทั้งหมด <ArrowRight className="h-3.5 w-3.5" aria-hidden /></button>}>
            {progress.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-4">ยังไม่มีโครงการที่ติดตามความก้าวหน้า</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-baseline gap-2">
                  <span className="font-prompt text-3xl font-bold tabular-nums">{avgProgress}%</span>
                  <span className="text-sm text-ink-4">เฉลี่ย {progress.length} โครงการ</span>
                </div>
                <ul className="space-y-3">
                  {progress.slice(0, 5).map((p) => {
                    const done = Object.values(p.steps).filter(Boolean).length;
                    return (
                      <li key={p.id}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 flex-1 truncate font-medium">{p.project}</span>
                          <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-4">{done}/{STEPS}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={STEPS} aria-valuenow={done}>
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(done / STEPS) * 100}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Card>
        )}

        {/* Activity */}
        <Card title="ความเคลื่อนไหวล่าสุด" icon={BellRing}>
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-4">ยังไม่มีการเปลี่ยนแปลงจากผู้ใช้อื่น</p>
          ) : (
            <ol className="relative space-y-4 border-l-2 border-slate-200 pl-4 dark:border-white/10">
              {items.map((it) => (
                <li key={it.id} className="relative text-sm">
                  <span className={`absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-[var(--token-surface-card,#fff)] ${it.action === 'delete' ? 'bg-rose-500' : it.action === 'create' ? 'bg-emerald-500' : 'bg-sky-500'}`} aria-hidden />
                  <p className="font-medium leading-snug">{it.summary}</p>
                  <p className="text-xs text-ink-4">{it.actorName} · {ACTION_TH[it.action] ?? it.action} · {timeAgo(it.at)}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {/* Shortcuts and account */}
        {quick.length > 0 && (
          <Card title="ทางลัด" icon={ArrowRight} className="xl:col-span-2">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {quick.map((q) => (
                <button key={q.tab} type="button" onClick={() => onOpen(q.tab)} className="group flex min-h-[56px] items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-2 sm:px-4 text-left text-sm font-semibold transition-colors hover:border-[var(--brand-strong)] hover:bg-brand-soft dark:border-white/10 cursor-pointer">
                  <q.icon className="h-[18px] w-[18px] shrink-0 text-brand" aria-hidden />
                  <span className="min-w-0 leading-snug" title={q.label}>{q.label}</span>
                  <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </button>
              ))}
            </div>
          </Card>
        )}
        <Card title="ความปลอดภัยบัญชีของฉัน" icon={LockKeyhole} action={<button type="button" onClick={onOpenSecurity} className="inline-flex min-h-[32px] items-center gap-1 text-xs font-semibold text-brand cursor-pointer hover:underline">จัดการ <ArrowRight className="h-3.5 w-3.5" aria-hidden /></button>}>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-center justify-between gap-3"><span>ยืนยัน 2 ขั้นตอน (Google Authenticator)</span><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${security.totpEnabled ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25' : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10'}`}>{security.totpEnabled ? 'เปิดใช้' : 'ยังไม่เปิด'}</span></li>
              <li className="flex items-center justify-between gap-3"><span>PIN ล็อกหน้าจอ</span><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${security.hasPin ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25' : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10'}`}>{security.hasPin ? `เปิดใช้ · ${security.lockMinutes} น.` : 'ยังไม่ตั้ง'}</span></li>
            </ul>
          </Card>
      </div>
    </div>
  );
};
