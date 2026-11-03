import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowDownWideNarrow, Check, ChevronDown, FileSignature, Inbox, Link2, ListChecks, ReceiptText, ShieldCheck, ShoppingCart, ChevronRight, Download, FileSpreadsheet, FileText, Eye, FilterX, History, Loader2, Pencil, Plus, Search, Trash2, TriangleAlert, User, X } from 'lucide-react';
import { Select } from '../../components/ui/select';
import { DataTable, type DataTableColumnMeta } from '../../components/ui/data-table';
import { ConflictError, procureApi, type Lookups, type PeriodMode, type Row, type Resource } from './api';
import { ConflictDialog } from './ConflictDialog';
import { TrashDialog } from './TrashDialog';
import type { FieldDef, ResourceDef } from './fields';
import { RecordDialog, toFormValues, toPayload, type FormValues } from './RecordDialog';
import { daysUntil, downloadCsv, fiscalYearOf, money, periodLabel, statusTone, thaiDate, todayIso } from './format';
import { DateRangeFilter, emptyRange, inRange, isRangeActive, type DateRange } from './DateRangeFilter';
import { columnsFromFields, excelFilename, exportXlsx } from './excel';
import type { Permissions, Notify } from './types';
import { Flash, changedIds, useFlashIds, useLiveReload } from './live';
import { RowHistoryDialog } from '../audit/RowHistoryDialog';
import { CaseFile } from './CaseFile';
import { useIncomingOptions } from './IncomingPicker';

interface Props {
  def: ResourceDef;
  fy: number;
  mode?: PeriodMode;
  lookups: Lookups | null;
  perms: Permissions;
  notify: Notify;
  onCreateOrderFromIncoming?: (incomingRow: Row) => void;
  onCreateContractFromIncoming?: (incomingRow: Row) => void;
  pendingNewRow?: FormValues | null;
  onClearPendingNewRow?: () => void;
}

/** Long free-text columns: give them room and clamp to 3 lines */
const WIDE_KEYS = new Set(['job_title', 'vendor_name', 'owner_group', 'contract_ref', 'from_name', 'category', 'return_note']);

type GuaranteeFilter = 'all' | 'pending' | 'overdue';

function cellText(f: FieldDef, v: unknown): string {
  if (v === null || v === undefined) return '';
  if (f.type === 'date') return thaiDate(v);
  if (f.type === 'number' && f.align === 'right') return money(v);
  if (f.type === 'checkbox') return v ? 'คืนแล้ว' : 'ยังไม่คืน';
  return String(v);
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const muted = 'text-xs text-ink-5';
/** "12/2570" sorts as 12, not as text */
const docNoKey = (v: unknown) => {
  const m = /^\s*(\d+)\s*\/\s*(\d+)/.exec(str(v));
  return m ? Number(m[2]) * 100000 + Number(m[1]) : undefined;
};

/** A done/not-yet step with its date (ตรวจรับ, ส่งเบิก) */
const Step: React.FC<{ label: string; date: unknown }> = ({ label, date }) => (
  <div className="flex items-center gap-1.5 whitespace-nowrap text-xs">
    <span className={`h-2 w-2 shrink-0 rounded-full ${date ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} aria-hidden />
    <span className={date ? 'text-ink-3' : 'text-ink-5'}>
      {label} {date ? thaiDate(date) : <span className="italic">ยังไม่มี</span>}
    </span>
  </div>
);

/**
 * Quick inline dropdown picker in table cells for staff, fund, status, and method
 */
const InlineSelect: React.FC<{
  value: string | null | undefined;
  options: string[];
  placeholder: string;
  canEdit: boolean;
  onSelect: (val: string | null) => void;
  badgeStyle?: (val: string) => string;
  tone?: string;
  icon?: React.ReactNode;
}> = ({ value, options, placeholder, canEdit, onSelect, badgeStyle, tone, icon }) => {
  const [open, setOpen] = useState(false);

  if (!canEdit || options.length === 0) {
    if (!value) return <span className={muted}>–</span>;
    if (badgeStyle) {
      return (
        <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${badgeStyle(value)}`}>
          {value}
        </span>
      );
    }
    return <span className={tone || 'text-ink-2'}>{value}</span>;
  }

  const hasValue = Boolean(value);

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`group inline-flex items-center gap-1 rounded transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            badgeStyle && hasValue
              ? `px-2 py-0.5 text-xs font-semibold ring-1 ${badgeStyle(value!)} hover:brightness-105 hover:scale-[1.02]`
              : hasValue
              ? `px-1.5 py-0.5 text-xs font-medium ${tone || 'text-ink-2'} hover:bg-slate-100 hover:text-brand dark:hover:bg-white/10 dark:hover:text-sky-300`
              : 'rounded border border-dashed border-sky-300 bg-sky-50/50 px-2 py-0.5 text-xs font-medium text-sky-700 hover:bg-sky-100 hover:border-sky-400 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20'
          }`}
          title={`คลิกเพื่อเลือก ${placeholder}`}
        >
          {icon && <span className="opacity-70 group-hover:opacity-100">{icon}</span>}
          <span className="truncate max-w-[150px]">{value || `+ เลือก${placeholder}`}</span>
          <ChevronDown
            className={`h-3 w-3 shrink-0 transition-opacity ${
              hasValue ? 'opacity-40 group-hover:opacity-100 text-slate-400' : 'opacity-70 text-sky-600 dark:text-sky-400'
            }`}
            aria-hidden
          />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          onClick={(e) => e.stopPropagation()}
          className="pf-menu z-[75] min-w-[200px] max-w-[280px] rounded-xl p-1.5 shadow-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900"
        >
          <div className="px-2 py-1 text-[11px] font-semibold text-ink-5 border-b border-slate-100 dark:border-white/5 mb-1 flex items-center justify-between">
            <span>เลือก{placeholder}</span>
            <span className="text-[10px] text-slate-400">{options.length} ตัวเลือก</span>
          </div>
          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {hasValue && (
              <DropdownMenu.Item
                onSelect={() => onSelect(null)}
                className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 outline-none"
              >
                <span>– ไม่ระบุ (ล้างค่า)</span>
              </DropdownMenu.Item>
            )}
            {options.map((opt) => {
              const isSelected = opt === value;
              return (
                <DropdownMenu.Item
                  key={opt}
                  onSelect={() => onSelect(opt)}
                  className={`flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-xs outline-none transition-colors ${
                    isSelected
                      ? 'bg-brand-soft text-brand font-semibold'
                      : 'text-ink-2 hover:bg-slate-100 dark:hover:bg-white/10'
                  }`}
                >
                  <span className="truncate">{opt}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-brand ml-2" />}
                </DropdownMenu.Item>
              );
            })}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

interface OrderContractColumnOpts {
  singular: string;
  canEdit?: boolean;
  lookups?: Lookups | null;
  onQuickUpdate?: (id: number, key: string, value: string | null) => Promise<void>;
  onPickIncoming?: (row: Row) => void;
}

/**
 * Compact list for ใบสั่ง/สัญญา: the facts staff scan for, grouped so the table fits without sideways scrolling.
 * Supports 1-click inline assignment of responsible person, budget source, status, and method.
 */
