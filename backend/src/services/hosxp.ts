/**
 * Read-only access to the hospital's HOSxP database (tables opduser and doctor).
 *
 * Only the columns needed for user management are ever selected. HOSxP's password columns
 * (password, passweb, password_text, nhso_password, moph_acc_password, ...) are never copied:
 * the one that is read, `passweb`, is only compared at sign-in and then discarded.
 */
import crypto from 'crypto';
import mysql from 'mysql2/promise';
import type { Pool, RowDataPacket } from 'mysql2/promise';

let pool: Pool | null = null;

export function hosConfigured(): boolean {
  return Boolean(process.env.HOS_DB_HOST && process.env.HOS_DB_USER && process.env.HOS_DB_PASSWORD !== undefined);
}

function getHosPool(): Pool {
  if (!hosConfigured()) throw new HosError('ยังไม่ได้ตั้งค่าการเชื่อมต่อ HOSxP (HOS_DB_* ใน backend/.env)');
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.HOS_DB_HOST,
      port: process.env.HOS_DB_PORT ? parseInt(process.env.HOS_DB_PORT, 10) : 3306,
      user: process.env.HOS_DB_USER,
      password: process.env.HOS_DB_PASSWORD,
      database: process.env.HOS_DB_NAME || 'hos',
      charset: 'utf8mb4',
      connectTimeout: 8_000,
      connectionLimit: 3,
      waitForConnections: true,
    });
    pool.on('connection', (conn) => {
      conn.query('SET NAMES utf8mb4');
      // Belt and braces: this app never writes to HOSxP
      conn.query('SET SESSION TRANSACTION READ ONLY');
    });
  }
  return pool;
}

export class HosError extends Error {}

export interface HosUser {
  loginName: string;
  displayName: string | null;
  doctorCode: string | null;
  groupName: string | null;
  department: string | null;
  positionName: string | null;
  licenseNo: string | null;
  disabled: boolean;
  doctorActive: boolean | null;
}

export interface HosDoctor {
  code: string;
  name: string | null;
  licenseNo: string | null;
  department: string | null;
  jobPosition: string | null;
  active: boolean | null;
}

const clean = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const flag = (v: unknown): boolean | null => (v === 'Y' ? true : v === 'N' ? false : null);

export async function fetchHosUsers(): Promise<HosUser[]> {
  const [rows] = await getHosPool().query<RowDataPacket[]>(
    `SELECT u.loginname, u.name, u.doctorcode, u.groupname, u.department, u.departmentposition, u.account_disable,
            d.name AS doctor_name, d.licenseno, d.jobposition, d.provider_id_position, dp.name AS position_std,
            u.entryposition, d.active AS doctor_active
       FROM opduser u
       LEFT JOIN doctor d ON d.code = u.doctorcode
       LEFT JOIN doctor_position dp ON dp.id = d.position_id`
  );
  return rows
    .filter((r) => clean(r.loginname))
    .map((r) => ({
      loginName: String(r.loginname).trim(),
      displayName: clean(r.name) ?? clean(r.doctor_name),
      doctorCode: clean(r.doctorcode),
      groupName: clean(r.groupname),
      department: clean(r.department),
      // Job title: what was typed on the user (entryposition), else HOSxP's standard position list, else the doctor record
      positionName:
        clean(r.entryposition) ?? clean(r.position_std) ?? clean(r.provider_id_position) ?? clean(r.jobposition) ?? clean(r.departmentposition),
      licenseNo: clean(r.licenseno),
      disabled: r.account_disable === 'Y',
      doctorActive: flag(r.doctor_active),
    }));
}

export async function fetchHosDoctors(): Promise<HosDoctor[]> {
  const [rows] = await getHosPool().query<RowDataPacket[]>(
    'SELECT code, name, licenseno, department, jobposition, active FROM doctor'
  );
  return rows
    .filter((r) => clean(r.code))
    .map((r) => ({
      code: String(r.code).trim(),
      name: clean(r.name),
      licenseNo: clean(r.licenseno),
      department: clean(r.department),
      jobPosition: clean(r.jobposition),
      active: flag(r.active),
    }));
}

export type HosPasswordResult = 'ok' | 'bad' | 'disabled';

const md5 = (s: string) => crypto.createHash('md5').update(s, 'utf8').digest('hex');

/** HOSxP stores the web password as an MD5 hex digest in opduser.passweb */
export async function verifyHosPassword(loginName: string, password: string): Promise<HosPasswordResult> {
  const [rows] = await getHosPool().query<RowDataPacket[]>(
    'SELECT passweb, account_disable FROM opduser WHERE loginname = ? LIMIT 1',
    [loginName]
  );
  const stored = Buffer.from(String(rows[0]?.passweb ?? '').toLowerCase());
  const given = Buffer.from(md5(password));
  const same = stored.length === given.length && crypto.timingSafeEqual(stored, given);
  if (!rows[0] || !same) return 'bad';
  return rows[0].account_disable === 'Y' ? 'disabled' : 'ok';
}

export interface HosStatus {
  configured: boolean;
  ok: boolean;
  host: string | null;
  database: string | null;
  user: string | null;
  latencyMs: number | null;
  error: string | null;
  /** The account can change data in HOSxP (this app only needs SELECT) */
  canWrite: boolean | null;
  grants: string[];
}

/** One short-lived connection to report on the HOSxP link and what the configured account may do */
export async function hosStatus(): Promise<HosStatus> {
  const base: HosStatus = {
    configured: hosConfigured(), ok: false, host: process.env.HOS_DB_HOST ?? null, database: process.env.HOS_DB_NAME || 'hos',
    user: process.env.HOS_DB_USER ?? null, latencyMs: null, error: null, canWrite: null, grants: [],
  };
  if (!base.configured) return { ...base, error: 'ยังไม่ได้ตั้งค่า HOS_DB_* ใน backend/.env' };
  const started = Date.now();
  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection({
      host: process.env.HOS_DB_HOST, port: process.env.HOS_DB_PORT ? parseInt(process.env.HOS_DB_PORT, 10) : 3306,
      user: process.env.HOS_DB_USER, password: process.env.HOS_DB_PASSWORD, database: base.database ?? undefined, connectTimeout: 6_000,
    });
    await conn.query('SELECT 1');
    base.latencyMs = Date.now() - started;
    base.ok = true;
    try {
      const [rows] = await conn.query<RowDataPacket[]>('SHOW GRANTS FOR CURRENT_USER()');
      base.grants = rows.map((r) => String(Object.values(r)[0]).replace(/IDENTIFIED BY .*/i, '').trim());
      base.canWrite = base.grants.some((g) => /\b(ALL PRIVILEGES|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT OPTION)\b/i.test(g.replace(/^GRANT\s+/i, '').split(' ON ')[0]));
    } catch {
      base.canWrite = null;
    }
  } catch (e) {
    base.error = (e as { code?: string }).code ?? (e as Error).message;
  } finally {
    await conn?.end().catch(() => undefined);
  }
  return base;
}
