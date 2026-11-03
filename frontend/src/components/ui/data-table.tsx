import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Inbox,
  Rows2,
  Rows3,
} from 'lucide-react';
import { Select } from './select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';
import { cn } from '../../lib/utils';

/** Per-column presentation hints, set through ColumnDef.meta */
export interface DataTableColumnMeta {
  align?: 'right';
  /** Long text column: wider, clamped to 3 lines */
  wide?: boolean;
  nowrap?: boolean;
  /** Label used in the column picker (defaults to the header text) */
  label?: string;
}

interface DataTableProps<T, K extends string | number = number> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  loading?: boolean;
  emptyText?: string;
  /** Top bar of the card: search box and actions */
  toolbar?: React.ReactNode;
  /** Quick-filter chips shown under the toolbar */
  filters?: React.ReactNode;
  /** Called when a row is clicked or activated with Enter/Space */
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  /** Rendered under the table (e.g. totals over all rows, not just the page) */
  footer?: React.ReactNode;
  pageSizes?: number[];
  ariaLabel: string;
  /** localStorage key to remember density, page size and hidden columns per table */
  storageKey?: string;
  /** Ask the table to sort by a column; a new `nonce` re-applies it even if the column is the same */
  sortRequest?: { id: string; desc: boolean; nonce: number };
  /** Checkbox column: rows are identified by getRowKey; select-all covers the rows on the current page */
  selection?: { getRowKey: (row: T) => K; selected: ReadonlySet<K>; onChange: (next: Set<K>) => void };
  /** Last column with per-row buttons (view / edit / delete). Clicks inside do not trigger onRowClick */
  rowActions?: (row: T) => React.ReactNode;
}

type Density = 'comfortable' | 'compact';

interface Prefs {
  density: Density;
  pageSize?: number;
  hidden: VisibilityState;
}

function loadPrefs(key?: string): Prefs {
  const fallback: Prefs = { density: 'comfortable', hidden: {} };
  if (!key) return fallback;
  try {
    const raw = JSON.parse(localStorage.getItem(`datatable:${key}`) ?? 'null') as Partial<Prefs> | null;
    return {
      density: raw?.density === 'compact' ? 'compact' : 'comfortable',
      pageSize: typeof raw?.pageSize === 'number' ? raw.pageSize : undefined,
      hidden: raw?.hidden && typeof raw.hidden === 'object' ? raw.hidden : {},
    };
  } catch {
    return fallback;
  }
}

function savePrefs(key: string | undefined, prefs: Prefs): void {
  if (!key) return;
  try {
    localStorage.setItem(`datatable:${key}`, JSON.stringify(prefs));
  } catch {
    /* private mode / storage blocked: preferences just are not remembered */
  }
}

/** Zero-based page indexes to show: first, last, and a window around the current page (null = "…") */
function pageNumbers(current: number, count: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);
  const keep = new Set([0, count - 1, current - 1, current, current + 1]);
  if (current <= 2) [1, 2, 3].forEach((n) => keep.add(n));
  if (current >= count - 3) [count - 2, count - 3, count - 4].forEach((n) => keep.add(n));
  const sorted = [...keep].filter((n) => n >= 0 && n < count).sort((x, y) => x - y);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}

const iconBtn = 'pf-btn inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold cursor-pointer';

interface TablePagerProps {
  total: number;
  pageIndex: number;
  pageSize: number;
  pageSizes?: number[];
  onPageIndex: (index: number) => void;
  onPageSize: (size: number) => void;
}

