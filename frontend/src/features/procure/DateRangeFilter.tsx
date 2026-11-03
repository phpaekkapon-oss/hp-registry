import React from 'react';
import { CalendarRange } from 'lucide-react';
import { ThaiDatePicker } from '../../components/ui/thai-date-picker';
import { Select } from '../../components/ui/select';
import { addDays, daysInMonth, parseIso, toIso, todayIso } from './format';

export interface DateRange {
  /** Which date column is filtered */
  key: string;
  from: string;
  to: string;
  preset: PresetId;
}

export type PresetId = 'all' | 'today' | 'last7' | 'last30' | 'month' | 'quarter' | 'fiscal' | 'custom';

const PRESETS: { id: PresetId; label: (fy: number) => string }[] = [
  { id: 'all', label: () => 'ทั้งหมด' },
  { id: 'today', label: () => 'วันนี้' },
  { id: 'last7', label: () => '7 วันที่ผ่านมา' },
  { id: 'last30', label: () => '30 วันที่ผ่านมา' },
  { id: 'month', label: () => 'เดือนนี้' },
  { id: 'quarter', label: () => 'ไตรมาสนี้ (ปีงบประมาณ)' },
  { id: 'fiscal', label: (fy) => `ปีงบประมาณ ${fy}` },
  { id: 'custom', label: () => 'กำหนดเอง' },
];

/** from/to (ISO, inclusive) for a preset, using today in Thailand. Thai fiscal year: 1 Oct – 30 Sep. */
export function presetRange(preset: PresetId, fy: number): { from: string; to: string } {
  const today = todayIso();
  const t = parseIso(today)!;
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'month':
      return { from: toIso(t.y, t.m, 1), to: toIso(t.y, t.m, daysInMonth(t.y, t.m)) };
    case 'quarter': {
      // Fiscal quarters start in Oct, Jan, Apr, Jul
      const startMonth = [1, 4, 7, 10].filter((m) => m <= t.m).pop()!;
      const endMonth = startMonth + 2;
      return { from: toIso(t.y, startMonth, 1), to: toIso(t.y, endMonth, daysInMonth(t.y, endMonth)) };
    }
    case 'fiscal':
      return { from: toIso(fy - 543 - 1, 10, 1), to: toIso(fy - 543, 9, 30) };
    default:
      return { from: '', to: '' };
  }
}

export const emptyRange = (key: string): DateRange => ({ key, from: '', to: '', preset: 'all' });
export const isRangeActive = (r: DateRange) => Boolean(r.from || r.to);

/** Keep rows whose chosen date falls inside the range (rows with no date are dropped once a range is set) */
export function inRange<T extends Record<string, unknown>>(row: T, r: DateRange): boolean {
  if (!isRangeActive(r)) return true;
  const v = row[r.key];
  if (typeof v !== 'string' || v === '') return false;
  return (!r.from || v >= r.from) && (!r.to || v <= r.to);
}

interface Props {
  fields: { key: string; label: string }[];
  fy: number;
  value: DateRange;
  onChange: (next: DateRange) => void;
}

export const DateRangeFilter: React.FC<Props> = ({ fields, fy, value, onChange }) => {
  const set = (patch: Partial<DateRange>) => onChange({ ...value, ...patch });
  const invalidOrder = value.from && value.to && value.from > value.to;

  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2" role="group" aria-label="กรองตามช่วงวันที่">
      <span className="flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-ink-2">
        <CalendarRange className="h-4 w-4" aria-hidden /> ช่วงวันที่
      </span>
      {fields.length > 1 && (
        <Select
          value={value.key}
          onValueChange={(v) => set({ key: v })}
          options={fields.map((f) => ({ value: f.key, label: f.label }))}
          ariaLabel="ฟิลด์วันที่ที่ใช้กรอง"
          className="mt-1 max-w-[14rem]"
        />
      )}
      <Select
        value={value.preset}
        onValueChange={(v) => {
          const preset = v as PresetId;
          onChange({ ...value, preset, ...(preset === 'custom' ? {} : presetRange(preset, fy)) });
        }}
        options={PRESETS.map((p) => ({ value: p.id, label: p.label(fy) }))}
        ariaLabel="ช่วงเวลาสำเร็จรูป"
        className="mt-1"
      />
      <span className="flex min-h-[44px] items-center text-sm text-ink-3">ตั้งแต่</span>
      <div className="w-48">
        <ThaiDatePicker value={value.from} onChange={(iso) => set({ from: iso, preset: 'custom' })} ariaLabel="ตั้งแต่วันที่" placeholder="วว/ดด/ปปปป" max={value.to || undefined} compact />
      </div>
      <span className="flex min-h-[44px] items-center text-sm text-ink-3">ถึง</span>
      <div className="w-48">
        <ThaiDatePicker value={value.to} onChange={(iso) => set({ to: iso, preset: 'custom' })} ariaLabel="ถึงวันที่" placeholder="วว/ดด/ปปปป" min={value.from || undefined} compact />
      </div>
      {isRangeActive(value) && (
        <button
          type="button"
          onClick={() => onChange(emptyRange(value.key))}
          className="min-h-[44px] rounded-lg px-2 text-sm font-semibold text-slate-800 underline-offset-2 hover:underline dark:text-slate-200 cursor-pointer"
        >
          ล้างช่วงวันที่
        </button>
      )}
      {invalidOrder && (
        <p role="alert" className="basis-full text-sm font-semibold text-rose-700 dark:text-rose-300">
          วันที่เริ่มต้นอยู่หลังวันที่สิ้นสุด
        </p>
      )}
    </div>
  );
};
