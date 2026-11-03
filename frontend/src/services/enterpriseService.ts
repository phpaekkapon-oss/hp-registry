/**
 * Enterprise API & RBAC Security Service Layer
 * Provides Role-Based Access Control (Admin, Doctor, Staff),
 * PII/PHI Data Masking utilities, and high-volume dataset generation (500+ records)
 * to demonstrate Enterprise Virtualization and Pagination with Zero CLS.
 */

export type EnterpriseRole = 'Admin' | 'Doctor' | 'Staff';

export type NavSection = 'home' | 'procure' | 'overview' | 'users' | 'revenue' | 'settings' | 'usermgmt' | 'audit';

/**
 * The patient registry / budget dashboards come from the original template and are not part of the
 * procurement system. They stay in the code base but are hidden unless this is switched on.
 */
export const SHOW_DEMO_MODULES = false;

export interface RolePermissions {
  role: EnterpriseRole;
  label: string;
  badgeColor: string;
  canViewUnmaskedPII: boolean;
  canViewClinicalDiagnosis: boolean;
  canCreateRecord: boolean;
  canEditRecord: boolean;
  canDeleteRecord: boolean;
  canExportFullReport: boolean;
}

export const RBAC_MATRIX: Record<EnterpriseRole, RolePermissions> = {
  Admin: {
    role: 'Admin',
    label: 'ผู้ดูแลระบบ (สิทธิ์เต็มรูปแบบ)',
    badgeColor: 'text-amber-600',
    canViewUnmaskedPII: true,
    canViewClinicalDiagnosis: true,
    canCreateRecord: true,
    canEditRecord: true,
    canDeleteRecord: true,
    canExportFullReport: true,
  },
  Doctor: {
    role: 'Doctor',
    label: 'แพทย์ผู้รักษา (ดูข้อมูลทางคลินิกได้)',
    badgeColor: 'text-sky-700',
    canViewUnmaskedPII: true,
    canViewClinicalDiagnosis: true,
    canCreateRecord: true,
    canEditRecord: true,
    canDeleteRecord: false,
    canExportFullReport: true,
  },
  Staff: {
    role: 'Staff',
    label: 'เจ้าหน้าที่ปฏิบัติการ (ซ่อนข้อมูลส่วนบุคคล)',
    badgeColor: 'text-slate-600',
    canViewUnmaskedPII: false,
    canViewClinicalDiagnosis: false,
    canCreateRecord: false,
    canEditRecord: false,
    canDeleteRecord: false,
    canExportFullReport: false,
  },
};

export interface EnterpriseRecord {
  id: string;
  name: string;
  email: string;
  company: string;
  nationalId: string;       // Sensitive PII (e.g., Thai National ID / HN)
  phone: string;            // Sensitive PII
  clinicalNote: string;     // Sensitive PHI / Confidential Note
  department: 'Cardiology' | 'Oncology' | 'Neurology' | 'Genomics' | 'General Ops';
  role: 'Admin' | 'Doctor' | 'Staff';
  status: 'Active' | 'Pending' | 'Suspended';
  plan: 'Enterprise' | 'Growth' | 'Starter';
  mrr: number;
  activeSessions: number;
  lastActive: string;
}

export interface MonthlyRevenuePoint {
  month: string;
  mrr: number;
  target: number;
  activeOrgs: number;
}

export const REVENUE_TREND_DATA: MonthlyRevenuePoint[] = [
  { month: 'May', mrr: 48420, target: 45000, activeOrgs: 185 },
  { month: 'Jun', mrr: 54150, target: 50000, activeOrgs: 210 },
  { month: 'Jul', mrr: 61890, target: 58000, activeOrgs: 245 },
  { month: 'Aug', mrr: 68640, target: 64000, activeOrgs: 290 },
  { month: 'Sep', mrr: 76420, target: 72000, activeOrgs: 320 },
  { month: 'Oct', mrr: 84260, target: 80000, activeOrgs: 360 },
];

/**
 * Enterprise Data Masking Functions (PDPA / HIPAA Compliant)
 */
export function maskNationalId(id: string, isRevealed: boolean): string {
  if (isRevealed) return id;
  // Format: 1-1004-XXXXX-89-2 -> 1-••••-•••••-89-2
  const parts = id.split('-');
  if (parts.length === 5) {
    return `${parts[0]}-••••-•••••-${parts[3]}-${parts[4]}`;
  }
  return id.slice(0, 3) + '••••••' + id.slice(-2);
}

export function maskPhoneNumber(phone: string, isRevealed: boolean): string {
  if (isRevealed) return phone;
  // e.g. +66 81-492-8841 -> +66 81-•••-••41
  return phone.slice(0, 7) + '•••-••' + phone.slice(-2);
}

