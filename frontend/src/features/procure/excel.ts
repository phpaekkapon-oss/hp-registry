import type { FieldDef } from './fields';
import { getExporter, thaiDate, thaiNowStamp, todayIso } from './format';

/**
 * Excel (.xlsx) export, built in the browser (exceljs is loaded only when the user clicks export).
 *
 * Dates are written as Thai text in พ.ศ. (e.g. "23 ต.ค. 2569"). A real Excel date would be displayed
 * by the viewer's own calendar settings and can silently show the Gregorian year, which is wrong for
 * a government register. Amounts are real numbers (#,##0.00) so they can be summed and sorted.
 */

type ColType = 'text' | 'date' | 'money' | 'number' | 'bool';

export interface ExcelColumn {
  header: string;
  key: string;
  type: ColType;
  width: number;
}

export interface SheetSpec {
  /** Worksheet tab name (max 31 chars, no : \ / ? * [ ]) */
  name: string;
  title: string;
  /** Lines under the title: fiscal year, active filters ... */
  notes: string[];
  columns: ExcelColumn[];
  rows: Record<string, unknown>[];
  /** Column key to total at the bottom (SUBTOTAL, so it follows Excel's own filter) */
  totalKey?: string;
}

const LONG_TEXT = new Set(['job_title', 'subject', 'detail', 'title', 'contract_ref', 'note', 'project']);
const MID_TEXT = new Set(['vendor_name', 'owner_group', 'from_name', 'category', 'return_note', 'status', 'method', 'budget_source']);

/** Column definitions for a register, taken from the same field list the screen uses */
export function columnsFromFields(fields: FieldDef[]): ExcelColumn[] {
  return fields.filter((f) => !f.hidden).map((f) => ({
    header: f.label,
    key: f.type === 'incoming' ? 'incoming_ref' : f.type === 'link' ? 'link_label' : f.key,
    type: f.type === 'date' ? 'date' : f.type === 'checkbox' ? 'bool' : f.type === 'number' ? (f.align === 'right' ? 'money' : 'number') : 'text',
    width: f.type === 'date' ? 16 : f.type === 'number' ? (f.align === 'right' ? 18 : 12) : f.type === 'checkbox' ? 14 : LONG_TEXT.has(f.key) || f.type === 'textarea' ? 48 : MID_TEXT.has(f.key) ? 30 : 20,
  }));
}

const colLetter = (n: number): string => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

const safeSheetName = (name: string) => name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31);

export function excelFilename(base: string): string {
  return `${base}-${todayIso().replace(/-/g, '')}.xlsx`;
}

