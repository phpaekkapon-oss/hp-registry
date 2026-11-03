import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, FileSignature, Search, ShoppingCart, Sparkles, X } from 'lucide-react';
import { procureApi, type LinkOption } from './api';
import { money, thaiDate } from './format';

let cache: Promise<LinkOption[]> | null = null;
const loadLinkOptions = (fresh = false) => {
  if (!cache || fresh) cache = procureApi.linkOptions().catch((e) => {
    cache = null;
    throw e;
  });
  return cache;
};

function useLinkOptions(fresh = false): LinkOption[] | null {
  const [list, setList] = useState<LinkOption[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadLinkOptions(fresh).then((l) => alive && setList(l)).catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [fresh]);
  return list;
}

/** Roles a letter can play in a case (stored in incoming_docs.link_role) */
export const LINK_ROLES: { value: string; label: string; hint: string }[] = [
  { value: 'invoice', label: 'ใบแจ้งหนี้ / ใบส่งของ', hint: 'นับเป็นยอดเรียกเก็บของสัญญา/ใบสั่ง' },
  { value: 'origin', label: 'ต้นเรื่อง', hint: 'หนังสือที่ทำให้เกิดการจัดซื้อจัดจ้างนี้' },
  { value: 'other', label: 'เอกสารอื่น ๆ', hint: 'เช่น ขอขยายเวลา แจ้งส่งมอบ' },
];

/** Company words that differ between registers ("บ.", "บริษัท", "จำกัด"...) are ignored when comparing names */
const normName = (s: string | null | undefined) =>
  (s ?? '')
    .toLowerCase()
    .replace(/บริษัท|บ\.|ห้างหุ้นส่วนจำกัด|หจก\.|จำกัด|\(มหาชน\)|ร้าน|นางสาว|นาง|นาย|\s|\./g, '')
    .replace(/(.)\1+/g, '$1');

/** How likely an order/contract is the one a letter/guarantee belongs to (0 = no clue) */
function score(o: LinkOption, hint: LinkHint): number {
  let s = 0;
  if (hint.projectNo && o.project_no && hint.projectNo.replace(/\D/g, '') === o.project_no.replace(/\D/g, '')) s += 100;
  const a = normName(hint.vendor);
  const b = normName(o.vendor_name);
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a) || a.slice(0, 6) === b.slice(0, 6))) s += 60;
  const words = (hint.text ?? '').split(/\s+/).filter((w) => w.length >= 4);
  const title = o.job_title ?? '';
  s += Math.min(30, words.filter((w) => title.includes(w)).length * 10);
  const docNo = hint.text?.match(/(\d{1,4}\/25\d\d)/)?.[1];
  if (docNo && o.doc_no === docNo) s += 40;
  return s;
}

export interface LinkHint {
  vendor?: string | null;
  projectNo?: string | null;
  /** Subject/title text, also searched for a "12/2568"-style document number */
  text?: string | null;
}

const optionLabel = (o: LinkOption) => `${o.kind} ${o.doc_no ?? `#${o.id}`}`;

export const LinkRefText: React.FC<{ value: string }> = ({ value }) => {
  const list = useLinkOptions();
  const o = list?.find((x) => x.ref === value);
  if (!list) return <span className="text-slate-400">กำลังโหลด...</span>;
  if (!o) return <span className="text-slate-500">ไม่พบ (อาจถูกลบ)</span>;
  return (
    <span>
      <span className="font-semibold">{optionLabel(o)}</span>
      {o.vendor_name && <> · {o.vendor_name}</>}
      <span className="block font-normal text-ink-3">{o.job_title}</span>
    </span>
  );
};

interface Props {
  id?: string;
  /** "orders:5" | "contracts:3" | '' */
  value: string;
  onChange: (ref: string) => void;
  disabled?: boolean;
  hint?: LinkHint;
  /** Letters: what this letter is to the case */
  role?: string;
  onRoleChange?: (role: string) => void;
}

