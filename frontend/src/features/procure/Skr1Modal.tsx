import React, { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Download, FileSpreadsheet, Loader2, Printer, Search, X } from 'lucide-react';
import { procureApi, type PeriodMode, type Row } from './api';
import { exportSkr1Excel, type Skr1RowItem } from './excel';
import { money, thaiDate } from './format';
import type { Notify } from './types';

const THAI_MONTHS = [
  { value: 10, label: 'ตุลาคม' },
  { value: 11, label: 'พฤศจิกายน' },
  { value: 12, label: 'ธันวาคม' },
  { value: 1, label: 'มกราคม' },
  { value: 2, label: 'กุมภาพันธ์' },
  { value: 3, label: 'มีนาคม' },
  { value: 4, label: 'เมษายน' },
  { value: 5, label: 'พฤษภาคม' },
  { value: 6, label: 'มิถุนายน' },
  { value: 7, label: 'กรกฎาคม' },
  { value: 8, label: 'สิงหาคม' },
  { value: 9, label: 'กันยายน' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  fy: number;
  mode: PeriodMode;
  notify: Notify;
}

export const Skr1Modal: React.FC<Props> = ({ open, onClose, fy, mode, notify }) => {
  const [selectedMonth, setSelectedMonth] = useState<number>(() => {
    const m = new Date().getMonth() + 1;
    return m;
  });
  const [selectedYear, setSelectedYear] = useState<number>(fy);
  const [scope, setScope] = useState<'all' | 'orders' | 'contracts'>('all');
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<Row[]>([]);
  const [contracts, setContracts] = useState<Row[]>([]);
  const [exporting, setExporting] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    Promise.all([
      procureApi.list('orders', fy, '', mode),
      procureApi.list('contracts', fy, '', mode),
    ])
      .then(([o, c]) => {
        if (!alive) return;
        setOrders(o);
        setContracts(c);
      })
      .catch((e) => {
        if (!alive) return;
        notify(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ', 'error');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [open, fy, mode, notify]);

  const items = useMemo(() => {
    const rawList: (Row & { _source: 'order' | 'contract' })[] = [];
    if (scope === 'all' || scope === 'orders') {
      orders.forEach((r) => rawList.push({ ...r, _source: 'order' }));
    }
    if (scope === 'all' || scope === 'contracts') {
      contracts.forEach((r) => rawList.push({ ...r, _source: 'contract' }));
    }

    const filtered = rawList.filter((r) => {
      const dtStr = (r.doc_date || r.received_date || r.created_at) as string | undefined;
      if (!dtStr) return false;
      const dt = new Date(dtStr);
      const m = dt.getMonth() + 1;
      return m === selectedMonth;
    });

    const needle = q.trim().toLowerCase();
    const searched = needle
      ? filtered.filter((r) =>
          [r.job_title, r.vendor_name, r.doc_no, r.method].some((v) =>
            String(v ?? '').toLowerCase().includes(needle)
          )
        )
      : filtered;

    return searched.map((r, idx): Skr1RowItem => ({
      no: idx + 1,
      job_title: String(r.job_title ?? ''),
      budget_amount: r.budget_amount !== null && r.budget_amount !== undefined ? Number(r.budget_amount) : null,
      median_price: r.median_price !== null && r.median_price !== undefined ? Number(r.median_price) : null,
      method: String(r.method || 'วิธีเฉพาะเจาะจง'),
      vendor_name: String(r.vendor_name || ''),
      agreed_price: r.agreed_price !== null && r.agreed_price !== undefined ? Number(r.agreed_price) : null,
      reason: 'เป็นผู้มีคุณสมบัติและข้อเสนอถูกต้องตามเกณฑ์และราคาเหมาะสม',
      doc_no: String(r.doc_no || ''),
      doc_date: (r.doc_date as string | null) || null,
    }));
  }, [orders, contracts, scope, selectedMonth, q]);

  const monthObj = THAI_MONTHS.find((m) => m.value === selectedMonth);
  const monthName = monthObj ? monthObj.label : `เดือนที่ ${selectedMonth}`;

  const totals = useMemo(() => {
    return items.reduce(
      (acc, it) => ({
        budget: acc.budget + (it.budget_amount || 0),
        median: acc.median + (it.median_price || 0),
        agreed: acc.agreed + (it.agreed_price || 0),
      }),
      { budget: 0, median: 0, agreed: 0 }
    );
  }, [items]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportSkr1Excel({
        monthName,
        year: selectedYear,
        agencyName: 'กองโรคติดต่อทั่วไป กรมควบคุมโรค กระทรวงสาธารณสุข',
        items,
      });
      notify(`ส่งออกรายงาน สขร. 1 ประจำเดือน ${monthName} แล้ว`, 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'ส่งออกไม่สำเร็จ', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm print:hidden" />
        <Dialog.Content className="fixed inset-4 z-50 overflow-hidden rounded-2xl bg-white p-6 shadow-2xl dark:bg-[var(--pf-surface)] border border-slate-200 dark:border-white/10 flex flex-col print:inset-0 print:border-none print:shadow-none print:p-0">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-white/10 print:hidden">
            <div className="flex items-center gap-3">
              <div className="btn-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-md">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <Dialog.Title className="text-lg font-bold text-ink flex items-center gap-2">
                  แบบสรุปผลการจัดซื้อจัดจ้างในรอบเดือน (แบบ สขร. 1)
                  <span className="rounded-full bg-brand-soft text-brand text-xs font-semibold px-2 py-0.5">
                    พ.ร.บ. ข้อมูลข่าวสารฯ
                  </span>
                </Dialog.Title>
                <Dialog.Description className="text-xs text-ink-5">
                  กองโรคติดต่อทั่วไป กรมควบคุมโรค กระทรวงสาธารณสุข
                </Dialog.Description>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 px-3.5 text-sm font-semibold hover:bg-slate-50 dark:border-[var(--pf-field-border)] dark:hover:bg-[var(--pf-hover)] cursor-pointer"
              >
                <Printer className="h-4 w-4" /> พิมพ์ (Print)
              </button>
              <button
                type="button"
                disabled={exporting || items.length === 0}
                onClick={() => void handleExport()}
                className="btn-brand inline-flex min-h-[40px] items-center gap-2 rounded-lg px-4 text-sm font-semibold cursor-pointer disabled:opacity-60"
              >
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                ส่งออก Excel (.xlsx)
              </button>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-50 p-3 dark:bg-white/5 border border-slate-200 dark:border-white/5 print:hidden">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink-3">
                <span>ประจำเดือน:</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="pf-field rounded-lg px-3 py-1.5 text-sm font-medium"
                >
                  {THAI_MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 text-sm font-semibold text-ink-3">
                <span>ปี พ.ศ.:</span>
                <input
                  type="number"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="pf-field w-24 rounded-lg px-2.5 py-1.5 text-sm font-medium tabular-nums"
                />
              </div>

              <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1 dark:bg-white/10 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={`rounded-md px-3 py-1 transition-colors cursor-pointer ${
                    scope === 'all'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                      : 'text-ink-4 hover:text-slate-900'
                  }`}
                >
                  ทั้งหมด ({orders.length + contracts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setScope('orders')}
                  className={`rounded-md px-3 py-1 transition-colors cursor-pointer ${
                    scope === 'orders'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                      : 'text-ink-4 hover:text-slate-900'
                  }`}
                >
                  เฉพาะใบสั่งซื้อ ({orders.length})
                </button>
                <button
                  type="button"
                  onClick={() => setScope('contracts')}
                  className={`rounded-md px-3 py-1 transition-colors cursor-pointer ${
                    scope === 'contracts'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                      : 'text-ink-4 hover:text-slate-900'
                  }`}
                >
                  เฉพาะสัญญา ({contracts.length})
                </button>
              </div>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาในตาราง..."
                className="pf-field w-full rounded-lg pl-9 pr-3 py-1.5 text-xs"
              />
            </div>
          </div>

          {/* Printable Official Document Content */}
          <div className="mt-4 flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-white/10 print:border-none">
            {loading ? (
              <div className="flex h-64 items-center justify-center gap-2 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin" /> กำลังประมวลผลข้อมูล สขร. 1...
              </div>
            ) : (
              <div className="min-w-[900px] p-4 bg-white dark:bg-[var(--pf-surface)] print:p-0">
                {/* Official Print Header */}
                <div className="text-center mb-4">
                  <h3 className="font-prompt text-base font-bold text-ink">
                    แบบสรุปผลการดำเนินการจัดซื้อจัดจ้างในรอบเดือน {monthName} พ.ศ. {selectedYear}
                  </h3>
                  <h4 className="mt-1 font-prompt text-sm font-semibold text-ink-2">
                    (ชื่อหน่วยงาน) กองโรคติดต่อทั่วไป กรมควบคุมโรค กระทรวงสาธารณสุข
                  </h4>
                  <p className="mt-1 text-xs text-ink-5 print:text-[10px]">
                    พบรายการจัดซื้อจัดจ้าง {items.length.toLocaleString('th-TH')} รายการ · วงเงินงบประมาณรวม {money(totals.budget)} บาท · ราคาที่ตกลงรวม {money(totals.agreed)} บาท
                  </p>
                </div>

                {/* 9 Standard Government Columns Table */}
                <table className="w-full border-collapse border border-slate-300 dark:border-white/20 text-xs">
                  <thead className="bg-slate-100 dark:bg-white/10 print:bg-slate-100">
                    <tr>
                      <th className="border border-slate-300 dark:border-white/20 px-2 py-2 text-center w-12 font-semibold">
                        ลำดับที่
                      </th>
                      <th className="border border-slate-300 dark:border-white/20 px-3 py-2 text-left font-semibold">
                        งานที่จัดซื้อหรือจัดจ้าง
                      </th>
                      <th className="border border-slate-300 dark:border-white/20 px-2 py-2 text-right w-28 font-semibold">
                        วงเงินที่จัดซื้อ<br />หรือจัดจ้าง (บาท)
                      </th>
                      <th className="border border-slate-300 dark:border-white/20 px-2 py-2 text-right w-28 font-semibold">
                        ราคากลาง<br />(บาท)
                      </th>
                      <th className="border border-slate-300 dark:border-white/20 px-2 py-2 text-center w-28 font-semibold">
                        วิธีซื้อหรือจ้าง
                      </th>
                      <th className="border border-slate-300 dark:border-white/20 px-3 py-2 text-left w-44 font-semibold">
                        รายชื่อผู้เสนอราคา<br />และราคาที่เสนอ
                      </th>
                      <th className="border border-slate-300 dark:border-white/20 px-3 py-2 text-left w-44 font-semibold">
                        ผู้ได้รับการคัดเลือกและราคา<br />ที่ตกลงซื้อหรือจ้าง
                      </th>
                      <th className="border border-slate-300 dark:border-white/20 px-2 py-2 text-left w-40 font-semibold">
                        เหตุผลที่คัดเลือก<br />โดยสังเขป
                      </th>
                      <th className="border border-slate-300 dark:border-white/20 px-2 py-2 text-center w-36 font-semibold">
                        เลขที่และวันที่ของสัญญา<br />หรือข้อตกลงในการซื้อหรือจ้าง
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-400">
                          ไม่พบรายการจัดซื้อจัดจ้างในรอบเดือน {monthName} พ.ศ. {selectedYear}
                        </td>
                      </tr>
                    ) : (
                      items.map((it) => (
                        <tr key={it.no} className="hover:bg-slate-50 dark:hover:bg-white/5">
                          <td className="border border-slate-300 dark:border-white/20 px-2 py-2 text-center tabular-nums">
                            {it.no}
                          </td>
                          <td className="border border-slate-300 dark:border-white/20 px-3 py-2 font-medium text-ink">
                            {it.job_title}
                          </td>
                          <td className="border border-slate-300 dark:border-white/20 px-2 py-2 text-right tabular-nums">
                            {money(it.budget_amount) || '-'}
                          </td>
                          <td className="border border-slate-300 dark:border-white/20 px-2 py-2 text-right tabular-nums">
                            {money(it.median_price) || '-'}
                          </td>
                          <td className="border border-slate-300 dark:border-white/20 px-2 py-2 text-center text-ink-3">
                            {it.method}
                          </td>
                          <td className="border border-slate-300 dark:border-white/20 px-3 py-2">
                            <div className="font-medium text-ink">{it.vendor_name || '-'}</div>
                            {it.agreed_price !== null && (
                              <div className="text-[11px] text-ink-5">
                                {money(it.agreed_price)} บาท
                              </div>
                            )}
                          </td>
                          <td className="border border-slate-300 dark:border-white/20 px-3 py-2">
                            <div className="font-semibold text-ink">{it.vendor_name || '-'}</div>
                            {it.agreed_price !== null && (
                              <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                                {money(it.agreed_price)} บาท
                              </div>
                            )}
                          </td>
                          <td className="border border-slate-300 dark:border-white/20 px-2 py-2 text-ink-4 text-[11px] leading-relaxed">
                            {it.reason}
                          </td>
                          <td className="border border-slate-300 dark:border-white/20 px-2 py-2 text-center">
                            <div className="font-semibold tabular-nums text-ink">{it.doc_no || '-'}</div>
                            {it.doc_date && (
                              <div className="text-[11px] text-ink-5">
                                {thaiDate(it.doc_date)}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {items.length > 0 && (
                    <tfoot className="border-t-2 border-slate-400 bg-slate-100 font-semibold dark:border-white/20 dark:bg-white/10">
                      <tr>
                        <td colSpan={2} className="border border-slate-300 dark:border-white/20 px-3 py-2.5 text-right font-bold">
                          รวมทั้งสิ้น ({items.length.toLocaleString('th-TH')} รายการ)
                        </td>
                        <td className="border border-slate-300 dark:border-white/20 px-2 py-2.5 text-right font-bold tabular-nums">
                          {money(totals.budget)}
                        </td>
                        <td className="border border-slate-300 dark:border-white/20 px-2 py-2.5 text-right font-bold tabular-nums">
                          {money(totals.median)}
                        </td>
                        <td className="border border-slate-300 dark:border-white/20"></td>
                        <td className="border border-slate-300 dark:border-white/20"></td>
                        <td className="border border-slate-300 dark:border-white/20 px-3 py-2.5 text-right font-bold tabular-nums text-emerald-800 dark:text-emerald-300">
                          {money(totals.agreed)}
                        </td>
                        <td className="border border-slate-300 dark:border-white/20"></td>
                        <td className="border border-slate-300 dark:border-white/20"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>

                {/* Official Signatures Block */}
                <div className="mt-8 grid grid-cols-2 gap-8 text-center text-xs print:mt-6 print:text-[11px]">
                  <div className="space-y-1">
                    <p>(ลงชื่อ)..........................................................................ผู้รายงาน</p>
                    <p>(..........................................................................)</p>
                    <p>ตำแหน่ง เจ้าหน้าที่พัสดุ</p>
                  </div>
                  <div className="space-y-1">
                    <p>(ลงชื่อ)..........................................................................หัวหน้าเจ้าหน้าที่</p>
                    <p>(..........................................................................)</p>
                    <p>ตำแหน่ง หัวหน้าเจ้าหน้าที่พัสดุ</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

