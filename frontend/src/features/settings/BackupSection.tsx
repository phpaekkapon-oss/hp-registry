import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarClock, CheckCircle2, DatabaseBackup, Download, FolderOpen, HardDrive, Loader2, Save, Trash2, XCircle } from 'lucide-react';
import { systemApi, type BackupOverview, type BackupPolicy } from './systemApi';

const dateTime = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const size = (b: number) => (b >= 1024 * 1024 * 1024 ? `${(b / 1024 ** 3).toFixed(2)} GB` : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const ageDays = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

type SortKey = 'at' | 'bytes';

const Stat: React.FC<{ icon: React.ElementType; label: string; value: React.ReactNode; sub?: React.ReactNode }> = ({ icon: Icon, label, value, sub }) => (
  <div className="flex min-w-0 items-start gap-3 rounded-xl border border-chroma-subtle px-4 py-3">
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft" aria-hidden>
      <Icon className="h-[18px] w-[18px] text-brand" />
    </span>
    <span className="min-w-0">
      <span className="block text-xs font-semibold text-ink-4">{label}</span>
      <span className="block truncate text-sm font-bold text-ink">{value}</span>
      {sub && <span className="block truncate text-xs text-ink-4">{sub}</span>}
    </span>
  </div>
);

export const BackupSection: React.FC = () => {
  const [data, setData] = useState<BackupOverview | null>(null);
  const [policy, setPolicy] = useState<BackupPolicy | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'at', desc: true });
  const [busy, setBusy] = useState<'run' | 'save' | 'delete' | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const apply = (o: BackupOverview) => {
    setData(o);
    setPolicy(o.policy);
    setSelected((prev) => new Set([...prev].filter((n) => o.files.some((f) => f.name === n))));
  };

  useEffect(() => {
    systemApi.backups().then(apply).catch((e) => setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'โหลดรายการไม่สำเร็จ' }));
  }, []);

  const act = async (kind: 'run' | 'save' | 'delete', fn: () => Promise<string>) => {
    setBusy(kind);
    setMsg(null);
    try {
      setMsg({ kind: 'ok', text: await fn() });
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'ดำเนินการไม่สำเร็จ' });
    } finally {
      setBusy(null);
    }
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const list = [...data.files];
    list.sort((a, b) => {
      const d = sort.key === 'bytes' ? a.bytes - b.bytes : a.at.localeCompare(b.at);
      return sort.desc ? -d : d;
    });
    return list;
  }, [data, sort]);

  if (!data || !policy) {
    return (
      <section className="gov-card p-5">
        {msg ? <p role="alert" className="text-sm font-medium text-rose-700 dark:text-rose-300">{msg.text}</p> : <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" aria-label="กำลังโหลด" /></div>}
      </section>
    );
  }

  const newest = data.files[0]?.name;
  const prune = new Set(data.pruneCandidates);
  const allSelectable = data.files.filter((f) => f.name !== newest).map((f) => f.name);
  const allChecked = allSelectable.length > 0 && allSelectable.every((n) => selected.has(n));
  const selectedBytes = data.files.filter((f) => selected.has(f.name)).reduce((s, f) => s + f.bytes, 0);
  const policyDirty = JSON.stringify(policy) !== JSON.stringify(data.policy);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }));
  const SortIcon: React.FC<{ k: SortKey }> = ({ k }) => (sort.key !== k ? null : sort.desc ? <ArrowDown className="h-3.5 w-3.5" aria-hidden /> : <ArrowUp className="h-3.5 w-3.5" aria-hidden />);

  const remove = (names: string[]) => {
    if (names.length === 0) return;
    if (!window.confirm(`ลบไฟล์สำรอง ${names.length} ไฟล์ (${size(data.files.filter((f) => names.includes(f.name)).reduce((s, f) => s + f.bytes, 0))})?\nไฟล์ที่ลบแล้วกู้คืนไม่ได้`)) return;
    void act('delete', async () => {
      const r = await systemApi.deleteBackups(names);
      apply(r.overview);
      setSelected(new Set());
      return `ลบไฟล์สำรองแล้ว ${r.removed} ไฟล์`;
    });
  };

  return (
    <div className="space-y-5">
      <section className="gov-card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-prompt text-base font-semibold">สำรองข้อมูล</h2>
            <p className="mt-1 text-sm text-ink-3">ไฟล์ SQL บีบอัดของฐานข้อมูลระบบพัสดุ ใช้กู้คืนเมื่อข้อมูลเสียหาย</p>
          </div>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void act('run', async () => {
              const r = await systemApi.runBackup();
              apply(r.overview);
              return `สำรองข้อมูลแล้ว ${r.tables} ตาราง ${r.rows.toLocaleString('th-TH')} แถว (${size(r.bytes)})${r.removed ? ` · ลบไฟล์เก่าตามนโยบาย ${r.removed} ไฟล์` : ''}`;
            })}
            className="btn-brand inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-70"
          >
            {busy === 'run' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <DatabaseBackup className="h-4 w-4" aria-hidden />} สำรองตอนนี้
          </button>
        </div>

        {msg && (
          <p role={msg.kind === 'error' ? 'alert' : 'status'} className={`flex items-center gap-2 text-sm font-medium ${msg.kind === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
            {msg.kind === 'ok' ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />} {msg.text}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Stat icon={FolderOpen} label="เก็บไว้ที่ (บนเครื่องเซิร์ฟเวอร์)" value={<span className="font-mono text-xs" title={data.dir}>{data.dir}</span>} sub="ไฟล์มีข้อมูลจริง ควรจำกัดผู้เข้าถึงโฟลเดอร์นี้" />
          <Stat icon={HardDrive} label="พื้นที่ที่ใช้" value={`${size(data.totalBytes)} · ${data.files.length} ไฟล์`} sub={data.pruneCandidates.length ? `ลบได้ตามนโยบาย ${data.pruneCandidates.length} ไฟล์` : 'อยู่ในเกณฑ์ที่ตั้งไว้'} />
          <Stat
            icon={CalendarClock}
            label="สำรองอัตโนมัติ"
            value={data.policy.autoBackup ? `ทุกวัน ${data.policy.time} น.` : 'ปิดอยู่'}
            sub={
              !data.schedulerActive
                ? 'ทำงานบนเซิร์ฟเวอร์จริงเท่านั้น (ไม่ทำงานในเครื่องพัฒนา)'
                : data.lastAutoRun
                ? `${data.lastAutoRun.ok ? 'ครั้งล่าสุดสำเร็จ' : 'ครั้งล่าสุดล้มเหลว'} ${dateTime(data.lastAutoRun.at)}`
                : 'ยังไม่ได้ทำงานตั้งแต่เปิดเซิร์ฟเวอร์'
            }
          />
        </div>
      </section>

      <section className="gov-card space-y-4 p-5">
        <div>
          <h2 className="font-prompt text-base font-semibold">ตั้งเวลาและลบไฟล์เก่าอัตโนมัติ</h2>
          <p className="mt-1 text-sm text-ink-3">หลังสำรองทุกครั้ง ระบบลบไฟล์ที่เกินจำนวนหรือเก่ากว่าที่กำหนดให้เอง เพื่อประหยัดพื้นที่ (ไฟล์ล่าสุดไม่ถูกลบเสมอ)</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="flex items-center gap-3 rounded-xl border border-chroma-subtle px-4 py-3 text-sm font-semibold">
            <input type="checkbox" checked={policy.autoBackup} onChange={(e) => setPolicy({ ...policy, autoBackup: e.target.checked })} className="h-4 w-4 accent-[var(--brand-strong)]" />
            สำรองอัตโนมัติทุกวัน
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-ink-3">เวลา</span>
            <input type="time" value={policy.time} disabled={!policy.autoBackup} onChange={(e) => setPolicy({ ...policy, time: e.target.value })} className="pf-field min-h-[44px] w-full rounded-lg px-3 disabled:opacity-50" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-ink-3">เก็บไม่เกิน (ไฟล์)</span>
            <input type="number" min={1} max={1000} value={policy.keepCount} onChange={(e) => setPolicy({ ...policy, keepCount: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} className="pf-field min-h-[44px] w-full rounded-lg px-3 tabular-nums" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-ink-3">ลบไฟล์ที่เก่ากว่า (วัน · 0 = ไม่ลบตามอายุ)</span>
            <input type="number" min={0} max={3650} value={policy.keepDays} onChange={(e) => setPolicy({ ...policy, keepDays: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className="pf-field min-h-[44px] w-full rounded-lg px-3 tabular-nums" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!policyDirty || busy !== null}
            onClick={() => void act('save', async () => {
              apply(await systemApi.saveBackupPolicy(policy));
              return 'บันทึกการตั้งค่าสำรองข้อมูลแล้ว (การลบไฟล์เก่าจะทำหลังการสำรองครั้งถัดไป)';
            })}
            className="btn-brand inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />} บันทึกการตั้งค่า
          </button>
          {data.pruneCandidates.length > 0 && (
            <button type="button" disabled={busy !== null} onClick={() => remove(data.pruneCandidates)} className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border border-chroma-subtle px-4 text-sm font-semibold hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-white/5">
              <Trash2 className="h-4 w-4" aria-hidden /> ลบตามนโยบายตอนนี้ ({data.pruneCandidates.length} ไฟล์)
            </button>
          )}
          {policyDirty && <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">ยังไม่ได้บันทึก</span>}
        </div>
      </section>

      <section className="gov-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-chroma-subtle px-5 py-3">
          <h2 className="font-prompt text-base font-semibold">ไฟล์สำรองทั้งหมด</h2>
          <span className="text-sm text-ink-4">{data.files.length} ไฟล์</span>
          {selected.size > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink-2">เลือก {selected.size} ไฟล์ · {size(selectedBytes)}</span>
              <button type="button" onClick={() => setSelected(new Set())} className="inline-flex min-h-[36px] cursor-pointer items-center rounded-lg px-3 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-white/5">ยกเลิก</button>
              <button type="button" disabled={busy !== null} onClick={() => remove([...selected])} className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                {busy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />} ลบที่เลือก
              </button>
            </div>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-3">ยังไม่มีไฟล์สำรอง</p>
        ) : (
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-[1] bg-[var(--pf-head-bg,#f8fafc)] text-left text-xs font-bold text-ink-3">
                <tr>
                  <th className="w-12 px-5 py-2.5">
                    <input
                      type="checkbox"
                      aria-label="เลือกทั้งหมด (ยกเว้นไฟล์ล่าสุด)"
                      checked={allChecked}
                      disabled={allSelectable.length === 0}
                      onChange={() => setSelected(allChecked ? new Set() : new Set(allSelectable))}
                      className="h-4 w-4 cursor-pointer accent-[var(--brand-strong)]"
                    />
                  </th>
                  <th className="px-3 py-2.5">ชื่อไฟล์</th>
                  <th className="px-3 py-2.5">
                    <button type="button" onClick={() => toggleSort('at')} className="inline-flex cursor-pointer items-center gap-1 hover:text-ink">วันที่สำรอง <SortIcon k="at" /></button>
                  </th>
                  <th className="px-3 py-2.5 text-right">อายุ</th>
                  <th className="px-3 py-2.5 text-right">
                    <button type="button" onClick={() => toggleSort('bytes')} className="inline-flex cursor-pointer items-center gap-1 hover:text-ink">ขนาด <SortIcon k="bytes" /></button>
                  </th>
                  <th className="px-5 py-2.5 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                {rows.map((f) => {
                  const isNewest = f.name === newest;
                  const checked = selected.has(f.name);
                  return (
                    <tr key={f.name} className={checked ? 'bg-brand-soft' : 'hover:bg-slate-50 dark:hover:bg-white/5'}>
                      <td className="px-5 py-2.5">
                        <input
                          type="checkbox"
                          aria-label={`เลือก ${f.name}`}
                          checked={checked}
                          disabled={isNewest}
                          title={isNewest ? 'ไฟล์ล่าสุดลบไม่ได้' : undefined}
                          onChange={() => setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(f.name)) next.delete(f.name);
                            else next.add(f.name);
                            return next;
                          })}
                          className="h-4 w-4 cursor-pointer accent-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-xs sm:text-sm">{f.name}</span>
                        {isNewest && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">ล่าสุด</span>}
                        {prune.has(f.name) && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20">จะถูกลบอัตโนมัติ</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-ink-3">{dateTime(f.at)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink-3">{ageDays(f.at) === 0 ? 'วันนี้' : `${ageDays(f.at)} วัน`}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink-3">{size(f.bytes)}</td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-right">
                        <a href={systemApi.backupFileUrl(f.name)} download className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 hover:bg-slate-100 hover:text-ink dark:hover:bg-white/10" aria-label={`ดาวน์โหลด ${f.name}`} title="ดาวน์โหลด">
                          <Download className="h-4 w-4" />
                        </a>
                        <button type="button" disabled={isNewest || busy !== null} onClick={() => remove([f.name])} aria-label={`ลบ ${f.name}`} title={isNewest ? 'ไฟล์ล่าสุดลบไม่ได้' : 'ลบ'} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30 dark:text-rose-300 dark:hover:bg-rose-500/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
