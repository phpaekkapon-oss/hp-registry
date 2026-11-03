/**
 * Create the procurement database and tables (safe to run repeatedly).
 *   npm run db:init -w backend
 */
import 'dotenv/config';
import { mysql, dbConfig, connect } from '../src/services/mysql';
import { SCHEMA_STATEMENTS, PROGRESS_STEPS, DEFAULT_LOOKUPS } from '../src/services/procureSchema';

const dbName = process.env.DB_NAME || 'dw_hp_procure';
if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error(`Invalid DB_NAME: ${dbName}`);

const admin = await connect(false);
await admin.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
await admin.end();
console.log(`[db] database ${dbName} ready`);

const conn = await connect(true);
for (const sql of SCHEMA_STATEMENTS) {
  const table = /CREATE TABLE IF NOT EXISTS (\w+)/.exec(sql)?.[1];
  await conn.query(sql);
  console.log(`[db] table ${table} ready`);
}

// Columns added after a table was first created (CREATE TABLE IF NOT EXISTS does not add them)
const [hasCustom] = (await conn.query(
  "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_users' AND COLUMN_NAME = 'position_custom'"
)) as [{ n: number }[], unknown];
if (hasCustom[0].n === 0) {
  await conn.query("ALTER TABLE app_users ADD COLUMN position_custom VARCHAR(250) NULL COMMENT 'ตำแหน่งที่แอดมินกำหนดเอง (ซิงก์ไม่ทับ)' AFTER position_name");
  console.log('[db] app_users.position_custom added');
}

// Members added by hand (not in HOSxP) sign in with their own hashed password
{
  const [has] = (await conn.query(
    "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_users' AND COLUMN_NAME = 'source'"
  )) as [{ n: number }[], unknown];
  if (has[0].n === 0) {
    await conn.query(`ALTER TABLE app_users
      ADD COLUMN source ENUM('hosxp','local') NOT NULL DEFAULT 'hosxp' COMMENT 'hosxp = ซิงก์มา, local = สมาชิกที่เพิ่มเอง (ไม่มีใน HOSxP)' AFTER hos_missing,
      ADD COLUMN pw_salt VARCHAR(64) NULL COMMENT 'เฉพาะสมาชิก local' AFTER source,
      ADD COLUMN pw_hash VARCHAR(256) NULL COMMENT 'scrypt hash เฉพาะสมาชิก local' AFTER pw_salt,
      ADD COLUMN pw_changed_at DATETIME NULL AFTER pw_hash`);
    console.log('[db] app_users.source / pw_* added');
  }
}

// 2FA recovery codes and "remember this device"
{
  const [has] = (await conn.query(
    "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_security' AND COLUMN_NAME = 'backup_codes'"
  )) as [{ n: number }[], unknown];
  if (has[0].n === 0) {
    await conn.query('ALTER TABLE user_security ADD COLUMN backup_codes TEXT NULL, ADD COLUMN trust_epoch INT NOT NULL DEFAULT 0');
    console.log('[db] user_security.backup_codes / trust_epoch added');
  }
}

// Photos moved from user_security to their own table user_profiles
{
  const [old] = (await conn.query(
    "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_security' AND COLUMN_NAME = 'avatar'"
  )) as [{ n: number }[], unknown];
  if (old[0].n > 0) {
    await conn.query(
      'INSERT IGNORE INTO user_profiles (username, avatar, avatar_mime, avatar_bytes, updated_at) SELECT username, avatar, avatar_mime, LENGTH(avatar), COALESCE(avatar_at, NOW()) FROM user_security WHERE avatar IS NOT NULL');
    await conn.query('ALTER TABLE user_security DROP COLUMN avatar, DROP COLUMN avatar_mime, DROP COLUMN avatar_at');
    console.log('[db] photos moved to user_profiles');
  }
}

// Links between registers: a letter / guarantee / progress project belongs to an order or contract
for (const table of ['incoming_docs', 'contract_guarantees', 'progress_projects']) {
  const [has] = (await conn.query(
    "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'link_resource'", [table]
  )) as [{ n: number }[], unknown];
  if (has[0].n === 0) {
    const role = table === 'incoming_docs'
      ? ", ADD COLUMN link_role ENUM('origin','invoice','other') NULL COMMENT 'origin = ต้นเรื่อง, invoice = ใบแจ้งหนี้/ใบส่งของ, other = อื่น ๆ'"
      : '';
    await conn.query(`ALTER TABLE ${table}
      ADD COLUMN link_resource ENUM('orders','contracts') NULL COMMENT 'ใบสั่ง/สัญญาที่เกี่ยวข้อง',
      ADD COLUMN link_id INT UNSIGNED NULL${role},
      ADD KEY idx_link (link_resource, link_id)`);
    console.log(`[db] ${table}.link_* added`);
  }
}
// An earlier version stored "the letter this order came from" on the order: move it to the letter, then drop it
for (const [table, resource] of [['purchase_orders', 'orders'], ['contracts', 'contracts']]) {
  const [has] = (await conn.query(
    "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'incoming_id'", [table]
  )) as [{ n: number }[], unknown];
  if (has[0].n > 0) {
    await conn.query(`UPDATE incoming_docs i JOIN ${table} t ON t.incoming_id = i.id SET i.link_resource = ?, i.link_id = t.id, i.link_role = 'origin'`, [resource]);
    await conn.query(`ALTER TABLE ${table} DROP KEY idx_incoming, DROP COLUMN incoming_id`);
    console.log(`[db] ${table}.incoming_id moved to incoming_docs.link_*`);
  }
}

// Recycle bin: deleting only stamps these columns (rows are purged for good after 30 days)
for (const table of ['purchase_orders', 'contracts', 'incoming_docs', 'contract_guarantees', 'progress_projects']) {
  const [has] = (await conn.query(
    "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'deleted_at'", [table]
  )) as [{ n: number }[], unknown];
  if (has[0].n === 0) {
    await conn.query(`ALTER TABLE ${table} ADD COLUMN deleted_at DATETIME NULL, ADD COLUMN deleted_by VARCHAR(50) NULL, ADD KEY idx_deleted (deleted_at)`);
    console.log(`[db] ${table}.deleted_at added`);
  }
}

for (const [i, name] of PROGRESS_STEPS.entries()) {
  await conn.query('INSERT INTO progress_steps_ref (step_no, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)', [i + 1, name]);
}
for (const [kind, values] of Object.entries(DEFAULT_LOOKUPS)) {
  for (const [i, value] of values.entries()) {
    await conn.query('INSERT INTO ref_lookup (kind, value, sort_order) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order)', [kind, value, i + 1]);
  }
}
console.log('[db] reference data seeded');
await conn.end();