export async function exportXlsx(filename: string, sheets: SheetSpec[]): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ระบบงานพัสดุ';
  wb.created = new Date();
  const FONT = 'Tahoma';
  const stamp = thaiNowStamp();

  for (const spec of sheets) {
    const ws = wb.addWorksheet(safeSheetName(spec.name), {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    const cols: ExcelColumn[] = [{ header: 'ที่', key: '__no', type: 'number', width: 6 }, ...spec.columns];
    const last = cols.length;

    // Title block: title, notes (one line each), print stamp, blank, then the header row
    let r = 1;
    ws.mergeCells(r, 1, r, last);
    ws.getCell(r, 1).value = spec.title;
    ws.getCell(r, 1).font = { name: FONT, size: 14, bold: true };
    r++;
    for (const line of [...spec.notes, ...(getExporter() ? [`ส่งออกโดย ${getExporter()}`] : []), `ออกรายงานเมื่อ ${stamp}`]) {
      ws.mergeCells(r, 1, r, last);
      ws.getCell(r, 1).value = line;
      ws.getCell(r, 1).font = { name: FONT, size: 10, color: { argb: 'FF475569' } };
      r++;
    }
    const headerRow = r;
    ws.views = [{ state: 'frozen', ySplit: headerRow, xSplit: 0 }];

    cols.forEach((c, i) => {
      const cell = ws.getCell(headerRow, i + 1);
      cell.value = c.header;
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      cell.alignment = { vertical: 'middle', horizontal: c.type === 'money' ? 'right' : 'center', wrapText: true };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      ws.getColumn(i + 1).width = c.width;
    });
    ws.getRow(headerRow).height = 34;

    spec.rows.forEach((row, idx) => {
      const rowNo = headerRow + 1 + idx;
      cols.forEach((c, i) => {
        const cell = ws.getCell(rowNo, i + 1);
        const v = c.key === '__no' ? idx + 1 : row[c.key];
        if (v === null || v === undefined || v === '') {
          cell.value = null;
        } else if (c.type === 'date') {
          cell.value = thaiDate(v);
        } else if (c.type === 'bool') {
          cell.value = v ? 'คืนแล้ว' : 'ยังไม่คืน';
        } else if (c.type === 'money' || c.type === 'number') {
          const n = Number(v);
          cell.value = Number.isFinite(n) ? n : String(v);
          cell.numFmt = c.type === 'money' ? '#,##0.00' : '#,##0.##';
        } else {
          cell.value = String(v);
          cell.numFmt = '@'; // keep tax IDs / project numbers as text (no 1.2E+12, no lost leading zeros)
        }
        cell.font = { name: FONT, size: 10 };
        cell.alignment = { vertical: 'top', wrapText: c.type === 'text', horizontal: c.type === 'money' ? 'right' : c.type === 'date' || c.type === 'bool' || c.key === '__no' ? 'center' : undefined };
        cell.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } };
      });
    });

    const lastDataRow = headerRow + spec.rows.length;
    if (spec.rows.length > 0) ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastDataRow, column: last } };

    if (spec.totalKey && spec.rows.length > 0) {
      const ci = cols.findIndex((c) => c.key === spec.totalKey) + 1;
      const totalRow = lastDataRow + 1;
      const label = ws.getCell(totalRow, 1);
      ws.mergeCells(totalRow, 1, totalRow, Math.max(1, ci - 1));
      label.value = `รวม (${spec.rows.length.toLocaleString('th-TH')} รายการ)`;
      label.alignment = { horizontal: 'right' };
      const total = ws.getCell(totalRow, ci);
      const colL = colLetter(ci);
      total.value = { formula: `SUBTOTAL(109,${colL}${headerRow + 1}:${colL}${lastDataRow})`, result: spec.rows.reduce((s, x) => s + (Number(x[spec.totalKey!]) || 0), 0) };
      total.numFmt = '#,##0.00';
      for (let i = 1; i <= last; i++) {
        const c = ws.getCell(totalRow, i);
        c.font = { name: FONT, size: 10, bold: true };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        c.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
      }
    }
    ws.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
  }

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface Skr1RowItem {
  no: number;
  job_title: string;
  budget_amount: number | null;
  median_price: number | null;
  method: string;
  vendor_name: string;
  agreed_price: number | null;
  reason: string;
  doc_no: string;
  doc_date: string | null;
}

/**
 * Exports official Thai Government สขร. 1 form (แบบสรุปผลการจัดซื้อจัดจ้างในรอบเดือน) into Excel
 */
