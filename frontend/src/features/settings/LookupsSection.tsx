import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { lookupApi, type LookupData, type LookupItem, type LookupKind } from './systemApi';

const KINDS: { kind: LookupKind; hint: string }[] = [
  { kind: 'staff', hint: 'รายชื่อเจ้าหน้าที่พัสดุ ใช้ในช่องผู้รับผิดชอบและผู้ดำเนินการ' },
  { kind: 'group', hint: 'กลุ่มงานที่เป็นเจ้าของเรื่อง' },
  { kind: 'fund', hint: 'แหล่งเงินที่ใช้จัดซื้อจัดจ้าง' },
  { kind: 'method', hint: 'วิธีการจัดซื้อจัดจ้างตาม พ.ร.บ. จัดซื้อจัดจ้างฯ' },
  { kind: 'status', hint: 'ขั้นตอนของงาน ใช้แสดงป้ายสถานะในทะเบียน' },
  { kind: 'unit', hint: 'หน่วยนับของงาน/รายการ' },
];

const iconBtn =
  'inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-300 dark:hover:bg-[var(--pf-hover)] dark:hover:text-white cursor-pointer disabled:cursor-default';
const field = 'pf-field min-h-[40px] w-full rounded-lg px-3 text-sm';

/** Settings → ตัวเลือกข้อมูล: add, rename, reorder and remove the dropdown choices used in the registers */
export const LookupsSection: React.FC = () => {
  const [data, setData] = useState<LookupData | null>(null);
  const [kind, setKind] = useState<LookupKind>('staff');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<{ id: number; value: string; apply: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await lookupApi.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Run a change, show its result, then reload the lists */
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const msg = await fn();
      if (msg) setNotice(msg);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return error ? (
      <p role="alert" className="text-sm font-medium text-rose-700 dark:text-rose-300">{error}</p>
    ) : (
      <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" aria-label="กำลังโหลด" /></div>
    );
  }

  const items = data[kind].items;
  const meta = KINDS.find((k) => k.kind === kind)!;
  const q = filter.trim().toLowerCase();
  const shown = q ? items.filter((i) => i.value.toLowerCase().includes(q)) : items;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = draft.trim();
    if (!value) return;
    if (await run(async () => { await lookupApi.add(kind, value); return `เพิ่ม “${value}” แล้ว`; })) setDraft('');
  };

  const move = (item: LookupItem, step: -1 | 1) => {
    const ids = items.map((i) => i.id);
    const at = ids.indexOf(item.id);
    [ids[at], ids[at + step]] = [ids[at + step], ids[at]];
    // Show the new order at once; the reload confirms it
    setData({ ...data, [kind]: { ...data[kind], items: ids.map((id) => items.find((i) => i.id === id)!) } });
    void run(() => lookupApi.reorder(kind, ids));
  };

  const saveEdit = async (item: LookupItem) => {
    if (!editing) return;
    const value = editing.value.trim();
    if (!value || value === item.value) return setEditing(null);
    const ok = await run(async () => {
      const r = await lookupApi.rename(item.id, value, editing.apply);
      return editing.apply && r.updatedRecords > 0 ? `แก้ไขเป็น “${value}” และปรับในทะเบียน ${r.updatedRecords} รายการแล้ว` : `แก้ไขเป็น “${value}” แล้ว`;
    });
    if (ok) setEditing(null);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
      {/* Kinds */}
      <nav aria-label="ประเภทตัวเลือก" className="gov-card self-start p-2">
        {KINDS.map(({ kind: k }) => (
          <button
            key={k}
            type="button"
            onClick={() => { setKind(k); setEditing(null); setConfirmDelete(null); setFilter(''); setNotice(null); setError(null); }}
            aria-current={kind === k ? 'page' : undefined}
            className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm font-semibold transition-colors cursor-pointer ${
              kind === k ? 'bg-brand-soft text-slate-950 ring-1 ring-[var(--brand-strong)]/30 dark:text-white' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5'
            }`}
          >
            <span className="truncate">{data[k].label}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs tabular-nums text-slate-600 dark:bg-white/10 dark:text-slate-300">{data[k].items.length}</span>
          </button>
        ))}
      </nav>

      {/* Values of the chosen kind */}
      <section className="gov-card min-w-0 p-5">
        <div className="mb-4">
          <h3 className="font-prompt text-base font-bold">{data[kind].label}</h3>
          <p className="mt-0.5 text-sm text-ink-4">{meta.hint} · ลำดับในรายการนี้คือลำดับที่แสดงใน dropdown</p>
        </div>

        <form onSubmit={add} className="mb-4 flex flex-wrap gap-2">
          <label htmlFor="lookup-new" className="sr-only">เพิ่มตัวเลือกใหม่</label>
          <input id="lookup-new" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={255} placeholder={`เพิ่ม${data[kind].label}ใหม่...`} className={`${field} min-w-[14rem] flex-1`} />
          <button type="submit" disabled={busy || !draft.trim()} className="btn-brand inline-flex min-h-[40px] items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 cursor-pointer">
            <Plus className="h-4 w-4" aria-hidden /> เพิ่ม
          </button>
        </form>

        {(error || notice) && (
          <p role={error ? 'alert' : 'status'} className={`mb-3 rounded-lg px-3 py-2 text-sm font-medium ring-1 ${
            error ? 'bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20' : 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-400/20'
          }`}>
            {error ?? notice}
          </p>
        )}

        {items.length > 8 && (
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="ค้นหาในรายการ..." aria-label="ค้นหาในรายการ" className={`${field} pl-9`} />
          </div>
        )}

        {shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-5">{q ? 'ไม่พบตัวเลือกที่ค้นหา' : 'ยังไม่มีตัวเลือก'}</p>
        ) : (
          <ol className="divide-y divide-slate-200 overflow-hidden rounded-xl ring-1 ring-slate-200 dark:divide-white/10 dark:ring-white/10">
            {shown.map((item) => {
              const index = items.indexOf(item);
              const isEditing = editing?.id === item.id;
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                  <span className="w-6 text-right text-xs tabular-nums text-slate-400">{index + 1}</span>

                  {isEditing ? (
                    <form className="flex min-w-0 flex-1 flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void saveEdit(item); }}>
                      <div className="flex gap-2">
                        <input
                          autoFocus
                          value={editing.value}
                          maxLength={255}
                          aria-label="ชื่อตัวเลือก"
                          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                          onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                          className={field}
                        />
                        <button type="submit" disabled={busy} title="บันทึก" aria-label="บันทึก" className={`${iconBtn} text-emerald-700 dark:text-emerald-400`}>
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </button>
                        <button type="button" onClick={() => setEditing(null)} title="ยกเลิก" aria-label="ยกเลิก" className={iconBtn}>
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {item.usage > 0 && (
                        <label className="flex items-center gap-2 text-xs text-ink-3">
                          <input type="checkbox" checked={editing.apply} onChange={(e) => setEditing({ ...editing, apply: e.target.checked })} className="h-4 w-4 accent-[var(--brand-strong,#1d4ed8)]" />
                          เปลี่ยนในทะเบียนที่ใช้ “{item.value}” อยู่ด้วย ({item.usage} รายการ)
                        </label>
                      )}
                    </form>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 break-words text-sm font-medium text-ink">{item.value}</span>
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${item.usage > 0 ? 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300' : 'text-ink-6'}`}>
                        {item.usage > 0 ? `ใช้ใน ${item.usage} รายการ` : 'ยังไม่ถูกใช้'}
                      </span>

                      {confirmDelete === item.id ? (
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-rose-700 dark:text-rose-300">{item.usage > 0 ? 'ข้อมูลเดิมในทะเบียนยังอยู่ แค่ไม่มีให้เลือกอีก' : 'ลบตัวเลือกนี้?'}</span>
                          <button type="button" disabled={busy} onClick={() => void run(async () => { await lookupApi.remove(item.id); setConfirmDelete(null); return `ลบ “${item.value}” แล้ว`; })} className="min-h-[36px] rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50 cursor-pointer">
                            ยืนยันลบ
                          </button>
                          <button type="button" onClick={() => setConfirmDelete(null)} className="min-h-[36px] rounded-lg px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5 cursor-pointer">
                            ยกเลิก
                          </button>
                        </span>
                      ) : (
                        <span className="flex items-center">
                          <button type="button" disabled={busy || q !== '' || index === 0} onClick={() => move(item, -1)} title="เลื่อนขึ้น" aria-label={`เลื่อน ${item.value} ขึ้น`} className={iconBtn}>
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button type="button" disabled={busy || q !== '' || index === items.length - 1} onClick={() => move(item, 1)} title="เลื่อนลง" aria-label={`เลื่อน ${item.value} ลง`} className={iconBtn}>
                            <ArrowDown className="h-4 w-4" />
                          </button>
                          <button type="button" disabled={busy} onClick={() => { setConfirmDelete(null); setEditing({ id: item.id, value: item.value, apply: item.usage > 0 }); }} title="แก้ไข" aria-label={`แก้ไข ${item.value}`} className={iconBtn}>
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button type="button" disabled={busy} onClick={() => { setEditing(null); setConfirmDelete(item.id); }} title="ลบ" aria-label={`ลบ ${item.value}`} className={`${iconBtn} text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-500/10`}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </span>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
};