/** Row range, rows-per-page picker and page buttons; shared by every table in the app */
export function TablePager({ total, pageIndex, pageSize, pageSizes = [25, 50, 100], onPageIndex, onPageSize }: TablePagerProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * pageSize);
  const canPrev = pageIndex > 0;
  const canNext = pageIndex < pageCount - 1;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-white/10 dark:bg-[var(--pf-bar-bg)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-3">
        <span>
          แสดง <span className="font-semibold tabular-nums">{from.toLocaleString('th-TH')}–{to.toLocaleString('th-TH')}</span> จาก {total.toLocaleString('th-TH')}
        </span>
        <div className="flex items-center gap-2">
          แถวต่อหน้า
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSize(Number(v))}
            options={pageSizes.map((n) => ({ value: String(n), label: String(n) }))}
            ariaLabel="แถวต่อหน้า"
            className="min-h-[36px] h-9 min-w-[4.5rem] px-2 font-semibold"
          />
        </div>
      </div>
      <nav aria-label="เลขหน้า" className="flex items-center gap-1.5">
        <button type="button" className={cn(iconBtn, 'px-2')} onClick={() => onPageIndex(0)} disabled={!canPrev} aria-label="หน้าแรก">
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button type="button" className={cn(iconBtn, 'px-2')} onClick={() => onPageIndex(pageIndex - 1)} disabled={!canPrev} aria-label="หน้าก่อนหน้า">
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageNumbers(pageIndex, pageCount).map((n, i) =>
          n === null ? (
            <span key={`gap-${i}`} className="px-1 text-slate-500" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onPageIndex(n)}
              aria-label={`หน้า ${n + 1}`}
              aria-current={n === pageIndex ? 'page' : undefined}
              className={cn(
                iconBtn,
                'min-w-9 px-2 tabular-nums',
                n === pageIndex && 'border-transparent bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200'
              )}
            >
              {n + 1}
            </button>
          )
        )}
        <button type="button" className={cn(iconBtn, 'px-2')} onClick={() => onPageIndex(pageIndex + 1)} disabled={!canNext} aria-label="หน้าถัดไป">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button type="button" className={cn(iconBtn, 'px-2')} onClick={() => onPageIndex(pageCount - 1)} disabled={!canNext} aria-label="หน้าสุดท้าย">
          <ChevronsRight className="h-4 w-4" />
        </button>
      </nav>
    </div>
  );
}

