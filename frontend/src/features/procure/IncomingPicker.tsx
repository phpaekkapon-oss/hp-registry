import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, Inbox, Link2, Search, X } from 'lucide-react';
import { procureApi, type IncomingOption } from './api';
import { money, thaiDate } from './format';

/** Loaded once per page and shared by every form (the list changes rarely; reopening a form refreshes it) */
let cache: Promise<IncomingOption[]> | null = null;
export const loadIncomingOptions = (fresh = false) => {
  if (!cache || fresh) cache = procureApi.incomingOptions().catch((e) => {
    cache = null;
    throw e;
  });
  return cache;
};

export function useIncomingOptions(fresh = false): IncomingOption[] | null {
  const [list, setList] = useState<IncomingOption[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadIncomingOptions(fresh).then((l) => alive && setList(l)).catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [fresh]);
  return list;
}

const regLabel = (d: IncomingOption) => (d.reg_no ? `รับที่ ${d.reg_no}/${d.fiscal_year}` : 'ไม่มีเลขรับ');

/** One-line description of a letter, for the read-only view */
export const IncomingRefText: React.FC<{ id: string }> = ({ id }) => {
  const list = useIncomingOptions();
  const d = list?.find((x) => String(x.id) === id);
  if (!list) return <span className="text-slate-400">กำลังโหลด...</span>;
  if (!d) return <span className="text-slate-500">หนังสือรับ #{id} (ไม่พบหรือถูกลบ)</span>;
  return (
    <div className="rounded-lg bg-teal-50/70 p-2 text-xs text-teal-950 ring-1 ring-teal-600/20 dark:bg-teal-500/10 dark:text-teal-200 dark:ring-teal-400/20">
      <div className="flex flex-wrap items-center gap-1.5 font-semibold">
        <Inbox className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" aria-hidden />
        <span>{regLabel(d)}</span>
        {d.doc_no && <span className="text-teal-700 dark:text-teal-300">· {d.doc_no}</span>}
        {d.doc_date && <span className="font-normal text-ink-5">· ลงวันที่ {thaiDate(d.doc_date)}</span>}
      </div>
      <div className="mt-1 font-medium text-ink">{d.subject}</div>
      {(d.from_name || d.amount !== null) && (
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-ink-4">
          {d.from_name && <span>จาก: {d.from_name}</span>}
          {d.amount !== null && <span>วงเงิน: {money(d.amount)} บาท</span>}
        </div>
      )}
    </div>
  );
};

interface Props {
  id?: string;
  /** incoming_docs.id as a string ('' = no link) */
  value: string;
  disabled?: boolean;
  /** Called with the letter picked (or null when the link is removed) */
  onPick: (doc: IncomingOption | null) => void;
}

/** Picks the incoming letter (หนังสือรับ) an order/contract came from */
export const IncomingPicker: React.FC<Props> = ({ id, value, disabled, onPick }) => {
  const list = useIncomingOptions(true);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = list?.find((d) => String(d.id) === value) ?? null;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = list ?? [];
    if (!needle) return all.slice(0, 200);
    return all
      .filter((d) => [String(d.reg_no ?? ''), d.doc_no, d.subject, d.from_name].some((v) => v?.toLowerCase().includes(needle)))
      .slice(0, 200);
  }, [list, q]);

  return (
    <div className="flex gap-2">
      <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) setQ(''); }}>
        <Popover.Trigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            className="pf-field flex min-h-[44px] w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm disabled:opacity-60 cursor-pointer"
          >
            <Inbox className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
            {selected ? (
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{regLabel(selected)}</span>
                {selected.doc_no && <span className="text-ink-4"> · {selected.doc_no}</span>}
                <span className="block truncate text-ink-3">{selected.subject}</span>
              </span>
            ) : value && list ? (
              <span className="flex-1 text-slate-500">หนังสือรับ #{value} (ไม่พบหรือถูกลบ)</span>
            ) : (
              <span className="flex-1 text-slate-500">{list ? 'เลือกหนังสือรับที่เป็นต้นเรื่อง (ถ้ามี)' : 'กำลังโหลดหนังสือรับ...'}</span>
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
                placeholder="ค้นหาเลขรับ เลขที่หนังสือ เรื่อง หรือหน่วยงานที่ส่ง..."
                aria-label="ค้นหาหนังสือรับ"
                className="pf-field min-h-[40px] w-full rounded-lg pl-9 pr-3 text-sm"
              />
            </div>
            <ul role="listbox" aria-label="หนังสือรับ" className="min-h-0 flex-1 overflow-y-auto">
              {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">{list ? 'ไม่พบหนังสือรับ' : 'กำลังโหลด...'}</li>}
              {shown.map((d) => {
                const isSel = String(d.id) === value;
                return (
                  <li key={d.id} role="option" aria-selected={isSel}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(d);
                        setOpen(false);
                      }}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-[var(--pf-hover)] cursor-pointer ${isSel ? 'bg-brand-soft ring-1 ring-[var(--brand-strong)]/30' : ''}`}
                    >
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-4">
                        <span className="font-semibold text-ink">{regLabel(d)}</span>
                        {d.doc_no && <span>{d.doc_no}</span>}
                        {d.doc_date && <span>{thaiDate(d.doc_date)}</span>}
                        {d.amount !== null && <span className="tabular-nums">{money(d.amount)} บาท</span>}
                        {d.linked.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                            <Link2 className="h-3 w-3" aria-hidden /> {d.linked.join(', ')}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block font-medium text-ink">{d.subject || '(ไม่มีเรื่อง)'}</span>
                      {d.from_name && <span className="block truncate text-xs text-ink-5">จาก {d.from_name}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            {(list?.length ?? 0) > shown.length && !q && <p className="px-3 pt-2 text-xs text-slate-500">แสดง 200 ฉบับล่าสุด พิมพ์ค้นหาเพื่อดูฉบับอื่น</p>}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {value && !disabled && (
        <button
          type="button"
          onClick={() => onPick(null)}
          title="ยกเลิกการอ้างอิง"
          aria-label="ยกเลิกการอ้างอิงหนังสือรับ"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[var(--pf-hover)] cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};
