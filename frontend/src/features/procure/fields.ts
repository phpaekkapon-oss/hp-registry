import type { Resource } from './api';

/**
 * incoming = the หนังสือรับ an order/contract came from (lists and exports show `incoming_ref`)
 * link = the order/contract a letter, guarantee or progress project belongs to ("orders:5"; lists and exports show `link_label`)
 */
export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'checkbox' | 'incoming' | 'link';

export interface FieldDef {
  key: string;
  label: string;
  type?: FieldType;
  /** Suggestion list from the reference data (free text is still allowed) */
  options?: 'staff' | 'group' | 'fund' | 'method' | 'status' | 'unit' | 'vendor';
  required?: boolean;
  /** Form section heading (fields with the same heading are grouped) */
  section?: string;
  /** Span the full form width */
  wide?: boolean;
  /** Show as a column in the list */
  list?: boolean;
  align?: 'right';
  inputMode?: 'numeric' | 'decimal';
  placeholder?: string;
  /** Shown in the list and exports only (worked out by the server, not part of the form) */
  listOnly?: boolean;
  /** Kept in the form values and sent on save, but drawn by another field (e.g. link_role inside the link picker) */
  hidden?: boolean;
  /** link fields: also ask what the letter is to the case (ต้นเรื่อง / ใบแจ้งหนี้ / อื่น ๆ) */
  linkRole?: boolean;
}

const ORDER_CONTRACT_FIELDS = (kind: 'ใบสั่ง' | 'สัญญา'): FieldDef[] => [
  { key: 'incoming_id', label: 'อ้างอิงหนังสือรับ (ต้นเรื่อง)', type: 'incoming', wide: true, section: 'ข้อมูลเรื่อง' },
  { key: 'incoming_ref', label: 'หนังสือรับ (ต้นเรื่อง)', listOnly: true },
  { key: 'job_title', label: 'งานที่ซื้อหรือจ้าง', type: 'textarea', required: true, wide: true, list: true, section: 'ข้อมูลเรื่อง' },
  { key: 'responsible', label: 'ผู้รับผิดชอบ', options: 'staff', list: true, section: 'ข้อมูลเรื่อง' },
  { key: 'received_date', label: 'รับเรื่องเข้าวันที่', type: 'date', section: 'ข้อมูลเรื่อง' },
  { key: 'owner_group', label: 'กลุ่ม/ฝ่ายเจ้าของเรื่อง', options: 'group', wide: true, section: 'ข้อมูลเรื่อง' },
  { key: 'quantity', label: 'จำนวนงาน/รายการ', type: 'number', inputMode: 'decimal', section: 'งบประมาณและวิธีจัดหา' },
  { key: 'unit', label: 'หน่วย', options: 'unit', section: 'งบประมาณและวิธีจัดหา' },
  { key: 'budget_amount', label: 'วงเงินงบประมาณที่ได้รับจัดสรร (บาท)', type: 'number', inputMode: 'decimal', align: 'right', section: 'งบประมาณและวิธีจัดหา' },
  { key: 'budget_source', label: 'แหล่งที่มาของงบประมาณ', options: 'fund', list: true, section: 'งบประมาณและวิธีจัดหา' },
  { key: 'output_code', label: 'ผลผลิต', section: 'งบประมาณและวิธีจัดหา' },
  { key: 'main_activity', label: 'กิจกรรมหลัก', section: 'งบประมาณและวิธีจัดหา' },
  { key: 'status', label: 'สถานะการจัดซื้อจัดจ้าง', options: 'status', list: true, wide: true, section: 'งบประมาณและวิธีจัดหา' },
  { key: 'method', label: 'วิธีการจัดซื้อจัดจ้าง', options: 'method', list: true, wide: true, section: 'งบประมาณและวิธีจัดหา' },
  { key: 'doc_no', label: `เลขที่${kind}`, placeholder: 'เช่น 1/2570', list: true, section: kind },
  { key: 'doc_date', label: 'ลงวันที่', type: 'date', list: true, section: kind },
  { key: 'vendor_received_date', label: kind === 'ใบสั่ง' ? 'วันที่คู่สัญญารับใบสั่ง' : 'วันที่คู่สัญญาลงนาม', type: 'date', section: kind },
  { key: 'delivery_due', label: 'ครบกำหนดส่งมอบ', placeholder: 'วันที่ (ค.ศ.) หรือข้อความ เช่น วันแรกของเดือนถัดไป', section: kind },
  { key: 'median_price', label: 'ราคากลาง (บาท)', type: 'number', inputMode: 'decimal', align: 'right', list: true, section: 'ราคาและผู้ประกอบการ' },
  { key: 'agreed_price', label: 'ราคาที่ตกลงซื้อหรือจ้าง (บาท)', type: 'number', inputMode: 'decimal', align: 'right', list: true, section: 'ราคาและผู้ประกอบการ' },
  { key: 'vendor_name', label: 'ผู้ประกอบการที่ได้รับการคัดเลือก', options: 'vendor', list: true, wide: true, section: 'ราคาและผู้ประกอบการ' },
  { key: 'vendor_tax_id', label: 'เลขประจำตัวผู้เสียภาษี', inputMode: 'numeric', section: 'ราคาและผู้ประกอบการ' },
  { key: 'project_no', label: 'เลขที่โครงการ', inputMode: 'numeric', section: 'ราคาและผู้ประกอบการ' },
  { key: 'approval_no', label: 'อนุมัติสั่งซื้อ/จ้าง เลขที่ สธ0410.1.4/', section: 'อนุมัติ ตรวจรับ และเบิกจ่าย' },
  { key: 'approval_date', label: 'อนุมัติสั่งซื้อ/จ้าง วันที่', type: 'date', section: 'อนุมัติ ตรวจรับ และเบิกจ่าย' },
  { key: 'inspect_report_no', label: 'ตรวจรับพัสดุ เลขที่ สธ0410.1.4/', section: 'อนุมัติ ตรวจรับ และเบิกจ่าย' },
  { key: 'inspect_report_date', label: 'วันที่รายงานผล', type: 'date', section: 'อนุมัติ ตรวจรับ และเบิกจ่าย' },
  { key: 'inspected_date', label: 'วันที่ตรวจรับ', type: 'date', list: true, section: 'อนุมัติ ตรวจรับ และเบิกจ่าย' },
  { key: 'disbursed_date', label: 'วันที่ส่งเบิก', type: 'date', list: true, section: 'อนุมัติ ตรวจรับ และเบิกจ่าย' },
  { key: 'agency_type', label: 'ประเภทหน่วยงาน', section: 'ข้อมูลหน่วยงาน (ถ้ามี)' },
  { key: 'ministry', label: 'กระทรวง', section: 'ข้อมูลหน่วยงาน (ถ้ามี)' },
  { key: 'agency_name', label: 'ชื่อหน่วยงาน', section: 'ข้อมูลหน่วยงาน (ถ้ามี)' },
  { key: 'district', label: 'อำเภอ', section: 'ข้อมูลหน่วยงาน (ถ้ามี)' },
  { key: 'province', label: 'จังหวัด', section: 'ข้อมูลหน่วยงาน (ถ้ามี)' },
  { key: 'note', label: 'หมายเหตุ', type: 'textarea', wide: true, section: 'หมายเหตุ' },
];

