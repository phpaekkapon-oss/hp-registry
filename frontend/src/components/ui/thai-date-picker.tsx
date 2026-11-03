import * as React from 'react';
import * as Popover from '@radix-ui/react-popover';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { addDays, daysInMonth, parseIso, parseThaiNumericDate, thaiNumericDate, todayIso, toIso } from '../../features/procure/format';
import { cn } from '../../lib/utils';
import { Select } from './select';

const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const WEEKDAYS_FULL = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];

interface ThaiDatePickerProps {
  /** ISO date 'YYYY-MM-DD' (Gregorian) or '' */
  value: string;
  onChange: (iso: string) => void;
  id?: string;
  disabled?: boolean;
  /** Inclusive limits, ISO dates */
  min?: string;
  max?: string;
  ariaLabel?: string;
  className?: string;
  placeholder?: string;
  /** Hide the full Thai date line shown under the input */
  compact?: boolean;
}

const fieldCls = 'pf-field w-full min-h-[44px] rounded-lg pl-3 pr-20 py-2 text-sm';

/** Long form shown under the field, e.g. 'วันศุกร์ที่ 23 ตุลาคม พ.ศ. 2569' */
function longThai(iso: string): string {
  const p = parseIso(iso);
  if (!p) return '';
  const wd = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return `${WEEKDAYS_FULL[wd]}ที่ ${p.d} ${MONTHS[p.m - 1]} พ.ศ. ${p.y + 543}`;
}