function orderContractColumns({
  singular,
  canEdit = false,
  lookups,
  onQuickUpdate,
  onPickIncoming,
}: OrderContractColumnOpts): ColumnDef<Row, unknown>[] {
  const meta = (label: string, extra: Partial<DataTableColumnMeta> = {}): DataTableColumnMeta => ({ label, ...extra });
  return [
    {
      id: 'doc_no',
      header: `เลขที่${singular}`,
      accessorFn: (r) => docNoKey(r.doc_no),
      sortUndefined: 'last',
      meta: meta(`เลขที่/ลงวันที่`, { nowrap: true }),
      cell: ({ row: { original: r } }) => (
        <div>
          <div className="font-semibold tabular-nums text-ink">{str(r.doc_no) || '–'}</div>
          {r.doc_date ? <div className={muted}>{thaiDate(r.doc_date)}</div> : null}
        </div>
      ),
    },
    {
      id: 'job_title',
      header: 'งานที่ซื้อหรือจ้าง / ผู้ประกอบการ',
      accessorFn: (r) => r.job_title ?? undefined,
      sortUndefined: 'last',
      meta: meta('งานที่ซื้อหรือจ้าง / ผู้ประกอบการ'),
      cell: ({ row: { original: r } }) => (
        <div className="min-w-[14rem] max-w-lg">
          <div className="line-clamp-2 font-medium text-ink" title={str(r.job_title)}>{str(r.job_title)}</div>
          {r.vendor_name ? <div className={`${muted} mt-0.5 truncate`}>{str(r.vendor_name)}</div> : null}
          {(Number(r.invoice_count) > 0 || Number(r.guarantee_count) > 0 || r.progress_id) ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {Number(r.invoice_count) > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-500/10 dark:text-sky-300">
                  <ReceiptText className="h-3 w-3" aria-hidden /> ใบแจ้งหนี้ {str(r.invoice_count)} ฉบับ
                </span>
              )}
              {Number(r.guarantee_count) > 0 && (
                <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${Number(r.guarantee_open) > 0 ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>
                  <ShieldCheck className="h-3 w-3" aria-hidden /> หลักประกัน{Number(r.guarantee_open) > 0 ? 'ยังไม่คืน' : 'คืนแล้ว'}
                </span>
              )}
              {r.progress_id ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <ListChecks className="h-3 w-3" aria-hidden /> ความก้าวหน้า
                </span>
              ) : null}
            </div>
          ) : null}
          {r.incoming_ref ? (
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800 ring-1 ring-teal-600/20 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-400/20" title={str(r.incoming_ref)}>
                <Inbox className="h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
                <span className="truncate">
                  <span className="font-semibold">
                    หนังสือรับ {r.incoming_reg_no ? `รับที่ ${str(r.incoming_reg_no)}${r.incoming_fiscal_year ? `/${r.incoming_fiscal_year}` : ''}` : ''}
                  </span>
                  {r.incoming_doc_no ? ` · ${str(r.incoming_doc_no)}` : ''}
                  {r.incoming_subject ? ` : ${str(r.incoming_subject)}` : ''}
                </span>
              </span>
              {canEdit && onPickIncoming && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPickIncoming(r);
                  }}
                  title="เปลี่ยนหนังสือรับต้นเรื่อง"
                  className="rounded p-0.5 text-slate-400 hover:text-teal-700 hover:bg-teal-100/50 dark:hover:text-teal-300 cursor-pointer"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
          ) : canEdit && onPickIncoming ? (
            <div className="mt-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPickIncoming(r);
                }}
                className="inline-flex items-center gap-1 rounded border border-dashed border-teal-300 bg-teal-50/50 px-2 py-0.5 text-xs font-medium text-teal-700 hover:border-teal-500 hover:bg-teal-100 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300 dark:hover:bg-teal-500/20 cursor-pointer"
                title="คลิกเพื่อผูกหนังสือรับต้นเรื่องกับรายการนี้"
              >
                <Inbox className="h-3 w-3" /> + ผูกหนังสือรับ (ต้นเรื่อง)
              </button>
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: 'responsible',
      header: 'ผู้รับผิดชอบ / แหล่งงบ',
      accessorFn: (r) => r.responsible ?? undefined,
      sortUndefined: 'last',
      meta: meta('ผู้รับผิดชอบ / แหล่งงบ'),
      cell: ({ row: { original: r } }) => (
        <div className="flex flex-col items-start gap-1 whitespace-nowrap">
          <InlineSelect
            value={r.responsible as string | null}
            options={lookups?.staff ?? []}
            placeholder="ผู้รับผิดชอบ"
            canEdit={canEdit && Boolean(onQuickUpdate)}
            onSelect={(val) => void onQuickUpdate?.(r.id, 'responsible', val)}
            icon={<User className="h-3 w-3" />}
          />
          <InlineSelect
            value={r.budget_source as string | null}
            options={lookups?.fund ?? []}
            placeholder="แหล่งงบ"
            canEdit={canEdit && Boolean(onQuickUpdate)}
            tone={muted}
            onSelect={(val) => void onQuickUpdate?.(r.id, 'budget_source', val)}
          />
        </div>
      ),
    },
    {
      id: 'status',
      header: 'สถานะ / วิธีจัดหา',
      accessorFn: (r) => r.status ?? undefined,
      sortUndefined: 'last',
      meta: meta('สถานะ / วิธีจัดหา'),
      cell: ({ row: { original: r } }) => (
        <div className="flex flex-col items-start gap-1 whitespace-nowrap">
          <InlineSelect
            value={r.status as string | null}
            options={lookups?.status ?? []}
            placeholder="สถานะ"
            canEdit={canEdit && Boolean(onQuickUpdate)}
            badgeStyle={statusTone}
            onSelect={(val) => void onQuickUpdate?.(r.id, 'status', val)}
          />
          <InlineSelect
            value={r.method as string | null}
            options={lookups?.method ?? []}
            placeholder="วิธีจัดหา"
            canEdit={canEdit && Boolean(onQuickUpdate)}
            tone={muted}
            onSelect={(val) => void onQuickUpdate?.(r.id, 'method', val)}
          />
        </div>
      ),
    },
    {
      id: 'agreed_price',
      header: 'มูลค่า (บาท)',
      accessorFn: (r) => (r.agreed_price === null || r.agreed_price === undefined ? undefined : Number(r.agreed_price)),
      sortUndefined: 'last',
      meta: meta('มูลค่า (บาท)', { align: 'right' }),
      cell: ({ row: { original: r } }) => (
        <div>
          <div className="font-semibold text-ink">{money(r.agreed_price) || '–'}</div>
          {r.median_price !== null && r.median_price !== undefined && Number(r.median_price) !== Number(r.agreed_price) ? (
            <div className={muted}>ราคากลาง {money(r.median_price)}</div>
          ) : null}
          {Number(r.invoice_total) > 0 ? (
            <div className={`text-xs ${r.agreed_price !== null && Number(r.invoice_total) > Number(r.agreed_price) ? 'font-semibold text-rose-700 dark:text-rose-300' : 'text-sky-700 dark:text-sky-300'}`}>
              เรียกเก็บแล้ว {money(r.invoice_total)}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: 'inspected_date',
      header: 'ตรวจรับ / ส่งเบิก',
      accessorFn: (r) => r.inspected_date ?? undefined,
      sortUndefined: 'last',
      meta: meta('ตรวจรับ / ส่งเบิก'),
      cell: ({ row: { original: r } }) => (
        <div className="space-y-1">
          <Step label="ตรวจรับ" date={r.inspected_date} />
          <Step label="ส่งเบิก" date={r.disbursed_date} />
        </div>
      ),
    },
  ];
}

/**
 * Compact list for หนังสือรับ: grouped 2-line cells so the table fits without horizontal scroll
 */
function incomingColumns(): ColumnDef<Row, unknown>[] {
  const meta = (label: string, extra: Partial<DataTableColumnMeta> = {}): DataTableColumnMeta => ({ label, ...extra });
  return [
    {
      id: 'reg_no',
      header: 'เลขทะเบียนรับ / เลขที่',
      accessorFn: (r) => (r.reg_no === null || r.reg_no === undefined ? undefined : Number(r.reg_no)),
      sortUndefined: 'last',
      meta: meta('เลขทะเบียนรับ / เลขที่', { nowrap: true }),
      cell: ({ row: { original: r } }) => (
        <div className="whitespace-nowrap">
          <div className="font-semibold tabular-nums text-ink">
            {r.reg_no !== null && r.reg_no !== undefined ? `รับที่ ${str(r.reg_no)}` : '–'}
          </div>
          <div className={`${muted} font-mono`}>{str(r.doc_no) || '–'}</div>
        </div>
      ),
    },
    {
      id: 'doc_date',
      header: 'ลงวันที่',
      accessorFn: (r) => r.doc_date ?? undefined,
      sortUndefined: 'last',
      meta: meta('ลงวันที่', { nowrap: true }),
      cell: ({ row: { original: r } }) => (
        <div className="whitespace-nowrap text-ink-2">
          {thaiDate(r.doc_date) || '–'}
        </div>
      ),
    },
    {
      id: 'subject',
      header: 'เรื่อง / ประเภท',
      accessorFn: (r) => r.subject ?? undefined,
      sortUndefined: 'last',
      meta: meta('เรื่อง / ประเภท'),
      cell: ({ row: { original: r } }) => {
        const cat = str(r.category).trim();
        const subj = str(r.subject).trim();
        const showCat = cat && cat.toLowerCase() !== subj.toLowerCase();
        return (
          <div className="min-w-[12rem] max-w-md">
            <div className="line-clamp-2 font-medium text-ink" title={subj}>
              {subj || '–'}
            </div>
            {showCat && (
              <div className="mt-1">
                <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  {cat}
                </span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: 'from_name',
      header: 'จาก (ผู้ส่ง)',
      accessorFn: (r) => r.from_name ?? undefined,
      sortUndefined: 'last',
      meta: meta('จาก (ผู้ส่ง)'),
      cell: ({ row: { original: r } }) => (
        <div className="min-w-[9rem] max-w-[13rem]">
          <div className="line-clamp-2 text-ink-2" title={str(r.from_name)}>
            {str(r.from_name) || '–'}
          </div>
        </div>
      ),
    },
    {
      id: 'amount',
      header: 'ราคา (บาท)',
      accessorFn: (r) => (r.amount === null || r.amount === undefined ? undefined : Number(r.amount)),
      sortUndefined: 'last',
      meta: meta('ราคา (บาท)', { align: 'right' }),
      cell: ({ row: { original: r } }) => (
        <div className="font-semibold tabular-nums text-ink">
          {money(r.amount) || '–'}
        </div>
      ),
    },
    {
      id: 'link_ref',
      header: 'เกี่ยวข้องกับใบสั่ง/สัญญา',
      accessorFn: (r) => r.link_label ?? undefined,
      sortUndefined: 'last',
      meta: meta('เกี่ยวข้องกับใบสั่ง/สัญญา'),
      cell: ({ row: { original: r } }) => (
        <div className="min-w-[9rem] max-w-[13rem]">
          {r.link_label ? (
            <span
              className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800 ring-1 ring-teal-600/20 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-400/20"
              title={str(r.link_label)}
            >
              <ShoppingCart className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{str(r.link_label)}</span>
            </span>
          ) : (
            <span className="text-xs text-ink-6">ยังไม่เชื่อม</span>
          )}
        </div>
      ),
    },
  ];
}

/**
 * Compact list for หลักประกัน: grouped cells so the table fits cleanly on desktop
 */
function guaranteeColumns(): ColumnDef<Row, unknown>[] {
  const meta = (label: string, extra: Partial<DataTableColumnMeta> = {}): DataTableColumnMeta => ({ label, ...extra });
  return [
    {
      id: 'seq_no',
      header: 'ลำดับ',
      accessorFn: (r) => (r.seq_no === null || r.seq_no === undefined ? undefined : Number(r.seq_no)),
      sortUndefined: 'last',
      meta: meta('ลำดับ', { nowrap: true }),
      cell: ({ row: { original: r } }) => (
        <span className="font-semibold tabular-nums text-ink">
          {str(r.seq_no) || '–'}
        </span>
      ),
    },
    {
      id: 'returned',
      header: 'สถานะ / วันที่รับ',
      accessorFn: (r) => (r.returned ? 1 : 0),
      sortUndefined: 'last',
      meta: meta('สถานะ / วันที่รับ', { nowrap: true }),
      cell: ({ row: { original: r } }) => {
        const overdue = !r.returned && typeof r.return_due_date === 'string' && daysUntil(r.return_due_date) < 0;
        return (
          <div className="space-y-1 whitespace-nowrap">
            <span
              className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${
                r.returned
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20'
                  : overdue
                  ? 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20'
                  : 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-[var(--pf-head-bg)] dark:text-slate-300 dark:ring-[var(--pf-field-border)]'
              }`}
            >
              {r.returned ? 'คืนแล้ว' : overdue ? 'เลยกำหนด' : 'ยังไม่คืน'}
            </span>
            {r.received_date ? <div className={muted}>รับ {thaiDate(r.received_date)}</div> : null}
          </div>
        );
      },
    },
    {
      id: 'title',
      header: 'โครงการ / รายละเอียด',
      accessorFn: (r) => r.title ?? undefined,
      sortUndefined: 'last',
      meta: meta('โครงการ / รายละเอียด'),
      cell: ({ row: { original: r } }) => (
        <div className="min-w-[12rem] max-w-md">
          <div className="line-clamp-2 font-medium text-ink" title={str(r.title)}>
            {str(r.title) || '–'}
          </div>
          {r.detail ? (
            <div className={`${muted} mt-0.5 line-clamp-1`} title={str(r.detail)}>
              {str(r.detail)}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: 'vendor_name',
      header: 'ผู้ขาย / เลขที่สัญญา',
      accessorFn: (r) => r.vendor_name ?? undefined,
      sortUndefined: 'last',
      meta: meta('ผู้ขาย / เลขที่สัญญา'),
      cell: ({ row: { original: r } }) => (
        <div className="min-w-[9rem] max-w-[12rem]">
          <div className="line-clamp-1 font-medium text-ink-2" title={str(r.vendor_name)}>
            {str(r.vendor_name) || '–'}
          </div>
          {r.contract_ref ? <div className={`${muted} mt-0.5 truncate`}>สัญญา: {str(r.contract_ref)}</div> : null}
        </div>
      ),
    },
    {
      id: 'link_ref',
      header: 'สัญญาในระบบ',
      accessorFn: (r) => r.link_label ?? undefined,
      sortUndefined: 'last',
      meta: meta('สัญญาในระบบ'),
      cell: ({ row: { original: r } }) => (
        <div className="min-w-[8rem] max-w-[11rem]">
          {r.link_label ? (
            <span
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-500/10 dark:text-violet-300"
              title={str(r.link_label)}
            >
              <Link2 className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{str(r.link_label)}</span>
            </span>
          ) : (
            <span className="text-xs text-ink-6">ยังไม่เชื่อม</span>
          )}
        </div>
      ),
    },
    {
      id: 'return_due_date',
      header: 'กำหนดคืน / บันทึก',
      accessorFn: (r) => r.return_due_date ?? undefined,
      sortUndefined: 'last',
      meta: meta('กำหนดคืน / บันทึก'),
      cell: ({ row: { original: r } }) => {
        const overdue = !r.returned && typeof r.return_due_date === 'string' && daysUntil(r.return_due_date) < 0;
        const dueSoon = !r.returned && typeof r.return_due_date === 'string' && daysUntil(r.return_due_date) >= 0 && daysUntil(r.return_due_date) <= 30;
        return (
          <div className="min-w-[8rem] max-w-[12rem]">
            <div
              className={`whitespace-nowrap font-medium ${
                overdue
                  ? 'text-rose-600 dark:text-rose-400'
                  : dueSoon
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-ink-2'
              }`}
            >
              {thaiDate(r.return_due_date) || '–'}
            </div>
            {r.return_note ? (
              <div className={`${muted} mt-0.5 line-clamp-1`} title={str(r.return_note)}>
                {str(r.return_note)}
              </div>
            ) : null}
          </div>
        );
      },
    },
  ];
}

const regLabel = (d: { reg_no?: number | null; fiscal_year?: number }) => (d.reg_no ? `รับที่ ${d.reg_no}${d.fiscal_year ? `/${d.fiscal_year}` : ''}` : 'ไม่มีเลขรับ');

/**
 * Quick dialog to bind/unbind an incoming document (ต้นเรื่อง) for an order or contract
 */
const QuickBindIncomingDialog: React.FC<{
  row: Row | null;
  singular: string;
  resource: Resource;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  notify: Notify;
}> = ({ row, singular, resource, onClose, onSuccess, notify }) => {
  const list = useIncomingOptions(true);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = list ?? [];
    if (!needle) return all.slice(0, 100);
    return all
      .filter((d) => [String(d.reg_no ?? ''), d.doc_no, d.subject, d.from_name].some((v) => v?.toLowerCase().includes(needle)))
      .slice(0, 100);
  }, [list, q]);

  if (!row) return null;

  const handlePick = async (docId: number | null, docLabel: string) => {
    setSaving(true);
    try {
      await procureApi.update(resource, row.id, {
        incoming_id: docId,
        expected_updated_at: row.updated_at,
      });
      notify(docId ? `ผูกหนังสือรับ "${docLabel}" กับ${singular}เรียบร้อยแล้ว` : `ปลดการผูกหนังสือรับแล้ว`, 'success');
      await onSuccess();
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={Boolean(row)} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl dark:bg-[var(--pf-surface)] border border-slate-200 dark:border-white/10 max-h-[92dvh] flex flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-white/10">
            <div>
              <Dialog.Title className="text-lg font-bold text-ink flex items-center gap-2">
                <Inbox className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                ผูกหนังสือรับต้นเรื่อง: {singular} {str(row.doc_no)}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-ink-5">
                {str(row.job_title)}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          {row.incoming_ref && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-900 ring-1 ring-teal-600/20 dark:bg-teal-500/10 dark:text-teal-200">
              <div className="truncate">
                <span className="font-semibold">ผูกอยู่กับ:</span> {str(row.incoming_ref)}
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => handlePick(null, '')}
                className="shrink-0 rounded px-2 py-1 font-semibold text-rose-700 hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-500/20 cursor-pointer"
              >
                ปลดการผูก
              </button>
            </div>
          )}

          <div className="mt-4 relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาเลขรับ, เลขที่เอกสาร, เรื่อง, หรือผู้ส่ง..."
              className="w-full rounded-lg pl-9 pr-4 py-2 text-sm border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 text-ink outline-none focus:ring-2 focus:ring-teal-500"
              autoFocus
            />
          </div>

          <div className="mt-3 flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
            {!list ? (
              <div className="py-12 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลดหนังสือรับ...
              </div>
            ) : shown.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">
                ไม่พบหนังสือรับที่ค้นหา
              </div>
            ) : (
              shown.map((doc) => {
                const isCurrent = String(row.incoming_id) === String(doc.id);
                return (
                  <button
                    key={doc.id}
                    type="button"
                    disabled={saving}
                    onClick={() => handlePick(doc.id, `รับที่ ${doc.reg_no}`)}
                    className={`w-full text-left rounded-xl p-3 border transition-all cursor-pointer ${
                      isCurrent
                        ? 'border-teal-500 bg-teal-50/70 ring-2 ring-teal-500/20 dark:bg-teal-500/10'
                        : 'border-slate-200 hover:border-teal-400 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-teal-700 dark:text-teal-300">
                        {regLabel(doc)}
                      </span>
                      {doc.doc_no && (
                        <span className="font-mono text-ink-5">
                          {doc.doc_no}
                        </span>
                      )}
                      {doc.doc_date && (
                        <span className="text-slate-500 ml-auto">
                          {thaiDate(doc.doc_date)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 font-medium text-ink line-clamp-2">
                      {doc.subject}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-ink-5">
                      <span>จาก: {doc.from_name || '–'}</span>
                      {doc.amount !== null && (
                        <span className="font-semibold text-ink-3">
                          {money(doc.amount)} บาท
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

/** Summary card that is also a button: it filters or sorts the table below */
const Kpi: React.FC<{
  label: string;
  /** A number counts smoothly to its new value (using `format`); anything else just flashes */
  value: number | string;
  format?: (n: number) => string;
  hint?: string;
  tone?: 'warn';
  /** What a click does, shown as the card's action line and tooltip */
  action: string;
  active?: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}> = ({ label, value, format, hint, tone, action, active, onClick, icon }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    title={action}
    className={`gov-card group flex w-full flex-col px-4 py-3 text-left transition-all duration-150 hover:-translate-y-px hover:border-[var(--brand-strong)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-strong,#1d4ed8)] cursor-pointer ${
      active ? 'bg-brand-soft border-[var(--brand-strong)] ring-2 ring-[var(--brand-strong)] dark:border-[var(--brand-accent)] dark:ring-[var(--brand-accent)]' : ''
    }`}
  >
    <span className="text-xs font-semibold text-ink-3">{label}</span>
    <span className={`mt-0.5 font-prompt text-xl font-bold tabular-nums ${tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-ink'}`}><Flash value={value} format={format}>{typeof value === 'number' && format ? format(value) : value}</Flash></span>
    {hint && <span className="mt-0.5 text-xs text-ink-4">{hint}</span>}
    <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand-strong)] dark:text-[var(--brand-accent)]">
      {icon}
      {active ? 'กำลังแสดง · คลิกเพื่อยกเลิก' : action}
      {!active && <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />}
    </span>
  </button>
);

const actionBtn = 'inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10 cursor-pointer';

type KpiFilter = 'notInspected' | 'notDisbursed' | 'linked' | 'unlinked' | 'guaranteeOpen' | 'guaranteeOverdue' | 'guaranteeReturned' | null;

export const RegistryTab: React.FC<Props> = ({
  def,
  fy,
  mode = 'fiscal',
  lookups,
  perms,
  notify,
  onCreateOrderFromIncoming,
  onCreateContractFromIncoming,
  pendingNewRow,
  onClearPendingNewRow,
}) => {
  /** Fiscal year stored on a new row: the selected one, or (calendar view) the one its date falls in */
  const fiscalFor = (dateIso?: unknown) => (mode === 'calendar' ? fiscalYearOf(typeof dateIso === 'string' && dateIso ? dateIso : todayIso()) : fy);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<GuaranteeFilter>('all');
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const dateFields = useMemo(() => (def.dateKeys ?? []).map((k) => ({ key: k, label: def.fields.find((f) => f.key === k)?.label ?? k })), [def]);
  const [range, setRange] = useState<DateRange>(() => emptyRange(def.dateKeys?.[0] ?? ''));
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>(null);
  const [sortRequest, setSortRequest] = useState<{ id: string; desc: boolean; nonce: number } | undefined>();
  const tableRef = React.useRef<HTMLDivElement>(null);
  const goToTable = () => requestAnimationFrame(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  const [exporting, setExporting] = useState(false);
  const [bindingIncomingFor, setBindingIncomingFor] = useState<Row | null>(null);
  /** `docNo` is the suggested next number when adding an order/contract */
  const [editing, setEditing] = useState<{ row: Row | null; docNo?: string; viewOnly?: boolean; initialOverride?: FormValues } | null>(null);

  useEffect(() => {
    if (pendingNewRow) {
      void (async () => {
        let docNo: string | undefined;
        if (def.autoDocNo && (def.resource === 'orders' || def.resource === 'contracts')) {
          try {
            docNo = (await procureApi.nextNo(def.resource, fiscalFor())).docNo;
          } catch {
            /* ignore */
          }
        }
        setEditing({
          row: null,
          docNo,
          initialOverride: pendingNewRow,
        });
        onClearPendingNewRow?.();
      })();
    }
  }, [pendingNewRow]);
  /** Rows ticked in the checkbox column */
  const [selected, setSelected] = useState<Set<number>>(new Set());
  /** Rows waiting for the "are you sure" dialog (one row from its trash button, or the ticked rows) */
  const [pendingDelete, setPendingDelete] = useState<Row[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** Row whose change history is open */
  const [historyOf, setHistoryOf] = useState<Row | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  /** Set when somebody else saved the row being edited; holds our unsaved payload */
  const [conflict, setConflict] = useState<{ error: ConflictError; payload: Record<string, unknown> } | null>(null);

  const isGuarantee = def.resource === 'guarantees';
  const isOrderLike = def.resource === 'orders' || def.resource === 'contracts';

  // Debounce the search box so we do not hit the database on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const [flashIds, flash, newIds] = useFlashIds();
  /** The rows as last loaded (JSON per id), to see which ones changed after a quiet reload */
  const lastLoad = React.useRef<Map<number, string> | null>(null);

  /**
   * `silent` reloads (live updates, save, delete) keep the table on screen and light up the rows that
   * were added or changed; a normal load shows the loading state and does not highlight anything.
   */
  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      lastLoad.current = null;
    }
    setError(null);
    try {
      const next = await procureApi.list(def.resource, fy, query, mode);
      const { ids, added, map } = changedIds(lastLoad.current ?? new Map(), next);
      if (silent && lastLoad.current && ids.size > 0) flash(ids, added);
      lastLoad.current = map;
      setRows(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      if (!silent) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.resource, fy, mode, query]);

  useLiveReload([def.resource], () => load(true));

  useEffect(() => {
    void load();
  }, [load]);

  const isOverdue = (r: Row) => !r.returned && typeof r.return_due_date === 'string' && daysUntil(r.return_due_date) < 0;
  const isDueSoon = (r: Row) => !r.returned && typeof r.return_due_date === 'string' && daysUntil(r.return_due_date) >= 0 && daysUntil(r.return_due_date) <= 30;

  const handleQuickUpdate = useCallback(
    async (id: number, key: string, value: string | null) => {
      const current = rows.find((r) => r.id === id);
      if (!current) return;
      try {
        await procureApi.update(def.resource, id, {
          [key]: value,
          expected_updated_at: current.updated_at,
        });
        setRows((prev) =>
          prev.map((r) => (r.id === id ? { ...r, [key]: value, updated_at: new Date().toISOString() } : r))
        );
        const labelMap: Record<string, string> = {
          responsible: 'ผู้รับผิดชอบ',
          budget_source: 'แหล่งงบ',
          status: 'สถานะ',
          method: 'วิธีจัดหา',
        };
        notify(`บันทึก${labelMap[key] || key}เรียบร้อย`, 'success');
      } catch (e) {
        if (e instanceof ConflictError) {
          notify('มีผู้อื่นแก้ไขรายการนี้ไปแล้ว กำลังโหลดข้อมูลใหม่', 'error');
          await load(true);
          return;
        }
        notify(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ', 'error');
      }
    },
    [def.resource, rows, notify, load]
  );

  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => {
    if (def.resource === 'orders' || def.resource === 'contracts') {
      return orderContractColumns({
        singular: def.singular,
        canEdit: perms.canEdit,
        lookups,
        onQuickUpdate: handleQuickUpdate,
        onPickIncoming: (row) => setBindingIncomingFor(row),
      });
    }
    if (def.resource === 'incoming') {
      return incomingColumns();
    }
    if (def.resource === 'guarantees') {
      return guaranteeColumns();
    }
    return def.fields
      .filter((f) => f.list && !f.hidden)
      .map((f) => ({
        id: f.key,
        // undefined (not null) so empty cells always sort last
        accessorFn: (r: Row) => r[f.key] ?? undefined,
        header: f.label,
        sortUndefined: 'last' as const,
        meta: { align: f.align, wide: f.type === 'textarea' || WIDE_KEYS.has(f.key), nowrap: f.type === 'date', label: f.label } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const r = row.original;
          const v = r[f.key];
          if (f.type === 'link') {
            return r.link_label ? (
              <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-500/10 dark:text-violet-300" title={str(r.link_label)}>
                <Link2 className="h-3 w-3 shrink-0" aria-hidden /> <span className="truncate">{str(r.link_label)}</span>
              </span>
            ) : (
              <span className="text-xs text-ink-6">ยังไม่เชื่อม</span>
            );
          }
          if (f.key === 'status' && v) {
            return <span className={`inline-block rounded-lg px-2.5 py-1 text-xs font-semibold leading-snug ring-1 ${statusTone(v)}`}>{String(v)}</span>;
          }
          if (f.type === 'checkbox') {
            return (
              <span
                className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                  v
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20'
                    : isOverdue(r)
                    ? 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20'
                    : 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-[var(--pf-head-bg)] dark:text-slate-300 dark:ring-[var(--pf-field-border)]'
                }`}
              >
                {v ? 'คืนแล้ว' : isOverdue(r) ? 'เลยกำหนด' : 'ยังไม่คืน'}
              </span>
            );
          }
          return cellText(f, v);
        },
      }));
  }, [def, handleQuickUpdate, lookups, perms.canEdit]);

  // Dropdown filters: options are the distinct values present in the loaded rows
  const filterDefs = useMemo(
    () =>
      (def.filterKeys ?? []).map((key) => {
        const field = def.fields.find((f) => f.key === key)!;
        const values = [...new Set(rows.map((r) => r[key]).filter((v): v is string => typeof v === 'string' && v !== ''))].sort((a, b) => a.localeCompare(b, 'th'));
        return { key, label: field.label, values };
      }),
    [def, rows]
  );
  const activeFilterCount = Object.values(colFilters).filter(Boolean).length + (isRangeActive(range) ? 1 : 0) + (kpiFilter ? 1 : 0);

  /** Rows after the filters above the table; the summary cards count these (so their numbers stay put when one is clicked) */
  const base = useMemo(() => {
    let out = rows;
    for (const [key, value] of Object.entries(colFilters)) if (value) out = out.filter((r) => r[key] === value);
    if (isRangeActive(range)) out = out.filter((r) => inRange(r, range));
    if (isGuarantee && filter === 'pending') out = out.filter((r) => !r.returned);
    if (isGuarantee && filter === 'overdue') out = out.filter(isOverdue);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filter, isGuarantee, colFilters, range]);

  const visible = useMemo(() => {
    if (kpiFilter === 'notInspected') return base.filter((r) => !r.inspected_date);
    if (kpiFilter === 'notDisbursed') return base.filter((r) => !r.disbursed_date);
    if (kpiFilter === 'linked') return base.filter((r) => Boolean(r.link_resource && r.link_id));
    if (kpiFilter === 'unlinked') return base.filter((r) => !r.link_resource || !r.link_id);
    if (kpiFilter === 'guaranteeOpen') return base.filter((r) => !r.returned);
    if (kpiFilter === 'guaranteeOverdue') return base.filter(isOverdue);
    if (kpiFilter === 'guaranteeReturned') return base.filter((r) => Boolean(r.returned));
    return base;
  }, [base, kpiFilter]);

  // Only rows that are still shown count as selected (a filter or reload may hide ticked rows)
  const selectedRows = useMemo(() => visible.filter((r) => selected.has(r.id)), [visible, selected]);

  const total = useMemo(
    () => (def.totalKey ? visible.reduce((sum, r) => sum + (Number(r[def.totalKey!]) || 0), 0) : 0),
    [visible, def.totalKey]
  );

  const kpis = useMemo(
    () => ({
      notInspected: base.filter((r) => !r.inspected_date).length,
      notDisbursed: base.filter((r) => !r.disbursed_date).length,
      linkedIncoming: base.filter((r) => Boolean(r.link_resource && r.link_id)).length,
      unlinkedIncoming: base.filter((r) => !r.link_resource || !r.link_id).length,
      guaranteeOpen: base.filter((r) => !r.returned).length,
      guaranteeOverdue: base.filter(isOverdue).length,
      guaranteeReturned: base.filter((r) => Boolean(r.returned)).length,
    }),
    [base]
  );

  const openNew = async () => {
    let docNo: string | undefined;
    if (def.autoDocNo && (def.resource === 'orders' || def.resource === 'contracts')) {
      try {
        docNo = (await procureApi.nextNo(def.resource, fiscalFor())).docNo;
      } catch {
        /* the number can still be typed by hand */
      }
    }
    setEditing({ row: null, docNo });
  };

  const save = async (values: FormValues) => {
    const payload = toPayload(def.fields, values);
    if (def.fiscalYear) payload.fiscal_year = fiscalFor(payload.doc_date ?? payload.received_date);
    if (editing?.row) {
      try {
        await procureApi.update(def.resource, editing.row.id, { ...payload, expected_updated_at: editing.row.updated_at });
      } catch (e) {
        if (e instanceof ConflictError) return setConflict({ error: e, payload });
        throw e;
      }
      notify('บันทึกการแก้ไขแล้ว', 'success');
    } else {
      await procureApi.create(def.resource, payload);
      notify(`เพิ่ม${def.singular}แล้ว`, 'success');
    }
    setEditing(null);
    await load(true);
  };

  const overwrite = async () => {
    if (!conflict || !editing?.row) return;
    try {
      await procureApi.update(def.resource, editing.row.id, { ...conflict.payload, expected_updated_at: conflict.error.current.updated_at ?? undefined });
    } catch (e) {
      if (e instanceof ConflictError) return setConflict({ error: e, payload: conflict.payload });
      throw e;
    }
    notify('บันทึกทับแล้ว', 'success');
    setConflict(null);
    setEditing(null);
    await load(true);
  };

  const remove = async () => {
    if (!editing?.row) return;
    await procureApi.remove(def.resource, editing.row.id);
    notify(`ลบ${def.singular}แล้ว`, 'success');
    setEditing(null);
    await load(true);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const ids = pendingDelete.map((r) => r.id);
      if (ids.length === 1) await procureApi.remove(def.resource, ids[0]);
      else await procureApi.removeMany(def.resource, ids);
      notify(ids.length === 1 ? `ลบ${def.singular}แล้ว` : `ลบ${def.singular} ${ids.length} รายการแล้ว`, 'success');
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      setPendingDelete(null);
      await load(true);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'ลบไม่สำเร็จ', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const exportCsv = () =>
    downloadCsv(
      `${def.tab}-${def.fiscalYear || mode === 'calendar' ? (mode === 'calendar' ? `พศ${fy}` : fy) : 'ทั้งหมด'}.csv`,
      def.fields.filter((f) => !f.hidden).map((f) => f.label),
      visible.map((r) => def.fields.filter((f) => !f.hidden).map((f) => cellText(f, r[f.type === 'incoming' ? 'incoming_ref' : f.type === 'link' ? 'link_label' : f.key])))
    );

  /** Human-readable list of what is currently filtered, for the Excel header */
  const filterNotes = (): string[] => {
    const parts: string[] = [];
    if (def.fiscalYear || mode === 'calendar') parts.push(mode === 'calendar' ? `ปี พ.ศ. ${fy} (ตามวันที่ของเอกสาร)` : `ปีงบประมาณ พ.ศ. ${fy}`);
    if (query) parts.push(`คำค้น: ${query}`);
    for (const fd of filterDefs) if (colFilters[fd.key]) parts.push(`${fd.label}: ${colFilters[fd.key]}`);
    if (isRangeActive(range)) {
      const label = dateFields.find((f) => f.key === range.key)?.label ?? range.key;
      parts.push(`${label}: ${range.from ? thaiDate(range.from) : 'ไม่จำกัด'} – ${range.to ? thaiDate(range.to) : 'ไม่จำกัด'}`);
    }
    if (isGuarantee && filter !== 'all') parts.push(filter === 'pending' ? 'เฉพาะที่ยังไม่คืน' : 'เฉพาะที่เลยกำหนดคืน');
    return [parts.join('  ·  ') || 'ข้อมูลทั้งหมด'];
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      await exportXlsx(excelFilename(def.tab), [
        { name: def.tab, title: def.tab, notes: filterNotes(), columns: columnsFromFields(def.fields), rows: visible, totalKey: def.totalKey },
      ]);
      notify(`ส่งออก Excel แล้ว (${visible.length} รายการ)`, 'success');
    } catch (e) {
      notify(e instanceof Error ? `ส่งออก Excel ไม่สำเร็จ: ${e.message}` : 'ส่งออก Excel ไม่สำเร็จ', 'error');
    } finally {
      setExporting(false);
    }
  };

  const filterChips: { id: GuaranteeFilter; label: string; count: number }[] = [
    { id: 'all', label: 'ทั้งหมด', count: rows.length },
    { id: 'pending', label: 'ยังไม่คืน', count: rows.filter((r) => !r.returned).length },
    { id: 'overdue', label: 'เลยกำหนดคืน', count: rows.filter(isOverdue).length },
  ];

  const initial = useMemo(() => {
    if (!editing) return {};
    const values = toFormValues(def.fields, editing.row);
    if (!editing.row) {
      if (editing.docNo) values.doc_no = editing.docNo;
      if (editing.initialOverride) Object.assign(values, editing.initialOverride);
    }
    return values;
  }, [editing, def.fields]);

  return (
    <section aria-label={def.tab} className="space-y-4">
      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="min-h-[40px] rounded-lg px-3 font-semibold underline cursor-pointer">
            ลองใหม่
          </button>
        </div>
      )}

      {/* 4 Professional Balanced KPI Cards for each resource */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Card 1: Total items */}
        <Kpi
          label={`${def.singular}ทั้งหมด`}
          value={base.length}
          format={(n) => Math.round(n).toLocaleString('th-TH')}
          hint={activeFilterCount - (kpiFilter ? 1 : 0) > 0 ? 'ตามตัวกรองที่เลือก' : periodLabel(mode, fy)}
          action="ดูรายการทั้งหมด"
          onClick={() => {
            setKpiFilter(null);
            goToTable();
          }}
        />

        {/* Card 2: Financial total or secondary counter */}
        {def.totalKey ? (
          <Kpi
            label={isOrderLike ? 'มูลค่ารวม (ราคาที่ตกลง)' : 'ราคารวม'}
            value={base.reduce((s, r) => s + (Number(r[def.totalKey!]) || 0), 0)}
            format={money}
            hint="บาท"
            action="เรียงจากมูลค่าสูงสุด"
            icon={<ArrowDownWideNarrow className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => {
              setSortRequest({ id: def.totalKey!, desc: true, nonce: Date.now() });
              goToTable();
            }}
          />
        ) : isGuarantee ? (
          <Kpi
            label="ยังไม่คืนหลักประกัน"
            value={kpis.guaranteeOpen}
            format={(n) => Math.round(n).toLocaleString('th-TH')}
            tone={kpis.guaranteeOpen > 0 ? 'warn' : undefined}
            hint="รอคืนเมื่อครบสัญญา"
            action="ดูรายการที่ยังไม่คืน"
            active={kpiFilter === 'guaranteeOpen'}
            onClick={() => {
              setKpiFilter((k) => (k === 'guaranteeOpen' ? null : 'guaranteeOpen'));
              goToTable();
            }}
          />
        ) : (
          <div />
        )}

        {/* Card 3: Status 1 */}
        {isOrderLike ? (
          <Kpi
            label="ยังไม่ตรวจรับ"
            value={kpis.notInspected}
            format={(n) => Math.round(n).toLocaleString('th-TH')}
            tone={kpis.notInspected > 0 ? 'warn' : undefined}
            hint="ยังไม่มีวันที่ตรวจรับ"
            action="ดูรายการที่ยังไม่ตรวจรับ"
            active={kpiFilter === 'notInspected'}
            onClick={() => {
              setKpiFilter((k) => (k === 'notInspected' ? null : 'notInspected'));
              goToTable();
            }}
          />
        ) : def.resource === 'incoming' ? (
          <Kpi
            label="เชื่อมโยงใบสั่ง/สัญญาแล้ว"
            value={kpis.linkedIncoming}
            format={(n) => Math.round(n).toLocaleString('th-TH')}
            hint="เปิดใบสั่งหรือสัญญาแล้ว"
            action="ดูรายการที่เชื่อมแล้ว"
            active={kpiFilter === 'linked'}
            onClick={() => {
              setKpiFilter((k) => (k === 'linked' ? null : 'linked'));
              goToTable();
            }}
          />
        ) : isGuarantee ? (
          <Kpi
            label="เลยกำหนดเวลาคืน"
            value={kpis.guaranteeOverdue}
            format={(n) => Math.round(n).toLocaleString('th-TH')}
            tone={kpis.guaranteeOverdue > 0 ? 'warn' : undefined}
            hint="เกินกำหนดส่งคืน"
            action="ดูรายการที่เลยกำหนด"
            active={kpiFilter === 'guaranteeOverdue'}
            onClick={() => {
              setKpiFilter((k) => (k === 'guaranteeOverdue' ? null : 'guaranteeOverdue'));
              goToTable();
            }}
          />
        ) : (
          <div />
        )}

        {/* Card 4: Status 2 */}
        {isOrderLike ? (
          <Kpi
            label="ยังไม่ส่งเบิก"
            value={kpis.notDisbursed}
            format={(n) => Math.round(n).toLocaleString('th-TH')}
            tone={kpis.notDisbursed > 0 ? 'warn' : undefined}
            hint="ยังไม่มีวันที่ส่งเบิก"
            action="ดูรายการที่ยังไม่ส่งเบิก"
            active={kpiFilter === 'notDisbursed'}
            onClick={() => {
              setKpiFilter((k) => (k === 'notDisbursed' ? null : 'notDisbursed'));
              goToTable();
            }}
          />
        ) : def.resource === 'incoming' ? (
          <Kpi
            label="ยังไม่เชื่อมโยง (รอดำเนินการ)"
            value={kpis.unlinkedIncoming}
            format={(n) => Math.round(n).toLocaleString('th-TH')}
            tone={kpis.unlinkedIncoming > 0 ? 'warn' : undefined}
            hint="ยังไม่ได้เปิดใบสั่ง/สัญญา"
            action="ดูรายการที่ยังไม่เชื่อม"
            active={kpiFilter === 'unlinked'}
            onClick={() => {
              setKpiFilter((k) => (k === 'unlinked' ? null : 'unlinked'));
              goToTable();
            }}
          />
        ) : isGuarantee ? (
          <Kpi
            label="คืนเรียบร้อยแล้ว"
            value={kpis.guaranteeReturned}
            format={(n) => Math.round(n).toLocaleString('th-TH')}
            hint="ส่งมอบหลักประกันคืนแล้ว"
            action="ดูรายการที่คืนแล้ว"
            active={kpiFilter === 'guaranteeReturned'}
            onClick={() => {
              setKpiFilter((k) => (k === 'guaranteeReturned' ? null : 'guaranteeReturned'));
              goToTable();
            }}
          />
        ) : (
          <div />
        )}
      </div>

      <div ref={tableRef} className="scroll-mt-4">
      <DataTable
        sortRequest={sortRequest}
        ariaLabel={def.tab}
        storageKey={def.resource}
        toolbar={
          <>
            <div className="relative flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`ค้นหา${def.tab}...`}
                aria-label={`ค้นหา${def.tab}`}
                className="pf-field w-full min-h-[40px] rounded-lg py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              {selectedRows.length > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-1 text-sm font-semibold" role="status">
                  เลือกแล้ว {selectedRows.length.toLocaleString('th-TH')} รายการ
                  <button type="button" onClick={() => setSelected(new Set())} className="inline-flex min-h-[32px] items-center gap-1 rounded px-2 text-xs underline cursor-pointer">
                    <X className="h-3.5 w-3.5" aria-hidden /> ยกเลิกการเลือก
                  </button>
                  {perms.canDelete && (
                    <button
                      type="button"
                      onClick={() => setPendingDelete(selectedRows)}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-500 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden /> ลบที่เลือก
                    </button>
                  )}
                </div>
              )}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger
                  disabled={visible.length === 0 || exporting}
                  className="pf-btn inline-flex min-h-[40px] items-center gap-2 rounded-lg px-4 text-sm font-semibold cursor-pointer"
                >
                  <Download className="h-4 w-4" aria-hidden /> {exporting ? 'กำลังสร้างไฟล์...' : 'ส่งออก'} <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" sideOffset={6} className="pf-menu z-[70] min-w-60 rounded-xl p-1">
                    <DropdownMenu.Item
                      onSelect={() => void exportExcel()}
                      className="pf-item flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg px-3 text-sm outline-none"
                    >
                      <FileSpreadsheet className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden /> Excel (.xlsx)
                      <span className="ml-auto text-xs text-ink-4">{visible.length} แถว</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      onSelect={exportCsv}
                      className="pf-item flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg px-3 text-sm outline-none"
                    >
                      <FileText className="h-4 w-4" aria-hidden /> CSV
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              {perms.canDelete && (
                <button type="button" onClick={() => setShowTrash(true)} className="pf-btn inline-flex min-h-[40px] items-center gap-2 rounded-lg px-4 text-sm font-semibold cursor-pointer">
                  <Trash2 className="h-4 w-4" aria-hidden /> ถังขยะ
                </button>
              )}
              {perms.canCreate && (
                <button
                  type="button"
                  onClick={() => void openNew()}
                  className="btn-brand inline-flex min-h-[40px] items-center gap-2 rounded-lg px-4 text-sm font-semibold cursor-pointer"
                >
                  <Plus className="h-4 w-4" /> เพิ่ม{def.singular}
                </button>
              )}
            </div>
          </>
        }
        filters={
          <div className="space-y-2">
            {isGuarantee ? (
                        <div className="flex flex-wrap gap-2" role="group" aria-label="กรองหลักประกัน">
                          {filterChips.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              aria-pressed={filter === c.id}
                              onClick={() => setFilter(c.id)}
                              className={`min-h-[36px] rounded-full px-4 text-sm font-semibold ring-1 transition-colors cursor-pointer ${
                                filter === c.id
                                  ? 'bg-brand-soft text-brand ring-current'
                                  : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50 dark:bg-[var(--pf-surface)] dark:text-slate-300 dark:ring-[var(--pf-field-border)] dark:hover:bg-[var(--pf-hover)]'
                              }`}
                            >
                              {c.label} <span className="tabular-nums">({c.count})</span>
                            </button>
                          ))}
                        </div>
                      ) : filterDefs.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2" role="group" aria-label="ตัวกรอง">
                          {filterDefs.map((fd) => (
                            <div key={fd.key} className="flex items-center gap-2 text-sm text-ink-3">
                              {fd.label.replace(/การจัดซื้อจัดจ้าง|ที่ได้รับ|ของงบประมาณ/g, '').trim()}
                              <Select
                                value={colFilters[fd.key] ?? ''}
                                onValueChange={(v) => setColFilters((prev) => ({ ...prev, [fd.key]: v }))}
                                options={[{ value: '', label: 'ทั้งหมด' }, ...fd.values.map((v) => ({ value: v, label: v }))]}
                                ariaLabel={`กรอง${fd.label}`}
                                className="max-w-[16rem]"
                              />
                            </div>
                          ))}
                          {activeFilterCount > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                    setColFilters({});
                    setKpiFilter(null);
                    setRange(emptyRange(range.key));
                  }}
                              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-slate-800 underline-offset-2 hover:underline dark:text-slate-200 cursor-pointer"
                            >
                              <FilterX className="h-4 w-4" aria-hidden /> ล้างตัวกรอง ({activeFilterCount})
                            </button>
                          )}
                        </div>
                      ) : undefined}
            {dateFields.length > 0 && <DateRangeFilter fields={dateFields} fy={fy} value={range} onChange={setRange} />}
          </div>
        }
        data={visible}
        columns={columns}
        loading={loading}
        emptyText={query || activeFilterCount > 0 ? 'ไม่พบรายการที่ตรงกับเงื่อนไข' : `ยังไม่มี${def.singular}`}
        selection={perms.canDelete ? { getRowKey: (r) => r.id, selected, onChange: setSelected } : undefined}
        rowActions={(r) => (
          <div className="inline-flex items-center gap-1">
            <button type="button" onClick={() => setEditing({ row: r, viewOnly: true })} title="ดูรายละเอียด" aria-label="ดูรายละเอียด" className={actionBtn}>
              <Eye className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" onClick={() => setHistoryOf(r)} title="ประวัติการแก้ไข" aria-label="ประวัติการแก้ไข" className={actionBtn}>
              <History className="h-4 w-4" aria-hidden />
            </button>
            {perms.canEdit && (
              <button type="button" onClick={() => setEditing({ row: r })} title="แก้ไข" aria-label="แก้ไข" className={actionBtn}>
                <Pencil className="h-4 w-4" aria-hidden />
              </button>
            )}
            {perms.canCreate && def.resource === 'incoming' && (
              <>
                {onCreateOrderFromIncoming && (
                  <button
                    type="button"
                    onClick={() => onCreateOrderFromIncoming(r)}
                    title="สร้างใบสั่งซื้อ/จ้าง จากหนังสือรับนี้"
                    aria-label="สร้างใบสั่งซื้อ/จ้าง จากหนังสือรับนี้"
                    className={`${actionBtn} text-teal-700 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-500/10`}
                  >
                    <ShoppingCart className="h-4 w-4" aria-hidden />
                  </button>
                )}
                {onCreateContractFromIncoming && (
                  <button
                    type="button"
                    onClick={() => onCreateContractFromIncoming(r)}
                    title="สร้างสัญญา จากหนังสือรับนี้"
                    aria-label="สร้างสัญญา จากหนังสือรับนี้"
                    className={`${actionBtn} text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-500/10`}
                  >
                    <FileSignature className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </>
            )}
            {perms.canDelete && (
              <button
                type="button"
                onClick={() => setPendingDelete([r])}
                title="ลบ"
                aria-label="ลบ"
                className={`${actionBtn} text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10`}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        )}
        onRowClick={(row) => setEditing({ row })}
        rowClassName={(r) =>
          [
            isGuarantee && isOverdue(r) ? 'bg-rose-50/70 dark:bg-rose-500/5' : isGuarantee && isDueSoon(r) ? 'bg-amber-50/70 dark:bg-amber-500/5' : '',
            newIds.has(r.id) ? 'row-new' : flashIds.has(r.id) ? 'row-flash' : '',
          ]
            .filter(Boolean)
            .join(' ') || undefined
        }
        footer={
          def.totalKey && visible.length > 0 ? (
            <>
              {visible.length} รายการ · รวม <span className="tabular-nums">{money(total)}</span> บาท
            </>
          ) : undefined
        }
      />
      </div>

      {editing && (
        <RecordDialog
          title={def.singular}
          fields={def.fields}
          lookups={lookups}
          initial={initial}
          isNew={!editing.row}
          canEdit={editing.viewOnly ? false : editing.row ? perms.canEdit : perms.canCreate}
          canDelete={editing.viewOnly ? false : perms.canDelete}
          warnings={def.warnings}
          // Picking a known vendor fills in its tax ID (only when that field is still empty)
          onFieldChange={(key, value, values) => {
            if (key !== 'vendor_name' || typeof value !== 'string') return;
            const tax = lookups?.vendorTax?.[value];
            if (tax && !String(values.vendor_tax_id ?? '').trim()) return { vendor_tax_id: tax };
          }}
          onSave={save}
          onDelete={remove}
          onClose={() => setEditing(null)}
          onEdit={editing.viewOnly && editing.row && perms.canEdit ? () => setEditing({ row: editing.row }) : undefined}
        >
          {isOrderLike && editing.row ? <CaseFile resource={def.resource as 'orders' | 'contracts'} id={Number(editing.row.id)} /> : null}
        </RecordDialog>
      )}

      {conflict && (
        <ConflictDialog
          what={def.singular}
          conflict={conflict.error}
          onReload={() => {
            setConflict(null);
            setEditing(null);
            void load(true);
          }}
          onCancel={() => setConflict(null)}
          onOverwrite={overwrite}
        />
      )}

      {showTrash && (
        <TrashDialog
          resource={def.resource}
          singular={def.singular}
          titleOf={(r) => String(r[def.fields.find((f) => f.list)?.key ?? 'id'] ?? '').slice(0, 120)}
          notify={notify}
          onRestored={() => void load(true)}
          onClose={() => setShowTrash(false)}
        />
      )}

      {historyOf && (
        <RowHistoryDialog
          resource={def.resource}
          recordId={historyOf.id}
          title={String(historyOf[def.fields.find((f) => f.list)?.key ?? 'id'] ?? '').slice(0, 80)}
          onClose={() => setHistoryOf(null)}
        />
      )}

      <Dialog.Root open={pendingDelete !== null} onOpenChange={(o) => !o && !deleting && setPendingDelete(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-900/55 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-chroma-subtle bg-chroma-card p-6 shadow-2xl focus:outline-none">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/40">
                <TriangleAlert className="h-5 w-5 text-rose-600 dark:text-rose-400" aria-hidden />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="text-lg font-semibold text-ink">
                  ลบ{def.singular}{pendingDelete && pendingDelete.length > 1 ? ` ${pendingDelete.length} รายการ` : ''}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-ink-4">
                  {pendingDelete && pendingDelete.length === 1
                    ? `ต้องการลบ "${String(pendingDelete[0][def.fields.find((f) => f.list)?.key ?? 'id'] ?? '').slice(0, 80)}" ใช่หรือไม่`
                    : 'ต้องการลบรายการที่เลือกทั้งหมดใช่หรือไม่'}{' '}
                  รายการจะถูกย้ายไปถังขยะ และกู้คืนได้ภายใน 30 วัน
                </Dialog.Description>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Dialog.Close asChild>
                <button type="button" disabled={deleting} className="min-h-[44px] rounded-lg border border-slate-300 px-5 text-sm font-semibold hover:bg-slate-50 dark:border-[var(--pf-field-border)] dark:hover:bg-[var(--pf-hover)] cursor-pointer disabled:opacity-60">
                  ยกเลิก
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleting}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-rose-700 px-5 text-sm font-semibold text-white hover:bg-rose-800 cursor-pointer disabled:opacity-80"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                ยืนยันลบ
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {bindingIncomingFor && (
        <QuickBindIncomingDialog
          row={bindingIncomingFor}
          singular={def.singular}
          resource={def.resource}
          onClose={() => setBindingIncomingFor(null)}
          onSuccess={async () => {
            await load(true);
          }}
          notify={notify}
        />
      )}
    </section>
  );
};
