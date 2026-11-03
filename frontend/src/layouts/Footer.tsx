import React from 'react';
import { ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { VersionBadge } from '../components/VersionBadge';

interface FooterProps {
  isOnline: boolean;
}

/**
 * Fixed 56px bar. Its height and top border line up with the sidebar's
 * collapse row (also h-14) so the two read as one continuous bottom edge.
 */
export const Footer: React.FC<FooterProps> = ({ isOnline }) => {
  const buddhistYear = new Date().getFullYear() + 543;
  const pdpaNotice =
    'ข้อมูลส่วนบุคคลได้รับการคุ้มครองตาม พ.ร.บ. PDPA พ.ศ. 2562 · เข้าถึงได้ตามสิทธิ์เท่านั้น';

  return (
    <footer className="app-footer hidden lg:flex shrink-0 h-14 items-center gap-6 px-6 lg:px-8 border-t border-slate-200 bg-white text-xs text-ink-4 print:hidden">
      <div className="shrink-0 leading-tight">
        <p className="font-prompt text-sm font-medium text-ink">ระบบงานพัสดุ</p>
        <p className="mt-0.5">© {buddhistYear} สงวนลิขสิทธิ์</p>
      </div>

      <span className="hidden xl:block w-px h-6 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

      <p className="flex-1 min-w-0 inline-flex items-center gap-2" title={pdpaNotice}>
        <ShieldCheck className="w-4 h-4 shrink-0 text-brand" aria-hidden="true" />
        <span className="truncate">{pdpaNotice}</span>
      </p>

      <div className="shrink-0 flex items-center gap-4">
        <VersionBadge />
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {isOnline ? (
            <Wifi className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          ) : (
            <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          )}
          {isOnline ? 'ระบบทำงานปกติ' : 'ออฟไลน์ (บันทึกในเครื่อง)'}
        </span>
        <span className="hidden xl:inline-flex items-center gap-1.5 whitespace-nowrap">
          ค้นหาด่วน
          <kbd className="px-1.5 py-0.5 rounded border border-chroma-subtle text-xs font-semibold">Ctrl K</kbd>
        </span>
      </div>
    </footer>
  );
};
