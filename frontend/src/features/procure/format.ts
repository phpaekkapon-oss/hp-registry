const dateFmt = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const moneyFmt = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** '2026-10-01' -> '1 ต.ค. 2569' (the registry is kept in พ.ศ.) */
export function thaiDate(iso: unknown): string {
  if (typeof iso !== 'string') return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return dateFmt.format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
}

export function money(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? '' : moneyFmt.format(n);
}

/** All dates and "today" in this system are Thailand time (UTC+7), whatever the viewer's PC clock says */
export const THAI_TZ = 'Asia/Bangkok';

const bangkokDay = new Intl.DateTimeFormat('en-CA', { timeZone: THAI_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const bangkokStamp = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  timeZone: THAI_TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Today's date in Thailand as 'YYYY-MM-DD' (Gregorian) */
export function todayIso(): string {
  return bangkokDay.format(new Date());
}

/** 'now' for stamps such as exports: '23 ต.ค. 2569 14:35 น.' */
export function thaiNowStamp(): string {
  return `${bangkokStamp.format(new Date())} น.`;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function toIso(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? { y, m: mo, d } : null;
}

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Add days to an ISO date */
export function addDays(iso: string, days: number): string {
  const p = parseIso(iso)!;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** '2026-10-23' -> '23/10/2569' */
export function thaiNumericDate(iso: string): string {
  const p = parseIso(iso);
  return p ? `${pad2(p.d)}/${pad2(p.m)}/${p.y + 543}` : '';
}

/**
 * Parse typed text such as '23/10/2569' (also '-' or '.' separators). A year of 2400 or more is read as
 * พ.ศ.; a four-digit year below that is read as ค.ศ. A two-digit year is read as the last two digits of
 * the current พ.ศ. century. Returns null when it is not a real calendar date.
 */
export function parseThaiNumericDate(text: string): string | null {
  const m = /^\s*(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2}|\d{4})\s*$/.exec(text);
  if (!m) return null;
  let year = +m[3];
  if (m[3].length === 2) year = 2500 + year;
  if (year >= 2400) year -= 543;
  const iso = toIso(year, +m[2], +m[1]);
  return year >= 1900 && year <= 2200 && parseIso(iso) ? iso : null;
}

/** Whole days from today (Thailand) to an ISO date (negative = already past) */
export function daysUntil(iso: string): number {
  const a = parseIso(iso);
  const b = parseIso(todayIso())!;
  if (!a) return 0;
  return Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86_400_000);
}

/** Download rows as a CSV that Excel opens correctly with Thai text (UTF-8 BOM) */
export function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const body = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function statusTone(status: unknown): string {
  const s = typeof status === 'string' ? status : '';
  if (/ยกเลิก/.test(s)) return 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20';
  if (/ยังไม่ดำเนินการ/.test(s)) return 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-400/20';
  if (/ระหว่างการดำเนินการ/.test(s)) return 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20';
  if (/ส่งเบิก|ตรวจรับ|เสร็จ|สิ้นสุดสัญญา/.test(s)) return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20';
  if (/บริหารสัญญา|ลงนาม/.test(s)) return 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20';
  return 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20';
}

/** The fiscal year (พ.ศ.) a date falls in: October starts the next fiscal year */
export function fiscalYearOf(iso: string): number {
  const p = parseIso(iso);
  const d = p ?? parseIso(todayIso())!;
  return d.y + 543 + (d.m >= 10 ? 1 : 0);
}

/** "ปีงบประมาณ 2570" or "ปี พ.ศ. 2569" */
export const periodLabel = (mode: 'fiscal' | 'calendar', year: number) => (mode === 'calendar' ? `ปี พ.ศ. ${year}` : `ปีงบประมาณ ${year}`);

/** Who is exporting (name · position): printed in the header of every Excel export */
let exporter = '';
export const setExporter = (text: string) => {
  exporter = text;
};
export const getExporter = () => exporter;
