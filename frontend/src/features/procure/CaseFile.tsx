import React, { useEffect, useState } from 'react';
import { FolderOpen, Inbox, ListChecks, Loader2, ShieldCheck } from 'lucide-react';
import { procureApi, type Related } from './api';
import { money, thaiDate } from './format';

const ROLE_TH: Record<string, string> = { origin: 'ต้นเรื่อง', invoice: 'ใบแจ้งหนี้/ส่งของ', other: 'อื่น ๆ' };
const ROLE_TONE: Record<string, string> = {
  origin: 'bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-400/20',
  invoice: 'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20',
  other: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/10',
};

/**
 * "แฟ้มเรื่อง" of an order/contract: the letters, guarantees and progress project linked to it,
 * and how much has been billed against its value.
 */
export const CaseFile: React.FC<{ resource: 'orders' | 'contracts'; id: number }> = ({ resource, id }) => {
  const [data, setData] = useState<Related | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    procureApi
      .related(resource, id)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'โหลดแฟ้มเรื่องไม่สำเร็จ'));
    return () => {
      alive = false;
    };
  }, [resource, id]);

  const empty = data && data.letters.length === 0 && data.guarantees.length === 0 && data.progress.length === 0;
  const t = data?.totals;
  const over = t && t.agreed !== null && t.billed > t.agreed;
  const pct = t && t.agreed ? Math.min(100, Math.round((t.billed / t.agreed) * 100)) : 0;

  return (
    <section className="rounded-xl border border-slate-200 p-4 dark:border-white/10" aria-label="แฟ้มเรื่อง">
      <h3 className="mb-3 flex items-center gap-2 font-prompt text-sm font-semibold text-ink">
        <FolderOpen className="h-4 w-4 text-brand" aria-hidden /> แฟ้มเรื่อง: เอกสารที่เกี่ยวข้อง
      </h3>

      {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      {!data && !error && (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> กำลังโหลด...</p>
      )}
      {empty && (
        <p className="text-sm text-ink-4">
          ยังไม่มีเอกสารเชื่อมกับรายการนี้ · เชื่อมได้จากฟอร์มหนังสือรับ (ต้นเรื่อง/ใบแจ้งหนี้), หลักประกันสัญญา หรือความก้าวหน้า
        </p>
      )}

      {data && !empty && (
        <div className="space-y-4">
          {t && t.agreed !== null && (
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="text-ink-3">
                  เรียกเก็บแล้ว <strong className="tabular-nums text-ink">{money(t.billed)}</strong> จาก {money(t.agreed)} บาท ({t.invoices} ฉบับ)
                </span>
                <span className={`font-semibold tabular-nums ${over ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                  {over ? `เกินมูลค่า ${money(-(t.remaining ?? 0))} บาท` : `คงเหลือ ${money(t.remaining)} บาท`}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="สัดส่วนที่เรียกเก็บแล้ว">
                <div className={`h-full rounded-full ${over ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${over ? 100 : pct}%` }} />
              </div>
            </div>
          )}

          {data.letters.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-4"><Inbox className="h-3.5 w-3.5" aria-hidden /> หนังสือรับ {data.letters.length} ฉบับ</p>
              <ul className="divide-y divide-slate-200 rounded-lg ring-1 ring-slate-200 dark:divide-white/10 dark:ring-white/10">
                {data.letters.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2 text-sm">
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 ${ROLE_TONE[l.link_role ?? 'other']}`}>{ROLE_TH[l.link_role ?? 'other']}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink">{l.subject || '(ไม่มีเรื่อง)'}</span>
                      <span className="text-xs text-ink-5">
                        {l.reg_no ? `รับที่ ${l.reg_no}/${l.fiscal_year}` : 'ไม่มีเลขรับ'}
                        {l.doc_no ? ` · ${l.doc_no}` : ''}
                        {l.doc_date ? ` · ${thaiDate(l.doc_date)}` : ''}
                        {l.from_name ? ` · ${l.from_name}` : ''}
                      </span>
                    </span>
                    {l.amount !== null && <span className="shrink-0 tabular-nums text-ink-2">{money(l.amount)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.guarantees.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-4"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> หลักประกันสัญญา</p>
              <ul className="space-y-1.5">
                {data.guarantees.map((g) => (
                  <li key={g.id} className="rounded-lg px-3 py-2 text-sm ring-1 ring-slate-200 dark:ring-white/10">
                    <span className="font-medium text-ink">{g.detail || 'หลักประกัน'}</span>
                    <span className="block text-xs text-ink-5">
                      {g.received_date ? `รับ ${thaiDate(g.received_date)}` : ''}
                      {g.return_due_date ? ` · ครบกำหนดคืน ${thaiDate(g.return_due_date)}` : ''}
                      {' · '}
                      <span className={g.returned ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'font-semibold text-amber-700 dark:text-amber-300'}>{g.returned ? 'คืนแล้ว' : 'ยังไม่คืน'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.progress.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-4"><ListChecks className="h-3.5 w-3.5" aria-hidden /> ความก้าวหน้าการจัดหา</p>
              {data.progress.map((p) => (
                <p key={p.id} className="rounded-lg px-3 py-2 text-sm ring-1 ring-slate-200 dark:ring-white/10">
                  <span className="font-medium text-ink">{p.project}</span>
                  <span className="block text-xs text-ink-5">
                    ทำแล้ว {p.steps_done}/17 ขั้นตอน{p.last_date ? ` · ล่าสุด ${thaiDate(p.last_date)}` : ''}
                  </span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