export function DataTable<T, K extends string | number = number>({
  data,
  columns,
  loading,
  emptyText = 'ไม่มีข้อมูล',
  toolbar,
  filters,
  onRowClick,
  rowClassName,
  footer,
  pageSizes = [25, 50, 100],
  ariaLabel,
  storageKey,
  sortRequest,
  selection,
  rowActions,
}: DataTableProps<T, K>) {
  const initial = React.useMemo(() => loadPrefs(storageKey), [storageKey]);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [visibility, setVisibility] = React.useState<VisibilityState>(initial.hidden);
  const [density, setDensity] = React.useState<Density>(initial.density);

  React.useEffect(() => {
    if (sortRequest) setSorting([{ id: sortRequest.id, desc: sortRequest.desc }]);
  }, [sortRequest]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility: visibility },
    initialState: { pagination: { pageSize: initial.pageSize && pageSizes.includes(initial.pageSize) ? initial.pageSize : (pageSizes[1] ?? pageSizes[0]) } },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: true,
  });

  const rows = table.getRowModel().rows;
  const { pageIndex, pageSize } = table.getState().pagination;

  React.useEffect(() => {
    savePrefs(storageKey, { density, pageSize, hidden: visibility });
  }, [storageKey, density, pageSize, visibility]);

  const total = data.length;
  const pageCount = table.getPageCount();
  const colSpan = table.getVisibleLeafColumns().length + 1 + (selection ? 1 : 0) + (rowActions ? 1 : 0);
  // Always shown once there is data, so every table looks and behaves the same
  const showPager = total > 0;
  const compact = density === 'compact';
  const metaOf = (c: { columnDef: { meta?: unknown } }) => (c.columnDef.meta ?? {}) as DataTableColumnMeta;
  const pageKeys = selection ? rows.map((r) => selection.getRowKey(r.original)) : [];
  const selectedOnPage = selection ? pageKeys.filter((k) => selection.selected.has(k)).length : 0;
  const allOnPage = pageKeys.length > 0 && selectedOnPage === pageKeys.length;
  const togglePage = () => {
    if (!selection) return;
    const next = new Set(selection.selected);
    for (const k of pageKeys) (allOnPage ? next.delete(k) : next.add(k));
    selection.onChange(next);
  };
  const toggleOne = (k: K) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (!next.delete(k)) next.add(k);
    selection.onChange(next);
  };
  const hiddenCount = table.getAllLeafColumns().filter((c) => c.getCanHide() && !c.getIsVisible()).length;

  return (
    <div className="gov-card overflow-hidden">
      {toolbar && <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center dark:border-white/10">{toolbar}</div>}
      {filters && <div className="border-b border-slate-200 px-3 py-2.5 dark:border-white/10">{filters}</div>}

      {/* Summary bar: row count on the left, view options on the right */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-2 dark:border-white/10 dark:bg-[var(--pf-bar-bg)]">
        <p className="text-sm text-ink-3" aria-live="polite">
          {loading ? (
            'กำลังโหลด...'
          ) : (
            <>
              ทั้งหมด <span className="font-semibold tabular-nums text-ink">{total.toLocaleString('th-TH')}</span> รายการ
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={iconBtn}
            onClick={() => setDensity(compact ? 'comfortable' : 'compact')}
            aria-pressed={compact}
            title={compact ? 'แสดงแบบปกติ' : 'แสดงแบบกะทัดรัด'}
          >
            {compact ? <Rows3 className="h-4 w-4" aria-hidden /> : <Rows2 className="h-4 w-4" aria-hidden />}
            <span className="hidden sm:inline">{compact ? 'กะทัดรัด' : 'ปกติ'}</span>
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className={iconBtn}>
              <Columns3 className="h-4 w-4" aria-hidden /> คอลัมน์
              {hiddenCount > 0 && <span className="rounded-full bg-slate-900 px-1.5 text-xs text-white dark:bg-white dark:text-slate-900">ซ่อน {hiddenCount}</span>}
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="pf-menu z-[70] max-h-80 min-w-56 overflow-y-auto rounded-xl p-1"
              >
                {table
                  .getAllLeafColumns()
                  .filter((c) => c.getCanHide())
                  .map((c) => (
                    <DropdownMenu.CheckboxItem
                      key={c.id}
                      checked={c.getIsVisible()}
                      onCheckedChange={(v) => c.toggleVisibility(Boolean(v))}
                      onSelect={(e) => e.preventDefault()}
                      className="pf-item flex min-h-[40px] cursor-pointer select-none items-center gap-2 rounded-lg px-3 text-sm outline-none"
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded border text-[10px] leading-none',
                          c.getIsVisible() ? 'border-transparent bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'border-slate-400'
                        )}
                        aria-hidden
                      >
                        {c.getIsVisible() ? '✓' : ''}
                      </span>
                      {metaOf(c).label ?? (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id)}
                    </DropdownMenu.CheckboxItem>
                  ))}
                {hiddenCount > 0 && (
                  <>
                    <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-white/10" />
                    <DropdownMenu.Item
                      onSelect={() => table.resetColumnVisibility()}
                      className="pf-item flex min-h-[40px] cursor-pointer items-center rounded-lg px-3 text-sm font-semibold outline-none"
                    >
                      แสดงทุกคอลัมน์
                    </DropdownMenu.Item>
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      <div className="relative">
        {/* Thin progress line while refreshing so the rows do not flash away */}
        {loading && rows.length > 0 && <div className="absolute inset-x-0 top-0 z-20 h-0.5 animate-pulse bg-[var(--brand-strong,#1d4ed8)]" role="progressbar" aria-label="กำลังโหลด" />}
        <Table aria-label={ariaLabel} className="min-w-[720px]" containerClassName="max-h-[min(68dvh,760px)]">
          <TableHeader className="border-0 bg-transparent dark:bg-transparent">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent dark:hover:bg-transparent">
                {selection && (
                  <TableHead className={cn(headCell, 'w-11 px-3 text-center')}>
                    <input
                      type="checkbox"
                      checked={allOnPage}
                      ref={(el) => {
                        if (el) el.indeterminate = selectedOnPage > 0 && !allOnPage;
                      }}
                      onChange={togglePage}
                      disabled={pageKeys.length === 0}
                      aria-label="เลือกทั้งหมดในหน้านี้"
                      title="เลือกทั้งหมดในหน้านี้"
                      className="h-4 w-4 cursor-pointer accent-[var(--brand-strong,#1d4ed8)]"
                    />
                  </TableHead>
                )}
                <TableHead className={cn(headCell, 'w-12 text-center')}>#</TableHead>
                {hg.headers.map((h) => {
                  const meta = metaOf(h.column);
                  const sorted = h.column.getIsSorted();
                  const canSort = h.column.getCanSort();
                  return (
                    <TableHead
                      key={h.id}
                      scope="col"
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : canSort ? 'none' : undefined}
                      className={cn(headCell, meta.align === 'right' && 'text-right')}
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          title="คลิกเพื่อเรียงลำดับ"
                          className={cn(
                            'group/sort -mx-1.5 inline-flex min-h-[32px] items-center gap-1 rounded px-1.5 font-semibold transition-colors hover:bg-slate-200/70 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-strong,#1d4ed8)] dark:hover:bg-white/10 dark:hover:text-white cursor-pointer',
                            sorted && 'text-ink'
                          )}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60" aria-hidden />
                          )}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </TableHead>
                  );
                })}
                {rowActions && <TableHead className={cn(headCell, 'text-center')}>จัดการ</TableHead>}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading && rows.length === 0 &&
              Array.from({ length: 5 }, (_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent dark:hover:bg-transparent" aria-hidden>
                  <TableCell colSpan={colSpan}>
                    <div className="h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" style={{ width: `${88 - i * 9}%` }} />
                  </TableCell>
                </TableRow>
              ))}
            {!loading && rows.length === 0 && (
              <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
                <TableCell colSpan={colSpan} className="py-14 text-center">
                  <Inbox className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
                  <p className="mt-2 text-sm font-medium text-ink-3">{emptyText}</p>
                </TableCell>
              </TableRow>
            )}
            {rows.map((row, i) => (
              <TableRow
                key={row.id}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRowClick(row.original);
                        }
                      }
                    : undefined
                }
                className={cn(
                  'align-top',
                  onRowClick && 'cursor-pointer focus-visible:bg-slate-100 focus-visible:outline-none dark:focus-visible:bg-[var(--pf-hover)]',
                  rowClassName?.(row.original),
                  selection?.selected.has(selection.getRowKey(row.original)) && 'bg-brand-soft/60'
                )}
              >
                {selection && (
                  <TableCell className={cn('w-11 px-3 text-center', compact ? 'py-1.5' : 'py-3.5')} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selection.selected.has(selection.getRowKey(row.original))}
                      onChange={() => toggleOne(selection.getRowKey(row.original))}
                      aria-label={`เลือกแถวที่ ${pageIndex * pageSize + i + 1}`}
                      className="h-4 w-4 cursor-pointer accent-[var(--brand-strong,#1d4ed8)]"
                    />
                  </TableCell>
                )}
                <TableCell className={cn('text-center text-xs tabular-nums text-ink-5', compact ? 'px-3 py-1.5' : 'py-3.5')}>
                  {pageIndex * pageSize + i + 1}
                </TableCell>
                {row.getVisibleCells().map((cell) => {
                  const meta = metaOf(cell.column);
                  const content = flexRender(cell.column.columnDef.cell, cell.getContext());
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        compact ? 'px-3 py-1.5 text-[13px]' : 'py-3.5',
                        meta.align === 'right' && 'text-right tabular-nums whitespace-nowrap',
                        meta.wide && (compact ? 'min-w-[10rem] max-w-md' : 'min-w-[12rem] max-w-md'),
                        meta.nowrap && 'whitespace-nowrap'
                      )}
                    >
                      {meta.wide ? <span className={compact ? 'line-clamp-1' : 'line-clamp-3'}>{content}</span> : content}
                    </TableCell>
                  );
                })}
                {rowActions && (
                  <TableCell className={cn('whitespace-nowrap text-center', compact ? 'px-3 py-1.5' : 'py-3.5')} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    {rowActions(row.original)}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {footer && (
        <div className="border-t border-slate-300 bg-slate-50 px-4 py-3 text-right text-sm font-semibold text-slate-900 dark:border-white/10 dark:bg-[var(--pf-head-bg)] dark:text-white">{footer}</div>
      )}

      {showPager && (
        <TablePager
          total={total}
          pageIndex={pageIndex}
          pageSize={pageSize}
          pageSizes={pageSizes}
          onPageIndex={(n) => table.setPageIndex(n)}
          onPageSize={(n) => table.setPageSize(n)}
        />
      )}
    </div>
  );
}

/** Sticky header cell: the bottom rule is an inset shadow because borders do not stick with border-collapse */
const headCell =
  'sticky top-0 z-10 h-11 bg-slate-100 text-xs text-slate-600 shadow-[inset_0_-1px_0_var(--color-slate-300)] dark:bg-[var(--pf-head-bg)] dark:text-slate-300 dark:shadow-[inset_0_-1px_0_rgb(255_255_255/0.12)]';