/** Picks the order/contract a letter, guarantee or progress project belongs to; likely matches come first */
export const LinkPicker: React.FC<Props> = ({ id, value, onChange, disabled, hint, role, onRoleChange }) => {
  const list = useLinkOptions(true);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = list?.find((o) => o.ref === value) ?? null;

  const ranked = useMemo(() => {
    const all = (list ?? []).map((o) => ({ o, s: hint ? score(o, hint) : 0 }));
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? all.filter(({ o }) => [o.doc_no, o.job_title, o.vendor_name, o.project_no, o.kind].some((v) => v?.toLowerCase().includes(needle)))
      : all;
    return filtered.sort((a, b) => b.s - a.s).slice(0, 200);
  }, [list, q, hint]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) setQ(''); }}>
          <Popover.Trigger asChild>
            <button id={id} type="button" disabled={disabled} className="pf-field flex min-h-[44px] w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm disabled:opacity-60 cursor-pointer">
              {selected?.resource === 'contracts' ? (
                <FileSignature className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden />
              ) : (
                <ShoppingCart className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
              )}
              {selected ? (
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{optionLabel(selected)}</span>
                  {selected.vendor_name && <span className="text-ink-4"> · {selected.vendor_name}</span>}
                  <span className="block truncate text-ink-3">{selected.job_title}</span>
                </span>
              ) : (
                <span className="flex-1 text-slate-500">{list ? 'เลือกใบสั่งซื้อ/จ้าง หรือสัญญา (ถ้ามี)' : 'กำลังโหลด...'}</span>
              )}
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              sideOffset={4}
              collisionPadding={12}
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                searchRef.current?.focus();
              }}
              className="pf-menu z-[120] flex max-h-[min(28rem,var(--radix-popover-content-available-height))] w-[min(44rem,calc(100vw-2rem))] flex-col rounded-xl p-2"
            >
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  ref={searchRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ค้นหาเลขที่ ชื่องาน ผู้ประกอบการ หรือเลขโครงการ e-GP..."
                  aria-label="ค้นหาใบสั่ง/สัญญา"
                  className="pf-field min-h-[40px] w-full rounded-lg pl-9 pr-3 text-sm"
                />
              </div>
              <ul role="listbox" aria-label="ใบสั่งซื้อ/จ้าง และสัญญา" className="min-h-0 flex-1 overflow-y-auto">
                {ranked.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">{list ? 'ไม่พบรายการ' : 'กำลังโหลด...'}</li>}
                {ranked.map(({ o, s }) => (
                  <li key={o.ref} role="option" aria-selected={o.ref === value}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(o.ref);
                        setOpen(false);
                      }}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-[var(--pf-hover)] cursor-pointer ${o.ref === value ? 'bg-brand-soft ring-1 ring-[var(--brand-strong)]/30' : ''}`}
                    >
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-4">
                        <span className={`font-semibold ${o.resource === 'contracts' ? 'text-violet-700 dark:text-violet-300' : 'text-sky-700 dark:text-sky-300'}`}>{optionLabel(o)}</span>
                        {o.doc_date && <span>{thaiDate(o.doc_date)}</span>}
                        {o.agreed_price !== null && <span className="tabular-nums">{money(o.agreed_price)} บาท</span>}
                        {o.project_no && <span>e-GP {o.project_no}</span>}
                        {s >= 40 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                            <Sparkles className="h-3 w-3" aria-hidden /> แนะนำ
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block font-medium text-ink">{o.job_title}</span>
                      {o.vendor_name && <span className="block truncate text-xs text-ink-5">{o.vendor_name}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        {value && !disabled && (
          <button type="button" onClick={() => onChange('')} title="ยกเลิกการเชื่อม" aria-label="ยกเลิกการเชื่อมใบสั่ง/สัญญา" className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[var(--pf-hover)] cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {onRoleChange && value && (
        <div role="radiogroup" aria-label="หนังสือฉบับนี้เป็น" className="flex flex-wrap gap-2">
          {LINK_ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={(role || 'invoice') === r.value}
              disabled={disabled}
              onClick={() => onRoleChange(r.value)}
              title={r.hint}
              className={`min-h-[36px] rounded-full px-3 text-xs font-semibold ring-1 transition-colors cursor-pointer ${
                (role || 'invoice') === r.value
                  ? 'bg-brand-soft text-brand ring-current'
                  : 'text-slate-700 ring-slate-300 hover:bg-slate-50 dark:text-slate-300 dark:ring-[var(--pf-field-border)] dark:hover:bg-[var(--pf-hover)]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