type Values = Record<string, string | boolean>;

const text = (v: Values, k: string): string => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
const amount = (v: Values, k: string): number | null => {
  const s = text(v, k).replace(/,/g, '');
  return s !== '' && Number.isFinite(Number(s)) ? Number(s) : null;
};
/** ISO dates compare correctly as strings; returns true when both are set and a is before b */
const before = (v: Values, a: string, b: string) => text(v, a) !== '' && text(v, b) !== '' && text(v, a) < text(v, b);

/** Non-blocking sanity checks shown above the save button */
const orderContractWarnings = (v: Values): string[] => {
  const out: string[] = [];
  const agreed = amount(v, 'agreed_price');
  const budget = amount(v, 'budget_amount');
  const median = amount(v, 'median_price');
  if (agreed !== null && budget !== null && agreed > budget) out.push('ราคาที่ตกลงสูงกว่าวงเงินงบประมาณที่ได้รับจัดสรร');
  if (agreed !== null && median !== null && agreed > median) out.push('ราคาที่ตกลงสูงกว่าราคากลาง');
  const tax = text(v, 'vendor_tax_id');
  if (tax !== '' && !/^[0-9]{13}$/.test(tax) && !/•/.test(tax)) out.push('เลขประจำตัวผู้เสียภาษีควรเป็นตัวเลข 13 หลัก');
  if (before(v, 'inspected_date', 'doc_date')) out.push('วันที่ตรวจรับอยู่ก่อนวันที่ลงใบสั่ง/สัญญา');
  if (before(v, 'inspect_report_date', 'doc_date')) out.push('วันที่รายงานผลอยู่ก่อนวันที่ลงใบสั่ง/สัญญา');
  if (before(v, 'disbursed_date', 'inspected_date')) out.push('วันที่ส่งเบิกอยู่ก่อนวันที่ตรวจรับ');
  return out;
};

