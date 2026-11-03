import React from 'react';
import type { AuthUser } from '../services/authService';
import { ROLE_LABELS, type NavSection } from '../services/enterpriseService';

const REPORT_TITLES: Record<NavSection, string> = {
  home: 'รายงานภาพรวมงานพัสดุ',
  procure: 'รายงานทะเบียนคุมใบสั่ง/สัญญา',
  overview: 'รายงานภาพรวมระบบ',
  users: 'รายงานทะเบียนผู้ป่วยและประชาชน',
  revenue: 'รายงานงบประมาณและการเบิกจ่าย',
  settings: 'รายงานการตั้งค่าระบบ',
  usermgmt: 'รายงานผู้ใช้งานและสิทธิ์การเข้าระบบ',
  audit: 'รายงานประวัติการใช้งานระบบ',
};

interface PrintLetterheadProps {
  user: AuthUser;
  activeNav: NavSection;
  isDataMasked: boolean;
  /** Set right before printing so the stamp shows the real print time */
  printedAt: Date;
}

/**
 * Report header that only exists on paper / PDF (hidden on screen by .print-only):
 * who printed it, when, and a confidentiality notice for patient data.
 */
export const PrintLetterhead: React.FC<PrintLetterheadProps> = ({ user, activeNav, isDataMasked, printedAt }) => (
  <header className="print-only mb-6 px-6" aria-hidden="true">
    <div className="flex items-start justify-between gap-6 pb-4 border-b-2 border-slate-900">
      <div className="flex items-center gap-3.5">
        <svg width="46" height="46" viewBox="0 0 512 512" aria-hidden="true">
          <rect width="512" height="512" rx="112" fill="#1E3A8A" />
          <g
            transform="translate(106 106) scale(12.5)"
            fill="none"
            stroke="#fff"
            strokeWidth="1.55"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
            <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
            <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
            <path d="M10 6h4" />
            <path d="M10 10h4" />
            <path d="M10 14h4" />
            <path d="M10 18h4" />
          </g>
        </svg>
        <div className="leading-tight">
          <p className="text-lg font-semibold text-slate-900">ระบบงานพัสดุ</p>
          <p className="text-sm text-slate-600">กองโรคติดต่อทั่วไป กรมควบคุมโรค</p>
        </div>
      </div>
      <p className="text-sm font-semibold text-slate-700 text-right leading-tight">
        {user.organization}
      </p>
    </div>

    <h1 className="mt-5 text-2xl font-semibold text-slate-900">{REPORT_TITLES[activeNav]}</h1>

    <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm text-slate-700">
      <div className="flex gap-2">
        <dt className="text-slate-500 shrink-0">ผู้พิมพ์:</dt>
        <dd className="font-medium">
          {user.displayName}{user.position ? ` · ${user.position}` : ''} ({ROLE_LABELS[user.role]})
        </dd>
      </div>
      <div className="flex gap-2">
        <dt className="text-slate-500 shrink-0">พิมพ์เมื่อ:</dt>
        <dd className="font-medium">
          {printedAt.toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' })} น.
        </dd>
      </div>
      <div className="flex gap-2 col-span-2">
        <dt className="text-slate-500 shrink-0">ข้อมูลส่วนบุคคล:</dt>
        <dd className="font-medium">{isDataMasked ? 'ซ่อนตามสิทธิ์ (PDPA)' : 'แสดงข้อมูลเต็ม'}</dd>
      </div>
    </dl>

    <p className="mt-3 rounded border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600 leading-relaxed">
      เอกสารฉบับนี้อาจมีข้อมูลส่วนบุคคลตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 ใช้ภายในหน่วยงานเท่านั้น
      ห้ามเผยแพร่หรือทำสำเนาโดยไม่ได้รับอนุญาต
    </p>
  </header>
);
