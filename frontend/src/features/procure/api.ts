import { apiFetch } from '../../services/apiClient';

/** Fiscal year (ปีงบประมาณ, Oct–Sep) or calendar year (ปี พ.ศ., by the row's own date) */
export type PeriodMode = 'fiscal' | 'calendar';

export type Resource = 'orders' | 'contracts' | 'incoming' | 'guarantees';
export type Row = { id: number } & Record<string, string | number | boolean | null>;

export interface Lookups {
  staff: string[];
  group: string[];
  fund: string[];
  method: string[];
  status: string[];
  unit: string[];
  /** Vendors already used in orders/contracts */
  vendor: string[];
  /** vendor name -> tax ID (empty for roles that may not see tax IDs) */
  vendorTax: Record<string, string>;
  steps: { step_no: number; name: string }[];
}

export interface ProgressProject {
  id: number;
  fiscal_year: number;
  seq_no: number | null;
  project: string;
  method: string | null;
  operator: string | null;
  link_ref?: string | null;
  link_label?: string | null;
  /** Version stamp of the row, sent back on save so the server can tell if someone else changed it meanwhile */
  updated_at?: string;
  /** step number ("1".."17") -> ISO date */
  steps: Record<string, string | null>;
}

export interface MethodBucket {
  key: string;
  label: string;
  count: number;
  amount: number;
}

export interface Summary {
  fiscalYear: number;
  counts: { orders: number; contracts: number; incoming: number; guarantees: number; progress: number };
  orders: MethodBucket[];
  contracts: MethodBucket[];
  orderStatus: { status: string; count: number }[];
  contractStatus: { status: string; count: number }[];
  guarantees: { total: number; pending: number; overdue: number; dueSoon: number };
  notes: { problem: string; suggestion: string };
}

/** Someone else saved the row after it was opened; `current` says who and when (and the version to overwrite) */
export class ConflictError extends Error {
  constructor(message: string, public current: { updated_at: string | null; by: string | null; at: string | null }) {
    super(message);
  }
}

/** A row in the recycle bin */
export type TrashRow = Row & { deleted_at: string; deleted_by: string | null };

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: { success?: boolean; data?: T; message?: string; code?: string; current?: ConflictError['current'] } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response (e.g. proxy error page) */
  }
  if (res.status === 409 && json?.code === 'CONFLICT') {
    throw new ConflictError(json.message ?? 'มีผู้อื่นแก้ไขรายการนี้ไปแล้ว', json.current ?? { updated_at: null, by: null, at: null });
  }
  if (!res.ok || !json?.success) throw new Error(json?.message ?? `เกิดข้อผิดพลาด (${res.status})`);
  return json.data as T;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
};

/** An incoming letter (หนังสือรับ) offered when linking an order/contract to it */
export interface IncomingOption {
  id: number;
  fiscal_year: number;
  reg_no: number | null;
  doc_no: string | null;
  doc_date: string | null;
  from_name: string | null;
  subject: string | null;
  amount: number | null;
  link_ref: string | null;
  link_role: string | null;
  /** What it already belongs to, e.g. "ใบแจ้งหนี้/ส่งของของ สัญญา 1/2570" */
  linked: string[];
}

/** An order or contract a letter, guarantee or progress project can be linked to */
export interface LinkOption {
  /** "orders:5" | "contracts:3" */
  ref: string;
  resource: 'orders' | 'contracts';
  kind: string;
  id: number;
  fiscal_year: number;
  doc_no: string | null;
  doc_date: string | null;
  job_title: string | null;
  vendor_name: string | null;
  project_no: string | null;
  agreed_price: number | null;
  invoice_total: number;
  invoice_count: number;
}

/** An order/contract's case file */
export interface Related {
  letters: { id: number; fiscal_year: number; reg_no: number | null; doc_no: string | null; doc_date: string | null; from_name: string | null; subject: string | null; amount: number | null; category: string | null; link_role: string | null }[];
  guarantees: { id: number; seq_no: number | null; returned: boolean; received_date: string | null; detail: string | null; contract_ref: string | null; return_due_date: string | null; return_note: string | null }[];
  progress: { id: number; fiscal_year: number; project: string; steps_done: number; last_date: string | null }[];
  totals: { agreed: number | null; billed: number; remaining: number | null; invoices: number };
}

export const procureApi = {
  lookups: () => request<Lookups>('GET', '/api/procure/lookups'),
  incomingOptions: () => request<IncomingOption[]>('GET', '/api/procure/incoming-options'),
  linkOptions: () => request<LinkOption[]>('GET', '/api/procure/link-options'),
  related: (resource: 'orders' | 'contracts', id: number) => request<Related>('GET', `/api/procure/${resource}/${id}/related`),
  summary: (fy: number, mode: PeriodMode = 'fiscal') => request<Summary>('GET', `/api/procure/summary${qs({ fy, mode })}`),
  saveNote: (fiscal_year: number, kind: 'problem' | 'suggestion', content: string, mode: PeriodMode = 'fiscal') =>
    request<null>('PUT', '/api/procure/notes', { fiscal_year, kind, content, mode }),

  nextNo: (resource: 'orders' | 'contracts', fy: number) => request<{ docNo: string }>('GET', `/api/procure/${resource}/next-no${qs({ fy })}`),

  list: (resource: Resource, fy: number, q?: string, mode: PeriodMode = 'fiscal') => request<Row[]>('GET', `/api/procure/${resource}${qs({ fy, q, mode })}`),
  create: (resource: Resource, body: Record<string, unknown>) => request<Row>('POST', `/api/procure/${resource}`, body),
  update: (resource: Resource, id: number, body: Record<string, unknown>) => request<Row>('PUT', `/api/procure/${resource}/${id}`, body),
  remove: (resource: Resource, id: number) => request<null>('DELETE', `/api/procure/${resource}/${id}`),
  removeMany: (resource: Resource, ids: number[]) => request<{ deleted: number }>('POST', `/api/procure/${resource}/bulk-delete`, { ids }),

  trash: (resource: Resource | 'progress') => request<TrashRow[]>('GET', `/api/procure/${resource}/trash`),
  restore: (resource: Resource | 'progress', id: number) => request<null>('POST', `/api/procure/${resource}/${id}/restore`),

  progress: (fy: number, mode: PeriodMode = 'fiscal') => request<ProgressProject[]>('GET', `/api/procure/progress${qs({ fy, mode })}`),
  createProgress: (body: Record<string, unknown>) => request<ProgressProject>('POST', '/api/procure/progress', body),
  updateProgress: (id: number, body: Record<string, unknown>) => request<ProgressProject>('PUT', `/api/procure/progress/${id}`, body),
  removeProgress: (id: number) => request<null>('DELETE', `/api/procure/progress/${id}`),
};
