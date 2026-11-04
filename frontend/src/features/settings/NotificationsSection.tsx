import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, CheckCheck, ChevronLeft, ChevronRight, Loader2, Save, Search, SlidersHorizontal } from 'lucide-react';
import { Select } from '../../components/ui/select';
import { auditApi, type NotificationHistory, type NotificationPrefs } from '../audit/api';
import { timeAgo, useNotifications } from '../audit/useNotifications';

const RESOURCES: { id: string; menu: string; label: string }[] = [
  { id: 'incoming', menu: 'incoming', label: 'หนังสือรับ' },
  { id: 'orders', menu: 'orders', label: 'ใบสั่งซื้อ/จ้าง' },
  { id: 'contracts', menu: 'contracts', label: 'ทะเบียนสัญญา' },
  { id: 'guarantees', menu: 'guarantees', label: 'หลักประกันสัญญา' },
  { id: 'progress', menu: 'progress', label: 'ความก้าวหน้า' },
  { id: 'notes', menu: 'summary', label: 'รายงานสรุป' },
];
const RESOURCE_LABEL = Object.fromEntries(RESOURCES.map((r) => [r.id, r.label]));
const ACTION: Record<string, { label: string; tone: string }> = {
  create: { label: 'เพิ่ม', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25' },
  update: { label: 'แก้ไข', tone: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/25' },
  delete: { label: 'ลบ', tone: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/25' },
};
const dateTime = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const SIZE = 25;

/** Notification centre: what needs attention, the full history of other people's changes, and what notifies me */
export const NotificationsSection: React.FC<{ menus: string[] }> = ({ menus }) => {
  const { data: bell, markRead, refresh } = useNotifications();
  const mine = RESOURCES.filter((r) => menus.includes(r.menu));

  const [filters, setFilters] = useState({ resource: '', action: '', q: '', unread: false });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<NotificationHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (bell && prefs === null) setPrefs(bell.prefs);
  }, [bell, prefs]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setHistory(await auditApi.notificationHistory({ page, size: SIZE, resource: filters.resource, action: filters.action, q: filters.q, unread: filters.unread }));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  // Search as you type, but not on every key press
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setFilters((f) => (f.q === query.trim() ? f : { ...f, q: query.trim() }));
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const setFilter = (patch: Partial<typeof filters>) => {
    setPage(1);
    setFilters((f) => ({ ...f, ...patch }));
  };

  const pages = history ? Math.max(1, Math.ceil(history.total / history.size)) : 1;
  const hasNew = (bell?.unread ?? 0) + (bell?.newAlerts ?? 0) > 0;
  const prefsDirty = bell && prefs ? JSON.stringify(prefs) !== JSON.stringify(bell.prefs) : false;

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-400/20">{notice}</p>}

      {/* Summary */}
      <section className="gov-card flex flex-wrap items-center gap-4 p-5">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft" aria-hidden>
          <BellRing className="h-5 w-5 text-brand" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-prompt text-base font-semibold">ศูนย์การแจ้งเตือน</h2>
          <p className="text-sm text-ink-3">
            ยังไม่อ่าน <strong className="text-ink">{bell?.unread ?? 0}</strong> รายการ · เรื่องที่ต้องดำเนินการ <strong className="text-ink">{bell?.alerts.length ?? 0}</strong> เรื่อง
            {(bell?.newAlerts ?? 0) > 0 && <> (ใหม่ {bell?.newAlerts})</>}
          </p>
        </div>
        <button
          type="button"
          disabled={!hasNew}
          onClick={() => void markRead().then(() => load())}
          className="btn-brand inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCheck className="h-4 w-4" aria-hidden /> ทำเครื่องหมายว่าอ่านทั้งหมด
        </button>
      </section>

      {/* Needs attention */}
      <section className="gov-card space-y-3 p-5">
        <div>
          <h2 className="font-prompt text-base font-semibold">ต้องดำเนินการ</h2>
          <p className="text-sm text-ink-3">เรื่องเหล่านี้ระบบคำนวณจากข้อมูลจริง จะหายไปเองเมื่อแก้ไขในทะเบียนแล้ว (การกดอ่านแล้วแค่หยุดนับบนกระดิ่ง)</p>
        </div>
        {!bell ? (
          <Loader2 className="h-5 w-5 animate-spin text-ink-4" aria-label="กำลังโหลด" />
        ) : bell.alerts.length === 0 ? (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">ไม่มีเรื่องค้าง ทุกอย่างอยู่ในกำหนด</p>
        ) : (
          <ul className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {bell.alerts.map((a) => (
              <li key={a.key} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${a.tone === 'bad' ? 'border-rose-200 bg-rose-50 dark:border-rose-400/25 dark:bg-rose-500/10' : 'border-amber-200 bg-amber-50 dark:border-amber-400/25 dark:bg-amber-500/10'}`}>
                <span className={`inline-flex h-8 min-w-[32px] items-center justify-center rounded-full px-2 text-sm font-bold text-white ${a.tone === 'bad' ? 'bg-rose-600' : 'bg-amber-600'}`}>{a.count}</span>
                <span className="min-w-0 flex-1 text-sm font-medium text-ink">{a.text}</span>
                {a.isNew && <span className="shrink-0 rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-bold text-rose-700 dark:text-rose-300">ใหม่</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* History */}
      <section className="gov-card overflow-hidden">
        <div className="space-y-3 border-b border-chroma-subtle p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-prompt text-base font-semibold">ประวัติการแจ้งเตือน</h2>
            <span className="text-sm text-ink-4">{history ? `${history.total.toLocaleString('th-TH')} รายการ` : ''}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_12rem_10rem_auto]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" aria-hidden />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาเรื่อง ผู้ทำ หรือเลขที่" aria-label="ค้นหาการแจ้งเตือน" className="pf-field min-h-[40px] w-full rounded-lg pl-9 pr-3 text-sm" />
            </label>
            <Select
              ariaLabel="ทะเบียน"
              value={filters.resource}
              onValueChange={(v) => setFilter({ resource: v })}
              options={[{ value: '', label: 'ทุกทะเบียน' }, ...mine.map((r) => ({ value: r.id, label: r.label }))]}
              className="min-h-[40px] w-full text-sm"
            />
            <Select
              ariaLabel="การกระทำ"
              value={filters.action}
              onValueChange={(v) => setFilter({ action: v })}
              options={[{ value: '', label: 'ทุกการกระทำ' }, { value: 'create', label: 'เพิ่ม' }, { value: 'update', label: 'แก้ไข' }, { value: 'delete', label: 'ลบ' }]}
              className="min-h-[40px] w-full text-sm"
            />
            <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border border-chroma-subtle px-3 text-sm font-semibold">
              <input type="checkbox" checked={filters.unread} onChange={(e) => setFilter({ unread: e.target.checked })} className="h-4 w-4 accent-[var(--brand-strong)]" />
              เฉพาะยังไม่อ่าน
            </label>
          </div>
        </div>

        <div className="relative overflow-x-auto">
          {loading && <div className="absolute inset-0 z-[1] flex items-center justify-center bg-white/40 dark:bg-black/20"><Loader2 className="h-5 w-5 animate-spin" aria-label="กำลังโหลด" /></div>}
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[var(--pf-head-bg,#f8fafc)] text-left text-xs font-bold text-ink-3">
              <tr>
                <th className="w-8 px-5 py-2.5"><span className="sr-only">สถานะการอ่าน</span></th>
                <th className="px-3 py-2.5">เวลา</th>
                <th className="px-3 py-2.5">ทะเบียน</th>
                <th className="px-3 py-2.5">การกระทำ</th>
                <th className="px-3 py-2.5">รายละเอียด</th>
                <th className="px-5 py-2.5">ผู้ทำ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/10">
              {history && history.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-ink-4">ไม่พบรายการ</td>
                </tr>
              )}
              {history?.items.map((it) => (
                <tr key={it.id} className={it.unread ? 'bg-brand-soft/60' : 'hover:bg-slate-50 dark:hover:bg-white/5'}>
                  <td className="px-5 py-2.5">
                    <span className={`inline-block h-2 w-2 rounded-full ${it.unread ? 'bg-[var(--brand-strong,#1d4ed8)]' : 'bg-slate-300 dark:bg-slate-600'}`} title={it.unread ? 'ยังไม่อ่าน' : 'อ่านแล้ว'} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-ink-3" title={dateTime(it.at)}>
                    {timeAgo(it.at)}
                    <span className="block text-xs text-ink-5">{dateTime(it.at)}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">{RESOURCE_LABEL[it.resource] ?? it.resource}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${ACTION[it.action]?.tone ?? ''}`}>{ACTION[it.action]?.label ?? it.action}</span>
                  </td>
                  <td className={`px-3 py-2.5 ${it.unread ? 'font-semibold text-ink' : 'text-ink-2'}`}>{it.summary}</td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-ink-3">{it.actorName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-chroma-subtle px-5 py-3 text-sm">
          <span className="text-ink-4">หน้า {page} / {pages}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} className="inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-lg border border-chroma-subtle px-3 font-semibold disabled:cursor-not-allowed disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" aria-hidden /> ก่อนหน้า
            </button>
            <button type="button" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)} className="inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-lg border border-chroma-subtle px-3 font-semibold disabled:cursor-not-allowed disabled:opacity-40">
              ถัดไป <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </section>

      {/* Preferences */}
      <section className="gov-card space-y-4 p-5">
        <div className="flex items-start gap-3">
          <SlidersHorizontal className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
          <div>
            <h2 className="font-prompt text-base font-semibold">ตั้งค่าการแจ้งเตือนของฉัน</h2>
            <p className="text-sm text-ink-3">เลือกทะเบียนที่ต้องการให้แจ้งบนกระดิ่ง ประวัติด้านบนยังแสดงครบทุกทะเบียนที่มีสิทธิ์</p>
          </div>
        </div>
        {!prefs ? (
          <Loader2 className="h-5 w-5 animate-spin text-ink-4" aria-label="กำลังโหลด" />
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {mine.map((r) => {
                const on = !prefs.muted.includes(r.id);
                return (
                  <label key={r.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-chroma-subtle px-4 py-3 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setPrefs({ ...prefs, muted: on ? [...prefs.muted, r.id] : prefs.muted.filter((m) => m !== r.id) })}
                      className="h-4 w-4 accent-[var(--brand-strong)]"
                    />
                    แจ้งเมื่อมีการเปลี่ยนแปลง{r.label}
                  </label>
                );
              })}
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-chroma-subtle px-4 py-3 text-sm font-semibold">
                <input type="checkbox" checked={prefs.badgeAlerts} onChange={(e) => setPrefs({ ...prefs, badgeAlerts: e.target.checked })} className="h-4 w-4 accent-[var(--brand-strong)]" />
                นับเรื่อง "ต้องดำเนินการ" ใหม่บนกระดิ่ง
              </label>
            </div>
            <button
              type="button"
              disabled={!prefsDirty || savingPrefs}
              onClick={async () => {
                setSavingPrefs(true);
                setNotice(null);
                try {
                  setPrefs(await auditApi.saveNotificationPrefs(prefs));
                  await refresh();
                  setNotice('บันทึกการตั้งค่าการแจ้งเตือนแล้ว');
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setSavingPrefs(false);
                }
              }}
              className="btn-brand inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingPrefs ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />} บันทึกการตั้งค่า
            </button>
          </>
        )}
      </section>
    </div>
  );
};
