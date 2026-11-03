export type EnterpriseRole = 'Admin' | 'Doctor' | 'Staff';

export interface EnterpriseRecord {
  id: string;
  name: string;
  email: string;
  company: string;
  nationalId: string;
  phone: string;
  clinicalNote: string;
  department: 'Cardiology' | 'Oncology' | 'Neurology' | 'Genomics' | 'General Ops';
  role: EnterpriseRole;
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