export async function exportSkr1Excel({
  monthName,
  year,
  agencyName = 'กองโรคติดต่อทั่วไป กรมควบคุมโรค กระทรวงสาธารณสุข',
  items,
}: {
  monthName: string;
  year: number;
  agencyName?: string;
  items: Skr1RowItem[];
}): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ระบบงานพัสดุ';
  wb.created = new Date();
  const FONT = 'Tahoma';
  const stamp = thaiNowStamp();

  const ws = wb.addWorksheet(`สขร.1_${monthName}`, {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });

  const headers = [
    { header: 'ลำดับที่', width: 8, key: 'no' },
    { header: 'งานที่จัดซื้อหรือจัดจ้าง', width: 36, key: 'job_title' },
    { header: 'วงเงินที่จัดซื้อ\nหรือจัดจ้าง (บาท)', width: 16, key: 'budget_amount' },
    { header: 'ราคากลาง\n(บาท)', width: 16, key: 'median_price' },
    { header: 'วิธีซื้อหรือจ้าง', width: 16, key: 'method' },
    { header: 'รายชื่อผู้เสนอราคา\nและราคาที่เสนอ', width: 28, key: 'vendor_offer' },
    { header: 'ผู้ได้รับการคัดเลือกและราคา\nที่ตกลงซื้อหรือจ้าง', width: 28, key: 'vendor_agreed' },
    { header: 'เหตุผลที่คัดเลือก\nโดยสังเขป', width: 26, key: 'reason' },
    { header: 'เลขที่และวันที่ของสัญญา\nหรือข้อตกลงในการซื้อหรือจ้าง', width: 24, key: 'contract_ref' },
  ];
  const lastCol = headers.length;

  // Title rows
  let r = 1;
  ws.mergeCells(r, 1, r, lastCol);
  ws.getCell(r, 1).value = `แบบสรุปผลการดำเนินการจัดซื้อจัดจ้างในรอบเดือน ${monthName} พ.ศ. ${year}`;
  ws.getCell(r, 1).font = { name: FONT, size: 14, bold: true };
  ws.getCell(r, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(r).height = 26;
  r++;

  ws.mergeCells(r, 1, r, lastCol);
  ws.getCell(r, 1).value = `(ชื่อหน่วยงาน) ${agencyName}`;
  ws.getCell(r, 1).font = { name: FONT, size: 12, bold: true };
  ws.getCell(r, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(r).height = 22;
  r++;

  ws.mergeCells(r, 1, r, lastCol);
  ws.getCell(r, 1).value = `วันที่ออกรายงาน: ${stamp}`;
  ws.getCell(r, 1).font = { name: FONT, size: 9, color: { argb: 'FF64748B' } };
  ws.getCell(r, 1).alignment = { horizontal: 'right', vertical: 'middle' };
  r++;

  // Table header
  const headerRow = r;
  headers.forEach((h, idx) => {
    const colIdx = idx + 1;
    const cell = ws.getCell(headerRow, colIdx);
    cell.value = h.header;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    ws.getColumn(colIdx).width = h.width;
  });
  ws.getRow(headerRow).height = 36;
  r++;

  // Data rows
  items.forEach((item, idx) => {
    const rowIdx = r;
    const noCell = ws.getCell(rowIdx, 1);
    noCell.value = idx + 1;
    noCell.alignment = { vertical: 'top', horizontal: 'center' };

    const jobCell = ws.getCell(rowIdx, 2);
    jobCell.value = item.job_title;
    jobCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };

    const budgetCell = ws.getCell(rowIdx, 3);
    if (item.budget_amount !== null && item.budget_amount !== undefined) {
      budgetCell.value = Number(item.budget_amount);
      budgetCell.numFmt = '#,##0.00';
    }
    budgetCell.alignment = { vertical: 'top', horizontal: 'right' };

    const medianCell = ws.getCell(rowIdx, 4);
    if (item.median_price !== null && item.median_price !== undefined) {
      medianCell.value = Number(item.median_price);
      medianCell.numFmt = '#,##0.00';
    }
    medianCell.alignment = { vertical: 'top', horizontal: 'right' };

    const methodCell = ws.getCell(rowIdx, 5);
    methodCell.value = item.method || 'วิธีเฉพาะเจาะจง';
    methodCell.alignment = { vertical: 'top', horizontal: 'center', wrapText: true };

    const offerCell = ws.getCell(rowIdx, 6);
    offerCell.value = item.vendor_name ? `${item.vendor_name}\n(เสนอราคา ${item.agreed_price ? Number(item.agreed_price).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-'} บาท)` : '-';
    offerCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };

    const agreedCell = ws.getCell(rowIdx, 7);
    agreedCell.value = item.vendor_name ? `${item.vendor_name}\n(ราคาที่ตกลง ${item.agreed_price ? Number(item.agreed_price).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-'} บาท)` : '-';
    agreedCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };

    const reasonCell = ws.getCell(rowIdx, 8);
    reasonCell.value = item.reason || 'เป็นผู้มีคุณสมบัติและข้อเสนอตรงตามเกณฑ์ที่กำหนดและราคาเหมาะสม';
    reasonCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };

    const contractCell = ws.getCell(rowIdx, 9);
    const dateText = item.doc_date ? thaiDate(item.doc_date) : '';
    contractCell.value = item.doc_no ? `เลขที่ ${item.doc_no}${dateText ? `\nลงวันที่ ${dateText}` : ''}` : '-';
    contractCell.alignment = { vertical: 'top', horizontal: 'center', wrapText: true };

    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(rowIdx, c);
      cell.font = { name: FONT, size: 9.5 };
      cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
    }
    r++;
  });

  // Total summary row
  const totalRow = r;
  ws.mergeCells(totalRow, 1, totalRow, 2);
  const totalLabel = ws.getCell(totalRow, 1);
  totalLabel.value = `รวมทั้งสิ้น (${items.length.toLocaleString('th-TH')} รายการ)`;
  totalLabel.font = { name: FONT, size: 10, bold: true };
  totalLabel.alignment = { vertical: 'middle', horizontal: 'right' };

  const totalBudget = ws.getCell(totalRow, 3);
  totalBudget.value = items.reduce((s, it) => s + (Number(it.budget_amount) || 0), 0);
  totalBudget.numFmt = '#,##0.00';
  totalBudget.font = { name: FONT, size: 10, bold: true };
  totalBudget.alignment = { vertical: 'middle', horizontal: 'right' };

  const totalMedian = ws.getCell(totalRow, 4);
  totalMedian.value = items.reduce((s, it) => s + (Number(it.median_price) || 0), 0);
  totalMedian.numFmt = '#,##0.00';
  totalMedian.font = { name: FONT, size: 10, bold: true };
  totalMedian.alignment = { vertical: 'middle', horizontal: 'right' };

  const totalAgreed = ws.getCell(totalRow, 7);
  totalAgreed.value = items.reduce((s, it) => s + (Number(it.agreed_price) || 0), 0);
  totalAgreed.numFmt = '#,##0.00';
  totalAgreed.font = { name: FONT, size: 10, bold: true };
  totalAgreed.alignment = { vertical: 'middle', horizontal: 'right' };

  for (let c = 1; c <= lastCol; c++) {
    const cell = ws.getCell(totalRow, c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
  }
  ws.getRow(totalRow).height = 24;
  r += 3;

  // Signatures
  ws.mergeCells(r, 2, r, 4);
  ws.getCell(r, 2).value = '(ลงชื่อ)..........................................................................ผู้รายงาน';
  ws.getCell(r, 2).font = { name: FONT, size: 10 };
  ws.getCell(r, 2).alignment = { horizontal: 'center' };

  ws.mergeCells(r, 6, r, 8);
  ws.getCell(r, 6).value = '(ลงชื่อ)..........................................................................หัวหน้าเจ้าหน้าที่';
  ws.getCell(r, 6).font = { name: FONT, size: 10 };
  ws.getCell(r, 6).alignment = { horizontal: 'center' };
  r++;

  ws.mergeCells(r, 2, r, 4);
  ws.getCell(r, 2).value = '(..........................................................................)';
  ws.getCell(r, 2).font = { name: FONT, size: 10 };
  ws.getCell(r, 2).alignment = { horizontal: 'center' };

  ws.mergeCells(r, 6, r, 8);
  ws.getCell(r, 6).value = '(..........................................................................)';
  ws.getCell(r, 6).font = { name: FONT, size: 10 };
  ws.getCell(r, 6).alignment = { horizontal: 'center' };
  r++;

  ws.mergeCells(r, 2, r, 4);
  ws.getCell(r, 2).value = 'ตำแหน่ง เจ้าหน้าที่พัสดุ';
  ws.getCell(r, 2).font = { name: FONT, size: 10 };
  ws.getCell(r, 2).alignment = { horizontal: 'center' };

  ws.mergeCells(r, 6, r, 8);
  ws.getCell(r, 6).value = 'ตำแหน่ง หัวหน้าเจ้าหน้าที่พัสดุ';
  ws.getCell(r, 6).font = { name: FONT, size: 10 };
  ws.getCell(r, 6).alignment = { horizontal: 'center' };

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `แบบ_สขร1_${monthName}_${year}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
