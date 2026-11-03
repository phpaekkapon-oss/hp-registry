/**
 * Database schema for the procurement registry (ทะเบียนคุมใบสั่ง/สัญญา).
 * Mirrors the sheets of "[ปีงบ 2570] O16_ทะเบียนคุมใบสั่ง_สัญญา.xlsx".
 * Every statement is idempotent (CREATE TABLE IF NOT EXISTS).
 */

/** Columns shared by ทะเบียนใบสั่ง and ทะเบียนสัญญา (the two sheets have the same layout) */
const ORDER_CONTRACT_COLUMNS = `
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  fiscal_year      SMALLINT UNSIGNED NOT NULL DEFAULT 2570 COMMENT 'ปีงบประมาณ (พ.ศ.)',
  responsible      VARCHAR(100) NULL COMMENT 'ผู้รับผิดชอบ',
  received_date    DATE NULL COMMENT 'รับเรื่องเข้าวันที่',
  owner_group      VARCHAR(255) NULL COMMENT 'กลุ่ม/ฝ่ายเจ้าของเรื่อง',
  agency_type      VARCHAR(100) NULL COMMENT 'ประเภทหน่วยงาน',
  ministry         VARCHAR(150) NULL COMMENT 'กระทรวง',
  agency_name      VARCHAR(255) NULL COMMENT 'ชื่อหน่วยงาน',
  district         VARCHAR(100) NULL COMMENT 'อำเภอ',
  province         VARCHAR(100) NULL COMMENT 'จังหวัด',
  job_title        VARCHAR(1000) NOT NULL COMMENT 'งานที่ซื้อหรือจ้าง',
  quantity         DECIMAL(12,2) NULL COMMENT 'จำนวนงาน/รายการ',
  unit             VARCHAR(50) NULL COMMENT 'หน่วย',
  budget_amount    DECIMAL(15,2) NULL COMMENT 'วงเงินงบประมาณที่ได้รับจัดสรร',
  budget_source    VARCHAR(150) NULL COMMENT 'แหล่งที่มาของงบประมาณ',
  output_code      VARCHAR(50) NULL COMMENT 'ผลผลิต',
  main_activity    VARCHAR(50) NULL COMMENT 'กิจกรรมหลัก',
  status           VARCHAR(150) NULL COMMENT 'สถานะการจัดซื้อจัดจ้าง',
  method           VARCHAR(100) NULL COMMENT 'วิธีการจัดซื้อจัดจ้าง',
  doc_no           VARCHAR(50) NULL COMMENT 'เลขที่ใบสั่ง/สัญญา เช่น 1/2570',
  doc_date         DATE NULL COMMENT 'ลงวันที่',
  vendor_received_date DATE NULL COMMENT 'วันที่คู่สัญญารับใบสั่ง/ลงนามสัญญา',
  delivery_due     VARCHAR(100) NULL COMMENT 'ครบกำหนดส่งมอบ (วันที่ หรือข้อความ)',
  median_price     DECIMAL(15,2) NULL COMMENT 'ราคากลาง (บาท)',
  agreed_price     DECIMAL(15,2) NULL COMMENT 'ราคาที่ตกลงซื้อหรือจ้าง (บาท)',
  vendor_tax_id    VARCHAR(20) NULL COMMENT 'เลขประจำตัวผู้เสียภาษี',
  vendor_name      VARCHAR(255) NULL COMMENT 'ผู้ประกอบการที่ได้รับการคัดเลือก',
  project_no       VARCHAR(50) NULL COMMENT 'เลขที่โครงการ',
  approval_no      VARCHAR(50) NULL COMMENT 'อนุมัติสั่งซื้อ/จ้าง: เลขที่ สธ0410.1.4/',
  approval_date    DATE NULL COMMENT 'อนุมัติสั่งซื้อ/จ้าง: วันที่',
  inspect_report_no   VARCHAR(50) NULL COMMENT 'ตรวจรับพัสดุ: เลขที่ สธ 0410.1.4/',
  inspect_report_date DATE NULL COMMENT 'ตรวจรับพัสดุ: วันที่รายงานผล',
  inspected_date   DATE NULL COMMENT 'ตรวจรับพัสดุ: วันที่ตรวจรับ',
  disbursed_date   DATE NULL COMMENT 'วันที่ส่งเบิก',
  note             VARCHAR(1000) NULL COMMENT 'หมายเหตุ',
  created_by       VARCHAR(50) NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fy (fiscal_year),
  KEY idx_doc_no (doc_no),
  KEY idx_status (status),
  KEY idx_vendor (vendor_name(100))`;

