import 'dotenv/config';
import { connect } from '../src/services/mysql';

async function main() {
  const conn = await connect(true);
  console.log('Connected to MySQL DB');

  await conn.beginTransaction();
  try {
    // Delete temporary test order 48
    await conn.query('DELETE FROM purchase_orders WHERE id = 48');

    // Restore and update POs 22 to 27 and 47
    const orders = [
      {
        id: 22,
        doc_no: '1/2570',
        reg_no: 1,
        job_title: 'ค่าบริการ CT SCAN เดือน ส.ค.69',
        vendor_name: 'บ.สีมาเฮลธ์แคร์ จำกัด',
        budget_amount: 881950.00,
        agreed_price: 881950.00,
        median_price: 881950.00,
        received_date: '2026-10-05',
        doc_date: '2026-10-05',
        responsible: 'สุภาณี',
        budget_source: 'เงินบำรุง',
        method: 'วิธีเฉพาะเจาะจง',
        status: 'อยู่ระหว่างกระบวนการจัดซื้อจัดจ้าง'
      },
      {
        id: 23,
        doc_no: '2/2570',
        reg_no: 2,
        job_title: 'ปะยางรถยนต์ 2 เส้น',
        vendor_name: 'ร้านตี๋การยาง',
        budget_amount: 400.00,
        agreed_price: 400.00,
        median_price: 400.00,
        received_date: '2026-10-05',
        doc_date: '2026-10-05',
        responsible: 'รมณภัทร',
        budget_source: 'เงินบำรุง',
        method: 'วิธีเฉพาะเจาะจง',
        status: 'อยู่ระหว่างกระบวนการจัดซื้อจัดจ้าง'
      },
      {
        id: 24,
        doc_no: '3/2570',
        reg_no: 3,
        job_title: 'จ้างเหมาบำรุงเครื่องกรองน้ำ',
        vendor_name: 'นายณัฐพล ฉายฉันท์',
        budget_amount: 8900.00,
        agreed_price: 8900.00,
        median_price: 8900.00,
        received_date: '2026-10-05',
        doc_date: '2026-10-05',
        responsible: 'พิชญ์ศุภร',
        budget_source: 'เงินบำรุง',
        method: 'วิธีเฉพาะเจาะจง',
        status: 'ลงนามในสัญญา'
      },
      {
        id: 25,
        doc_no: '4/2570',
        reg_no: 4,
        job_title: 'สมุดเบิกพัสดุ',
        vendor_name: 'โรงพิมพ์ราชยานยนต์',
        budget_amount: 4800.00,
        agreed_price: 4800.00,
        median_price: 4800.00,
        received_date: '2026-10-05',
        doc_date: '2026-10-05',
        responsible: 'นาตยา',
        budget_source: 'เงินบำรุง',
        method: 'วิธีเฉพาะเจาะจง',
        status: 'อยู่ระหว่างกระบวนการจัดซื้อจัดจ้าง'
      },
      {
        id: 26,
        doc_no: '5/2570',
        reg_no: 5,
        job_title: 'กระดาษความร้อน 57*38',
        vendor_name: 'บ.ซีพี แอ็กซ์ตร้า จำกัด',
        budget_amount: 6720.00,
        agreed_price: 6720.00,
        median_price: 6720.00,
        received_date: '2026-10-05',
        doc_date: '2026-10-05',
        responsible: 'นาตยา',
        budget_source: 'เงินบำรุง',
        method: 'วิธีเฉพาะเจาะจง',
        status: 'อยู่ระหว่างกระบวนการจัดซื้อจัดจ้าง'
      },
      {
        id: 27,
        doc_no: '6/2570',
        reg_no: 6,
        job_title: 'วัสดุก่อสร้าง จำนวน 10 รายการ',
        vendor_name: 'ร้านณัฐการเกษตร',
        budget_amount: 5650.00,
        agreed_price: 5650.00,
        median_price: 5650.00,
        received_date: '2026-10-05',
        doc_date: '2026-10-05',
        responsible: 'รมณภัทร',
        budget_source: 'เงินบำรุง',
        method: 'วิธีเฉพาะเจาะจง',
        status: 'อยู่ระหว่างกระบวนการจัดซื้อจัดจ้าง'
      },
      {
        id: 47,
        doc_no: '7/2570',
        reg_no: 38,
        job_title: 'สก็อตไบรต์ ฟิล์มหุ้มอาหาร',
        vendor_name: 'บ.ซีพี แอ็กซ์ตร้า จำกัด',
        budget_amount: 3145.00,
        agreed_price: 3145.00,
        median_price: 3145.00,
        received_date: '2026-10-12',
        doc_date: '2026-10-12',
        responsible: 'พิชญ์ศุภร',
        budget_source: 'เงินบำรุง',
        method: 'วิธีเฉพาะเจาะจง',
        status: 'อยู่ระหว่างกระบวนการจัดซื้อจัดจ้าง'
      }
    ];

    for (const o of orders) {
      await conn.query(
        `UPDATE purchase_orders 
         SET deleted_at = NULL, deleted_by = NULL,
             doc_no = ?, job_title = ?, vendor_name = ?, budget_amount = ?, agreed_price = ?, median_price = ?,
             received_date = ?, doc_date = ?, responsible = ?, budget_source = ?, method = ?, status = ?
         WHERE id = ?`,
        [o.doc_no, o.job_title, o.vendor_name, o.budget_amount, o.agreed_price, o.median_price,
         o.received_date, o.doc_date, o.responsible, o.budget_source, o.method, o.status, o.id]
      );

      // Link incoming doc
      await conn.query(
        "UPDATE incoming_docs SET link_resource = 'orders', link_id = ?, link_role = 'origin' WHERE reg_no = ?",
        [o.id, o.reg_no]
      );

      console.log(`PO ${o.doc_no} (id: ${o.id}) -> incoming doc #${o.reg_no}`);
    }

    await conn.commit();
    console.log('Successfully restored and linked orders!');
  } catch (err) {
    await conn.rollback();
    console.error('Failed to update:', err);
    throw err;
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
