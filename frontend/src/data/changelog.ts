export type ReleaseKind = 'major' | 'minor' | 'patch';

export interface ReleaseNote {
  version: string;
  /** ISO date (YYYY-MM-DD) */
  date: string;
  title: string;
  kind: ReleaseKind;
  highlights: string[];
}

/**
 * Newest first. release.bat refuses to publish a version that has no entry here,
 * so every version tagged on GitHub is also described in the app.
 */
export const CHANGELOG: ReleaseNote[] = [
  {
    version: '1.0.1',
    date: '2026-11-04',
    title: 'ปรับหน้าตา โหมดมืด และการแจ้งเวอร์ชันใหม่',
    kind: 'patch',
    highlights: [
      'เปลี่ยนฟอนต์หน้าจอเป็น Noto Sans Thai และใช้ TH Sarabun New กับเอกสารที่พิมพ์ (ติดตั้งในเครื่อง ใช้งานแบบ offline ได้)',
      'หน้าแรก: เลือกดูข้อมูลตามปีงบประมาณหรือปี พ.ศ. ย้อนหลังได้ 5 ปี และสลับกราฟรายเดือนเป็นแท่ง เส้น หรือพื้นที่ ตามจำนวนหรือมูลค่า',
      'ปรับสีโหมดมืดให้กลมกลืนทั้งระบบ แก้สไตล์แถบเมนู "สะอาด" ที่ตัวอักษรมองไม่เห็นในโหมดมืด และจัดแถบหัว/แถบเมนูให้กะทัดรัดขึ้น',
      'แจ้งเตือนเมื่อมีเวอร์ชันใหม่ระหว่างที่เปิดระบบอยู่ และแสดงบันทึกการอัปเดตหนึ่งครั้งหลังอัปเดต',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-11-03',
    title: 'เปิดใช้งานระบบงานพัสดุ',
    kind: 'major',
    highlights: [
      'ทะเบียนหนังสือรับ (ต้นเรื่อง) ใบสั่งซื้อ/สั่งจ้าง (PO) ทะเบียนสัญญา และหลักประกันสัญญา',
      'ติดตามความก้าวหน้าการจัดหา 17 ขั้นตอน พร้อมรายงานสรุป (แบบ สขร. 1) และส่งออก Excel',
      'ซ่อนข้อมูลส่วนบุคคลตามสิทธิ์ผู้ใช้ (PDPA) และบันทึกประวัติการแก้ไข',
      'เลือกสีธีมและสไตล์แถบเมนูด้านข้างได้ รองรับโหมดมืด',
    ],
  },
];

export const latestRelease = (): ReleaseNote => CHANGELOG[0];