const ORDER_DATE_KEYS = ['doc_date', 'received_date', 'approval_date', 'inspected_date', 'disbursed_date'];

export interface ResourceDef {
  resource: Resource;
  /** Columns offered as dropdown filters above the table (options come from the loaded rows) */
  filterKeys?: string[];
  /** Date columns offered in the date-range filter (first one is the default) */
  dateKeys?: string[];
  /** Soft validation: messages only, saving is never blocked */
  warnings?: (values: Values) => string[];
  /** Whether a new row gets the next "N/FY" number pre-filled */
  autoDocNo?: boolean;
  tab: string;
  singular: string;
  fields: FieldDef[];
  /** Sum this numeric column in the list footer */
  totalKey?: string;
  /** Rows belong to a fiscal year (guarantees span years) */
  fiscalYear: boolean;
}

export const RESOURCE_DEFS: Record<Resource, ResourceDef> = {
  orders: { resource: 'orders', tab: 'ทะเบียนใบสั่งซื้อ/จ้าง', singular: 'ใบสั่งซื้อ/จ้าง', fields: ORDER_CONTRACT_FIELDS('ใบสั่ง'), totalKey: 'agreed_price', fiscalYear: true, filterKeys: ['status', 'responsible', 'method', 'budget_source'], dateKeys: ORDER_DATE_KEYS, warnings: orderContractWarnings, autoDocNo: true },
  contracts: { resource: 'contracts', tab: 'ทะเบียนสัญญา', singular: 'สัญญา', fields: ORDER_CONTRACT_FIELDS('สัญญา'), totalKey: 'agreed_price', fiscalYear: true, filterKeys: ['status', 'responsible', 'method', 'budget_source'], dateKeys: ORDER_DATE_KEYS, warnings: orderContractWarnings, autoDocNo: true },
  incoming: {
    resource: 'incoming', tab: 'ทะเบียนหนังสือรับ', singular: 'หนังสือรับ', totalKey: 'amount', fiscalYear: true, dateKeys: ['doc_date'],
    fields: [
      { key: 'reg_no', label: 'เลขทะเบียนรับ', type: 'number', inputMode: 'numeric', list: true },
      { key: 'doc_no', label: 'เลขที่เอกสาร', list: true },
      { key: 'doc_date', label: 'ลงวันที่', type: 'date', list: true },
      { key: 'from_name', label: 'จาก', list: true, wide: true },
      { key: 'subject', label: 'เรื่อง', type: 'textarea', list: true, wide: true },
      { key: 'amount', label: 'ราคา (บาท)', type: 'number', inputMode: 'decimal', align: 'right', list: true },
      { key: 'category', label: 'ประเภท', list: true, wide: true },
      { key: 'link_ref', label: 'เกี่ยวข้องกับใบสั่ง/สัญญา', type: 'link', linkRole: true, list: true, wide: true },
      { key: 'link_role', label: 'หนังสือฉบับนี้เป็น', hidden: true },
    ],
  },
  guarantees: {
    resource: 'guarantees', tab: 'หลักประกันสัญญา', singular: 'หลักประกันสัญญา', fiscalYear: false,
    dateKeys: ['received_date', 'return_due_date'],
    warnings: (v) => (before(v, 'return_due_date', 'received_date') ? ['วันครบกำหนดการคืนอยู่ก่อนวันที่รับหลักประกัน'] : []),
    fields: [
      { key: 'seq_no', label: 'ลำดับ', type: 'number', inputMode: 'numeric' },
      { key: 'returned', label: 'คืนหลักประกันสำเร็จแล้ว', type: 'checkbox', list: true },
      { key: 'received_date', label: 'วันที่รับหลักประกันสัญญา', type: 'date', list: true },
      { key: 'detail', label: 'รายละเอียดหลักประกัน', type: 'textarea', list: true, wide: true },
      { key: 'title', label: 'ชื่อเรื่อง', type: 'textarea', list: true, wide: true },
      { key: 'contract_ref', label: 'เลขที่สัญญา', list: true, wide: true },
      { key: 'link_ref', label: 'สัญญา/ใบสั่งในระบบ', type: 'link', list: true, wide: true },
      { key: 'project_no', label: 'เลขที่โครงการ', inputMode: 'numeric' },
      { key: 'vendor_name', label: 'ชื่อผู้ขาย/ผู้รับจ้าง', list: true },
      { key: 'return_due_date', label: 'วันครบกำหนดการคืน', type: 'date', list: true },
      { key: 'return_note', label: 'บันทึกการคืน', placeholder: 'เช่น คืนแล้ว วันที่ 5 พ.ค. 69', list: true, wide: true },
    ],
  },
};