const TABLE_OPTS = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

export const SCHEMA_STATEMENTS: string[] = [
  // ตัวเลือกใน dropdown (ผู้รับผิดชอบ, กลุ่ม, แหล่งเงิน, วิธีจัดซื้อ, สถานะ, หน่วยนับ) — ชีต x
  `CREATE TABLE IF NOT EXISTS ref_lookup (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    kind       ENUM('staff','group','fund','method','status','unit') NOT NULL,
    value      VARCHAR(255) NOT NULL,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_kind_value (kind, value)
  ) ${TABLE_OPTS} COMMENT='รายการตัวเลือก (dropdown)'`,

  // ทะเบียนหนังสือรับ
  `CREATE TABLE IF NOT EXISTS incoming_docs (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    fiscal_year SMALLINT UNSIGNED NOT NULL DEFAULT 2570,
    reg_no      INT UNSIGNED NULL COMMENT 'เลขทะเบียนรับ',
    doc_no      VARCHAR(100) NULL COMMENT 'เลขที่เอกสาร',
    doc_date    DATE NULL COMMENT 'ลงวันที่',
    from_name   VARCHAR(255) NULL COMMENT 'จาก',
    subject     VARCHAR(1000) NULL COMMENT 'เรื่อง',
    amount      DECIMAL(15,2) NULL COMMENT 'ราคา',
    category    VARCHAR(255) NULL COMMENT 'ประเภท',
    link_resource ENUM('orders','contracts') NULL COMMENT 'เป็นของใบสั่ง/สัญญา',
    link_id     INT UNSIGNED NULL,
    link_role   ENUM('origin','invoice','other') NULL COMMENT 'origin = ต้นเรื่อง, invoice = ใบแจ้งหนี้/ใบส่งของ, other = อื่น ๆ',
    created_by  VARCHAR(50) NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_fy_reg (fiscal_year, reg_no)
  ) ${TABLE_OPTS} COMMENT='ทะเบียนหนังสือรับ'`,

  // ทะเบียนใบสั่ง
  `CREATE TABLE IF NOT EXISTS purchase_orders (${ORDER_CONTRACT_COLUMNS}
  ) ${TABLE_OPTS} COMMENT='ทะเบียนใบสั่งซื้อ/สั่งจ้าง'`,

  // ทะเบียนสัญญา
  `CREATE TABLE IF NOT EXISTS contracts (${ORDER_CONTRACT_COLUMNS}
  ) ${TABLE_OPTS} COMMENT='ทะเบียนสัญญา'`,

  // ทะเบียนคุมหลักประกันสัญญา
  `CREATE TABLE IF NOT EXISTS contract_guarantees (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    seq_no        INT UNSIGNED NULL COMMENT 'ลำดับ',
    returned      TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'การคืนสำเร็จ',
    received_date DATE NULL COMMENT 'วันที่รับหลักประกันสัญญา',
    detail        VARCHAR(1000) NULL COMMENT 'รายละเอียดหลักประกัน',
    title         VARCHAR(1000) NULL COMMENT 'ชื่อเรื่อง',
    contract_ref  VARCHAR(500) NULL COMMENT 'เลขที่สัญญา',
    project_no    VARCHAR(50) NULL COMMENT 'เลขที่โครงการ',
    vendor_name   VARCHAR(255) NULL COMMENT 'ชื่อผู้ขาย/ผู้รับจ้าง',
    return_due_date DATE NULL COMMENT 'วันครบกำหนดการคืน',
    return_note   VARCHAR(500) NULL COMMENT 'บันทึกการคืน เช่น คืนแล้ว วันที่ 5 พ.ค. 69',
    link_resource ENUM('orders','contracts') NULL COMMENT 'สัญญา/ใบสั่งในระบบ',
    link_id       INT UNSIGNED NULL,
    created_by    VARCHAR(50) NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_returned_due (returned, return_due_date)
  ) ${TABLE_OPTS} COMMENT='ทะเบียนคุมหลักประกันสัญญา'`,

  // ความก้าวหน้า (Timeline 17 ขั้นตอน)
  `CREATE TABLE IF NOT EXISTS progress_steps_ref (
    step_no TINYINT UNSIGNED NOT NULL,
    name    VARCHAR(255) NOT NULL,
    PRIMARY KEY (step_no)
  ) ${TABLE_OPTS} COMMENT='ขั้นตอนการจัดหา 1-17'`,

  `CREATE TABLE IF NOT EXISTS progress_projects (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    fiscal_year SMALLINT UNSIGNED NOT NULL DEFAULT 2570,
    seq_no      INT UNSIGNED NULL COMMENT 'ลำดับ',
    project     VARCHAR(1000) NOT NULL COMMENT 'โครงการ',
    method      VARCHAR(100) NULL COMMENT 'วิธีซื้อจ้าง',
    operator    VARCHAR(100) NULL COMMENT 'ผู้ดำเนินการ',
    link_resource ENUM('orders','contracts') NULL COMMENT 'ใบสั่ง/สัญญาที่ได้',
    link_id     INT UNSIGNED NULL,
    created_by  VARCHAR(50) NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_fy (fiscal_year)
  ) ${TABLE_OPTS} COMMENT='ความก้าวหน้าการจัดหา: โครงการ'`,

  `CREATE TABLE IF NOT EXISTS progress_step_dates (
    project_id INT UNSIGNED NOT NULL,
    step_no    TINYINT UNSIGNED NOT NULL,
    step_date  DATE NOT NULL,
    PRIMARY KEY (project_id, step_no),
    CONSTRAINT fk_psd_project FOREIGN KEY (project_id) REFERENCES progress_projects (id) ON DELETE CASCADE
  ) ${TABLE_OPTS} COMMENT='วันที่ทำแต่ละขั้นตอนของโครงการ'`,

  // รายงานสรุป: ปัญหา/อุปสรรค และ ข้อเสนอแนะ
  `CREATE TABLE IF NOT EXISTS report_notes (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    fiscal_year SMALLINT UNSIGNED NOT NULL,
    kind        ENUM('problem','suggestion') NOT NULL,
    content     TEXT NOT NULL,
    updated_by  VARCHAR(50) NULL,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_fy_kind (fiscal_year, kind)
  ) ${TABLE_OPTS} COMMENT='รายงานสรุป: ปัญหา/อุปสรรค, ข้อเสนอแนะ'`,

  // ผู้ใช้งาน: ข้อมูลตัวตนซิงก์จาก HOSxP (opduser + doctor) ส่วนสิทธิ์ในระบบพัสดุกำหนดที่นี่
  // ไม่เก็บรหัสผ่านใด ๆ ของ HOSxP
  `CREATE TABLE IF NOT EXISTS app_users (
    login_name     VARCHAR(100) NOT NULL COMMENT 'opduser.loginname',
    display_name   VARCHAR(250) NULL COMMENT 'opduser.name',
    doctor_code    VARCHAR(15) NULL COMMENT 'opduser.doctorcode',
    group_name     VARCHAR(250) NULL COMMENT 'opduser.groupname',
    department     VARCHAR(250) NULL,
    position_name  VARCHAR(250) NULL COMMENT 'ตำแหน่งจาก HOSxP (ซิงก์ทับทุกครั้ง)',
    position_custom VARCHAR(250) NULL COMMENT 'ตำแหน่งที่แอดมินกำหนดเอง (ซิงก์ไม่ทับ)',
    license_no     VARCHAR(50) NULL COMMENT 'doctor.licenseno',
    hos_disabled   TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'opduser.account_disable = Y',
    hos_doctor_active TINYINT(1) NULL COMMENT 'doctor.active',
    hos_missing    TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'ไม่พบใน HOSxP แล้วในการซิงก์ล่าสุด',
    source         ENUM('hosxp','local') NOT NULL DEFAULT 'hosxp' COMMENT 'hosxp = ซิงก์มา, local = สมาชิกที่เพิ่มเอง (ไม่มีใน HOSxP)',
    pw_salt        VARCHAR(64) NULL COMMENT 'เฉพาะสมาชิก local',
    pw_hash        VARCHAR(256) NULL COMMENT 'scrypt hash เฉพาะสมาชิก local',
    pw_changed_at  DATETIME NULL,
    role           ENUM('Admin','Doctor','Staff') NOT NULL DEFAULT 'Staff' COMMENT 'ระดับสิทธิ์: Admin ทำได้ทุกอย่าง, Doctor เพิ่ม/แก้ไข, Staff ดูอย่างเดียว',
    is_enabled     TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'อนุญาตให้เข้าระบบพัสดุ',
    menus          TEXT NULL COMMENT 'JSON array ของเมนูที่เห็น',
    note           VARCHAR(255) NULL,
    last_login     DATETIME NULL,
    synced_at      DATETIME NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by     VARCHAR(100) NULL,
    PRIMARY KEY (login_name),
    KEY idx_enabled (is_enabled),
    KEY idx_group (group_name(100)),
    KEY idx_doctor (doctor_code)
  ) ${TABLE_OPTS} COMMENT='ผู้ใช้งานระบบ (ซิงก์จาก HOSxP opduser)'`,

  // เทมเพลตสิทธิ์ต่อกลุ่มผู้ใช้ HOSxP (opduser.groupname): ระดับสิทธิ์ + เมนูที่เห็น
  `CREATE TABLE IF NOT EXISTS group_templates (
    group_name VARCHAR(250) NOT NULL COMMENT 'opduser.groupname',
    role       ENUM('Admin','Doctor','Staff') NOT NULL DEFAULT 'Staff',
    menus      TEXT NULL COMMENT 'JSON array ของเมนูที่เห็น',
    auto_apply TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'ผู้ใช้ใหม่ในกลุ่มนี้ที่ซิงก์เข้ามา ได้สิทธิ์ตามเทมเพลตอัตโนมัติ',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(100) NULL,
    PRIMARY KEY (group_name)
  ) ${TABLE_OPTS} COMMENT='เทมเพลตสิทธิ์ตามกลุ่มผู้ใช้'`,

  // บันทึกการใช้งาน (audit log): ใครทำอะไรเมื่อไหร่ ค่าก่อน/หลัง ไม่มี API แก้ไขหรือลบ
  `CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    actor       VARCHAR(100) NOT NULL COMMENT 'ชื่อผู้ใช้ผู้ทำรายการ',
    actor_name  VARCHAR(250) NULL,
    action      VARCHAR(30) NOT NULL COMMENT 'create/update/delete/login/login_failed/logout/permission/template/sync',
    resource    VARCHAR(30) NOT NULL COMMENT 'orders/contracts/incoming/guarantees/progress/notes/users/auth',
    record_id   VARCHAR(100) NULL,
    summary     VARCHAR(500) NOT NULL,
    before_json MEDIUMTEXT NULL,
    after_json  MEDIUMTEXT NULL,
    ip          VARCHAR(64) NULL,
    PRIMARY KEY (id),
    KEY idx_at (at),
    KEY idx_record (resource, record_id, id),
    KEY idx_actor (actor, id),
    KEY idx_action (action, id)
  ) ${TABLE_OPTS} COMMENT='บันทึกการใช้งานระบบ (audit log)'`,

  // ตำแหน่งที่ผู้ใช้อ่านการแจ้งเตือนถึงไหนแล้ว
  `CREATE TABLE IF NOT EXISTS notification_state (
    login_name   VARCHAR(100) NOT NULL,
    last_seen_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (login_name)
  ) ${TABLE_OPTS} COMMENT='ตำแหน่งการอ่านแจ้งเตือนของแต่ละผู้ใช้'`,

  // ตั้งค่าระบบ (เวลาล็อกหน้าจอ, ผู้ให้บริการ ThaID/ProviderID) เก็บเป็น JSON ต่อหนึ่งหัวข้อ; ความลับถูกเข้ารหัสก่อนเก็บ
  `CREATE TABLE IF NOT EXISTS app_settings (
    skey       VARCHAR(50) NOT NULL,
    svalue     MEDIUMTEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(100) NULL,
    PRIMARY KEY (skey)
  ) ${TABLE_OPTS} COMMENT='ตั้งค่าระบบ'`,

  // PIN ล็อกหน้าจอและ Google Authenticator (TOTP) ของแต่ละผู้ใช้ (รวมบัญชีในตัว) เก็บเฉพาะค่าแฮช/ค่าที่เข้ารหัส
  `CREATE TABLE IF NOT EXISTS user_security (
    username      VARCHAR(100) NOT NULL,
    pin_hash      VARCHAR(200) NULL COMMENT 'scrypt salt:hash',
    pin_set_at    DATETIME NULL,
    totp_secret   VARCHAR(300) NULL COMMENT 'เข้ารหัส AES-GCM',
    totp_enabled  TINYINT(1) NOT NULL DEFAULT 0,
    totp_last_step BIGINT NULL COMMENT 'กันใช้รหัสซ้ำ',
    backup_codes  TEXT NULL COMMENT 'JSON ของค่าแฮชรหัสกู้คืนที่ยังไม่ได้ใช้',
    trust_epoch   INT NOT NULL DEFAULT 0 COMMENT 'เพิ่มค่าเพื่อล้างอุปกรณ์ที่จำไว้ทั้งหมด',
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (username)
  ) ${TABLE_OPTS} COMMENT='PIN และ 2FA ของผู้ใช้'`,

  // โปรไฟล์ผู้ใช้: รูปภาพ (ย่อเหลือ 256px) เก็บเป็นไบนารีในฐานข้อมูล
  `CREATE TABLE IF NOT EXISTS user_profiles (
    username   VARCHAR(100) NOT NULL,
    avatar     MEDIUMBLOB NULL COMMENT 'รูปโปรไฟล์ JPEG/PNG/WebP',
    avatar_mime VARCHAR(30) NULL,
    avatar_bytes INT UNSIGNED NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100) NULL,
    PRIMARY KEY (username)
  ) ${TABLE_OPTS} COMMENT='โปรไฟล์ผู้ใช้ (รูปภาพ)'`,

  `CREATE TABLE IF NOT EXISTS hos_doctor (
    code         VARCHAR(15) NOT NULL COMMENT 'doctor.code',
    name         VARCHAR(150) NULL,
    license_no   VARCHAR(50) NULL,
    department   VARCHAR(250) NULL,
    job_position VARCHAR(50) NULL,
    active       TINYINT(1) NULL,
    synced_at    DATETIME NULL,
    PRIMARY KEY (code),
    KEY idx_name (name(100))
  ) ${TABLE_OPTS} COMMENT='แพทย์/บุคลากร (ซิงก์จาก HOSxP doctor)'`,

  `CREATE TABLE IF NOT EXISTS user_sync_log (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    started_at    DATETIME NOT NULL,
    finished_at   DATETIME NULL,
    run_by        VARCHAR(100) NULL,
    status        ENUM('running','ok','error') NOT NULL DEFAULT 'running',
    users_fetched INT NULL,
    users_added   INT NULL,
    users_missing INT NULL,
    doctors_fetched INT NULL,
    message       VARCHAR(500) NULL,
    PRIMARY KEY (id),
    KEY idx_started (started_at)
  ) ${TABLE_OPTS} COMMENT='ประวัติการซิงก์ผู้ใช้จาก HOSxP'`,
];