export function maskEmailAddress(email: string, isRevealed: boolean): string {
  if (isRevealed) return email;
  const [user, domain] = email.split('@');
  if (!domain) return email;
  const visiblePrefix = user.slice(0, 2);
  return `${visiblePrefix}••••@${domain}`;
}

export function maskClinicalRecord(note: string, isRevealed: boolean): string {
  if (isRevealed) return note;
  return 'ข้อมูลลับทางการแพทย์ (ซ่อนตามสิทธิ์)';
}

const SEED_RECORDS: EnterpriseRecord[] = [
  {
    id: 'ENT-9001',
    name: 'Dr. Nattapong Srisai',
    email: 'nattapong@bangkok-med.co.th',
    company: 'Bangkok Heart Institute',
    nationalId: '1-1004-00492-81-4',
    phone: '+66 81-492-8841',
    clinicalNote: 'HLA-B*15:02 Negative · Cleared for Phase III Telemetry',
    department: 'Cardiology',
    role: 'Doctor',
    status: 'Active',
    plan: 'Enterprise',
    mrr: 2450,
    activeSessions: 6,
    lastActive: '2 mins ago',
  },
  {
    id: 'ENT-9002',
    name: 'Pimchanok Wattana',
    email: 'pimchanok@siambiotech.io',
    company: 'Siam Biotech Genomics',
    nationalId: '1-5099-01823-44-9',
    phone: '+66 89-231-7712',
    clinicalNote: 'BRCA1 Sequencing Cohort #402 · High Priority SLA',
    department: 'Genomics',
    role: 'Admin',
    status: 'Active',
    plan: 'Enterprise',
    mrr: 3200,
    activeSessions: 9,
    lastActive: '8 mins ago',
  },
  {
    id: 'ENT-9003',
    name: 'Dr. Marcus Vance',
    email: 'm.vance@pacific-neuro.org',
    company: 'Pacific Neuro Center',
    nationalId: '3-2011-00941-12-7',
    phone: '+66 82-990-1145',
    clinicalNote: 'EEG Stream Node #12 · Real-time ICU Monitoring',
    department: 'Neurology',
    role: 'Doctor',
    status: 'Active',
    plan: 'Enterprise',
    mrr: 1950,
    activeSessions: 4,
    lastActive: '19 mins ago',
  },
  {
    id: 'ENT-9004',
    name: 'Siriporn Charoen',
    email: 'siriporn@chula-oncology.ac.th',
    company: 'Chula Oncology Research',
    nationalId: '1-1015-02910-55-1',
    phone: '+66 86-512-3309',
    clinicalNote: 'Targeted Immunotherapy Batch #88 · Pending QA',
    department: 'Oncology',
    role: 'Staff',
    status: 'Pending',
    plan: 'Growth',
    mrr: 890,
    activeSessions: 2,
    lastActive: '1 hour ago',
  },
  {
    id: 'ENT-9005',
    name: 'Dr. Elena Rostova',
    email: 'elena@nordic-radiology.eu',
    company: 'Nordic Diagnostic Lab',
    nationalId: '2-4088-00129-90-3',
    phone: '+66 84-771-9023',
    clinicalNote: 'DICOM 3D Volumetric Reconstruction Cluster',
    department: 'Cardiology',
    role: 'Doctor',
    status: 'Active',
    plan: 'Enterprise',
    mrr: 2850,
    activeSessions: 7,
    lastActive: '5 mins ago',
  },
  {
    id: 'ENT-9006',
    name: 'Thanakorn Boonmee',
    email: 'thanakorn@medsupply-ops.com',
    company: 'MedSupply Logistics',
    nationalId: '1-1033-00712-31-8',
    phone: '+66 81-309-4410',
    clinicalNote: 'Cold-Chain Telemetry Sensor #09 · Audit Hold',
    department: 'General Ops',
    role: 'Staff',
    status: 'Suspended',
    plan: 'Starter',
    mrr: 250,
    activeSessions: 0,
    lastActive: '3 days ago',
  },
  {
    id: 'ENT-9007',
    name: 'Dr. Kenji Takahashi',
    email: 'kenji@tokyo-proton.jp',
    company: 'Tokyo Proton Therapy',
    nationalId: '5-9012-00384-72-6',
    phone: '+66 91-884-2019',
    clinicalNote: 'Proton Beam Dosimetry Calibration Verified',
    department: 'Oncology',
    role: 'Doctor',
    status: 'Active',
    plan: 'Enterprise',
    mrr: 4100,
    activeSessions: 11,
    lastActive: 'Just now',
  },
  {
    id: 'ENT-9008',
    name: 'Chayada Wongsuwan',
    email: 'chayada@rama-telehealth.co.th',
    company: 'Rama Telehealth Network',
    nationalId: '1-1008-00651-29-0',
    phone: '+66 88-410-6521',
    clinicalNote: 'Outpatient Remote Vital Sign Stream · Active',
    department: 'General Ops',
    role: 'Admin',
    status: 'Active',
    plan: 'Growth',
    mrr: 1280,
    activeSessions: 5,
    lastActive: '24 mins ago',
  },
];