export const ThaiDatePicker: React.FC<ThaiDatePickerProps> = ({ value, onChange, id, disabled, min, max, ariaLabel, className, placeholder = 'วว/ดด/ปปปป (พ.ศ.)', compact }) => {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<string | null>(null);
  const [invalid, setInvalid] = React.useState(false);
  const today = todayIso();

  // Month shown in the calendar and the day that holds keyboard focus
  const seed = parseIso(value) ?? parseIso(today)!;
  const [view, setView] = React.useState({ y: seed.y, m: seed.m });
  const [focusIso, setFocusIso] = React.useState(value || today);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const shouldFocus = React.useRef(false);

  const inRange = (iso: string) => (!min || iso >= min) && (!max || iso <= max);

  const openCalendar = () => {
    const p = parseIso(value) ?? parseIso(today)!;
    setView({ y: p.y, m: p.m });
    setFocusIso(value || today);
    setOpen(true);
  };

  const commitText = () => {
    if (draft === null) return;
    const text = draft.trim();
    setDraft(null);
    if (text === '') {
      setInvalid(false);
      if (value) onChange('');
      return;
    }
    const iso = parseThaiNumericDate(text);
    if (iso && inRange(iso)) {
      setInvalid(false);
      if (iso !== value) onChange(iso);
    } else {
      setInvalid(true);
    }
  };

  const pick = (iso: string) => {
    setInvalid(false);
    setDraft(null);
    onChange(iso);
    setOpen(false);
  };

  // Move keyboard focus into the grid after a navigation key
  React.useEffect(() => {
    if (!open || !shouldFocus.current) return;
    shouldFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusIso}"]`)?.focus();
  }, [focusIso, open, view]);

  const moveFocus = (iso: string) => {
    const p = parseIso(iso)!;
    shouldFocus.current = true;
    setFocusIso(iso);
    setView({ y: p.y, m: p.m });
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    const p = parseIso(focusIso)!;
    const shiftMonth = (delta: number) => {
      const t = new Date(Date.UTC(p.y, p.m - 1 + delta, 1));
      const y = t.getUTCFullYear();
      const m = t.getUTCMonth() + 1;
      return toIso(y, m, Math.min(p.d, daysInMonth(y, m)));
    };
    const keys: Record<string, string> = {
      ArrowLeft: addDays(focusIso, -1),
      ArrowRight: addDays(focusIso, 1),
      ArrowUp: addDays(focusIso, -7),
      ArrowDown: addDays(focusIso, 7),
      PageUp: shiftMonth(-1),
      PageDown: shiftMonth(1),
      Home: toIso(p.y, p.m, 1),
      End: toIso(p.y, p.m, daysInMonth(p.y, p.m)),
    };
    if (keys[e.key]) {
      e.preventDefault();
      moveFocus(keys[e.key]);
    }
  };

  const stepMonth = (delta: number) => {
    const t = new Date(Date.UTC(view.y, view.m - 1 + delta, 1));
    setView({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 });
  };

  // 6 rows x 7 columns starting on the Sunday on/before the 1st
  const first = new Date(Date.UTC(view.y, view.m - 1, 1)).getUTCDay();
  const cells = Array.from({ length: 42 }, (_, i) => addDays(toIso(view.y, view.m, 1), i - first));

  const years = React.useMemo(() => {
    const base = parseIso(today)!.y;
    const list = new Set<number>();
    for (let y = base - 12; y <= base + 6; y++) list.add(y);
    list.add(view.y);
    return [...list].sort((a, b) => a - b);
  }, [today, view.y]);

  const shown = draft ?? (value ? thaiNumericDate(value) : '');

  return (
    <div className={cn('min-w-0', className)}>
      <Popover.Root open={open} onOpenChange={(o) => (o ? openCalendar() : setOpen(false))}>
        <Popover.Anchor asChild>
          <div className="relative">
            <input
              id={id}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={shown}
              disabled={disabled}
              placeholder={placeholder}
              aria-label={ariaLabel}
              aria-invalid={invalid || undefined}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitText}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draft !== null) {
                  e.preventDefault();
                  commitText();
                } else if (e.key === 'ArrowDown' && e.altKey) {
                  e.preventDefault();
                  openCalendar();
                }
              }}
              className={fieldCls}
            />
            <div className="absolute inset-y-0 right-1 flex items-center">
              {value && !disabled && (
                <button
                  type="button"
                  onClick={() => {
                    setInvalid(false);
                    setDraft(null);
                    onChange('');
                  }}
                  aria-label="ล้างวันที่"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-[var(--pf-hover)] dark:hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <Popover.Trigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label="เปิดปฏิทิน"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-[var(--pf-hover)] dark:hover:text-white cursor-pointer"
                >
                  <CalendarDays className="h-4 w-4" />
                </button>
              </Popover.Trigger>
            </div>
          </div>
        </Popover.Anchor>

        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            collisionPadding={12}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              // focus the selected / today cell once the grid has rendered
              requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusIso}"]`)?.focus());
            }}
            className="pf-menu z-[120] w-[19rem] rounded-xl p-3"
          >
            <div className="mb-2 flex items-center gap-1">
              <button type="button" onClick={() => stepMonth(-1)} aria-label="เดือนก่อนหน้า" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[var(--pf-hover)] cursor-pointer">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <Select
                ariaLabel="เดือน"
                value={String(view.m)}
                onValueChange={(v) => setView((p) => ({ ...p, m: Number(v) }))}
                options={MONTHS.map((name, i) => ({ value: String(i + 1), label: name }))}
                className="h-9 min-h-[36px] min-w-0 flex-1 px-2 font-semibold"
                contentClassName="min-w-[11rem]"
              />
              <Select
                ariaLabel="ปี พ.ศ."
                value={String(view.y)}
                onValueChange={(v) => setView((p) => ({ ...p, y: Number(v) }))}
                options={years.map((y) => ({ value: String(y), label: String(y + 543) }))}
                className="h-9 min-h-[36px] w-[6rem] px-2 font-semibold tabular-nums"
              />
              <button type="button" onClick={() => stepMonth(1)} aria-label="เดือนถัดไป" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[var(--pf-hover)] cursor-pointer">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div role="grid" aria-label={`${MONTHS[view.m - 1]} พ.ศ. ${view.y + 543}`} ref={gridRef} onKeyDown={onGridKey}>
              <div role="row" className="grid grid-cols-7 text-center">
                {WEEKDAYS.map((w, i) => (
                  <div key={w} role="columnheader" className={cn('py-1.5 text-xs font-semibold', i === 0 || i === 6 ? 'text-rose-700 dark:text-rose-300' : 'text-ink-4')}>
                    {w}
                  </div>
                ))}
              </div>
              {Array.from({ length: 6 }, (_, row) => (
                <div role="row" key={row} className="grid grid-cols-7">
                  {cells.slice(row * 7, row * 7 + 7).map((iso) => {
                    const p = parseIso(iso)!;
                    const outside = p.m !== view.m;
                    const selected = iso === value;
                    const isToday = iso === today;
                    const disabledDay = !inRange(iso);
                    return (
                      <button
                        key={iso}
                        type="button"
                        role="gridcell"
                        data-iso={iso}
                        tabIndex={iso === focusIso ? 0 : -1}
                        disabled={disabledDay}
                        aria-selected={selected}
                        aria-current={isToday ? 'date' : undefined}
                        aria-label={longThai(iso)}
                        onClick={() => pick(iso)}
                        className={cn(
                          'm-0.5 inline-flex h-9 items-center justify-center rounded-lg text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-strong,#1d4ed8)] disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer',
                          outside ? 'text-slate-400 dark:text-slate-600' : 'text-ink',
                          !selected && 'hover:bg-slate-100 dark:hover:bg-[var(--pf-hover)]',
                          isToday && !selected && 'font-bold ring-1 ring-inset ring-[var(--brand-strong,#1d4ed8)]',
                          selected && 'btn-brand font-bold'
                        )}
                      >
                        {p.d}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 dark:border-white/10">
              <button
                type="button"
                onClick={() => (inRange(today) ? pick(today) : moveFocus(today))}
                className="min-h-[36px] rounded-lg px-3 text-sm font-semibold text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-[var(--pf-hover)] cursor-pointer"
              >
                วันนี้
              </button>
              {value && (
                <button type="button" onClick={() => pick('')} className="min-h-[36px] rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[var(--pf-hover)] cursor-pointer">
                  ล้าง
                </button>
              )}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {!compact && (
        <p className={cn('mt-1 text-xs', invalid ? 'font-semibold text-rose-700 dark:text-rose-300' : 'text-ink-4')} role={invalid ? 'alert' : undefined}>
          {invalid ? 'วันที่ไม่ถูกต้อง กรอกเป็น วว/ดด/ปปปป เช่น 23/10/2569' : value ? longThai(value) : ' '}
        </p>
      )}
    </div>
  );
};