export const PROGRESS_STEPS = [
  'ตั้งเรื่อง', 'ขออนุมัติแผนจัดซื้อจัดจ้าง', 'แต่งตั้งคกก.จัดทำสเปคและราคากลาง', 'ประชุมคกก.จัดทำสเปคและราคากลาง',
  'อนุมัติสเปคและราคากลาง', 'รายงานขอซื้อขอจ้าง', 'เผยแพร่ร่างประกาศและร่างเอกสาร', 'มีวิจารณ์ร่างประกาศฯ',
  'ลงนามใบประกาศเชิญชวน', 'ประกาศเชิญชวน', 'ติดต่อผู้ขายเสนอราคา', 'ประชุมพิจารณาผล', 'อนุมัติจัดซื้อจัดจ้างฯ',
  'จัดทำสัญญา/ใบสั่ง', 'PO', 'ตรวจรับ', 'ส่งเบิก',
];

/** Default dropdown values. Staff/group/fund come from sheet "x"; method/status/unit from the data and report sheets. */
export const DEFAULT_LOOKUPS: Record<string, string[]> = {
  staff: ['วันวิสา', 'พิชญ์ศุภร', 'สุภาณี', 'ดวงพร', 'นาตยา', 'รมณภัทร', 'อลิสา'],
  group: [
    'กลุ่มบริหารทั่วไป', 'กลุ่มโรคติดต่อที่ป้องกันได้ด้วยวัคซีน', 'กลุ่มยุทธศาสตร์และแผนงาน',
    'กลุ่มโรคติดต่อระบบทางเดินหายใจและโรคติดต่ออุบัติใหม่', 'กลุ่มโรคติดต่อทางอาหารและน้ำ และโรคหนอนพยาธิ',
    'กลุ่มบริหารเวชภัณฑ์ และโลจิสติกส์', 'กลุ่มพัฒนาองค์กร วิจัย และนวัตกรรม',
  ],
  fund: [
    'พ.ร.บ. งบประมาณรายจ่าย', 'เงินบำรุง', 'อื่น ๆ', 'เงินโครงการ Flu-PIP', 'เงิน WHO', 'เงินงบประมาณเบิกแทนกัน',
    'เงินโขง - ล้านช้าง', 'เงินเบิกแทนกัน',
  ],
  method: ['e-bidding', 'วิธีเฉพาะเจาะจง', 'วิธีประกาศเชิญชวนทั่วไป', 'วิธีคัดเลือก', 'วิธีประกวดแบบ', 'อื่น ๆ'],
  status: [
    'ยังไม่ดำเนินการ', 'อยู่ระหว่างกระบวนการจัดซื้อจัดจ้าง', 'ลงนามในสัญญา', 'อยู่ระหว่างการดำเนินการและตรวจรับ',
    'อยู่ระหว่างบริหารสัญญา', 'สิ้นสุดสัญญา', 'ยกเลิกโครงการ', 'ตรวจรับแล้ว', 'ส่งเบิกจ่ายแล้ว', 'ยกเลิก',
  ],
  unit: ['งาน', 'ราย', 'เครื่อง', 'รายการ', 'โดส', 'ชุด'],
};