/**
 * Generates up to `count` realistic enterprise records so the user can test
 * high-volume Virtualized Scrolling (e.g. 250 records) without DOM lag.
 */
export function generateEnterpriseDataset(count = 240): EnterpriseRecord[] {
  const departments: EnterpriseRecord['department'][] = [
    'Cardiology',
    'Oncology',
    'Neurology',
    'Genomics',
    'General Ops',
  ];
  const plans: EnterpriseRecord['plan'][] = ['Enterprise', 'Growth', 'Starter'];
  const statuses: EnterpriseRecord['status'][] = ['Active', 'Active', 'Active', 'Pending', 'Suspended'];
  const roles: EnterpriseRecord['role'][] = ['Doctor', 'Admin', 'Staff'];

  const generated: EnterpriseRecord[] = [...SEED_RECORDS];

  for (let i = SEED_RECORDS.length + 1; i <= count; i++) {
    const seed = SEED_RECORDS[i % SEED_RECORDS.length];
    const dept = departments[i % departments.length];
    const plan = plans[i % plans.length];
    const status = statuses[i % statuses.length];
    const role = roles[i % roles.length];
    const numId = 9000 + i;

    generated.push({
      id: `ENT-${numId}`,
      name: `${seed.name.split(' ')[0]} ${seed.name.split(' ').slice(1).join(' ')} #${i}`,
      email: `node${i}.${seed.email}`,
      company: `${seed.company} (Unit ${(i % 12) + 1})`,
      nationalId: `1-${1000 + (i % 8999)}-${10000 + ((i * 73) % 89999)}-${10 + (i % 89)}-${i % 9}`,
      phone: `+66 8${i % 9}-${100 + (i % 899)}-${1000 + ((i * 37) % 8999)}`,
      clinicalNote: `${dept} Protocol #${100 + i} · ${seed.clinicalNote.split('·')[0].trim()}`,
      department: dept,
      role,
      status,
      plan,
      mrr: plan === 'Enterprise' ? 1800 + (i % 15) * 100 : plan === 'Growth' ? 650 + (i % 6) * 50 : 250,
      activeSessions: status === 'Suspended' ? 0 : (i % 9) + 1,
      lastActive: `${(i % 55) + 1} mins ago`,
    });
  }

  return generated;
}

/* ---------------------------------------------------------------------------
   Display labels. Stored values stay English (API / database contract);
   the UI shows Thai only, so every screen reads in one language.
   --------------------------------------------------------------------------- */
export const ROLE_LABELS: Record<EnterpriseRole, string> = {
  Admin: 'ผู้ดูแลระบบ',
  Doctor: 'ผู้บันทึกข้อมูล',
  Staff: 'ผู้ดูข้อมูล',
};

export const PLAN_LABELS: Record<EnterpriseRecord['plan'], string> = {
  Enterprise: 'สิทธิข้าราชการ',
  Growth: 'สิทธิประกันสังคม',
  Starter: 'สิทธิบัตรทอง (UC)',
};

export const STATUS_LABELS: Record<EnterpriseRecord['status'], string> = {
  Active: 'ปกติ',
  Pending: 'รออนุมัติ',
  Suspended: 'ระงับ',
};

export const DEPARTMENT_LABELS: Record<EnterpriseRecord['department'], string> = {
  Cardiology: 'ศูนย์โรคหัวใจ',
  Oncology: 'เคมีบำบัดและมะเร็ง',
  Neurology: 'ประสาทวิทยา',
  Genomics: 'พันธุศาสตร์การแพทย์',
  'General Ops': 'เวชปฏิบัติทั่วไป',
};

/* Table sorting */
export type SortKey = 'name' | 'mrr' | 'sessions' | 'status';
export type SortDir = 'asc' | 'desc';

/** Direction a column starts with the first time it is chosen */
export const DEFAULT_SORT_DIR: Record<SortKey, SortDir> = {
  name: 'asc',
  status: 'asc',
  mrr: 'desc',
  sessions: 'desc',
};

export const SORT_LABELS: Record<SortKey, string> = {
  name: 'ชื่อ-สกุล',
  status: 'สถานะ',
  mrr: 'งบเบิกจ่าย',
  sessions: 'จำนวนครั้ง',
};
