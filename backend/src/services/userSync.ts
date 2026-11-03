/**
 * Copies HOSxP users (opduser joined with doctor) and the doctor list into this system's database.
 * Identity fields are overwritten on every sync; access settings (role, enabled, menus, note) never are,
 * so re-syncing cannot grant or remove anyone's access.
 */
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool } from './mysql';
import { fetchHosDoctors, fetchHosUsers } from './hosxp';

export interface SyncResult {
  usersFetched: number;
  usersAdded: number;
  usersMissing: number;
  doctorsFetched: number;
  /** New people who got access straight away because their group's template has auto-apply on */
  autoGranted: number;
}

let running = false;

const CHUNK = 200;

export async function syncFromHos(runBy: string): Promise<SyncResult> {
  if (running) throw new Error('กำลังซิงก์อยู่ กรุณารอสักครู่');
  running = true;
  const pool = getPool();
  const [log] = await pool.query<ResultSetHeader>(
    "INSERT INTO user_sync_log (started_at, run_by, status) VALUES (NOW(), ?, 'running')", [runBy]);
  try {
    // Read everything first: if HOSxP is unreachable nothing here is touched
    const [users, doctors] = await Promise.all([fetchHosUsers(), fetchHosDoctors()]);

    const [before] = await pool.query<RowDataPacket[]>('SELECT login_name, source FROM app_users');
    const known = new Set(before.map((r) => String(r.login_name).toLowerCase()));
    // Members added by hand are never touched by a sync, even if HOSxP later has the same login name
    const local = new Set(before.filter((r) => r.source === 'local').map((r) => String(r.login_name).toLowerCase()));
    const seen = new Set<string>();
    const unique = users.filter((u) => {
      const k = u.loginName.toLowerCase();
      if (seen.has(k) || local.has(k)) return false;
      seen.add(k);
      return true;
    });
    const added = unique.filter((u) => !known.has(u.loginName.toLowerCase())).length;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [nowRows] = await conn.query<RowDataPacket[]>('SELECT NOW() AS now');
      const now = nowRows[0].now as Date;
      for (let i = 0; i < unique.length; i += CHUNK) {
        const rows = unique.slice(i, i + CHUNK).map((u) => [
          u.loginName, u.displayName, u.doctorCode, u.groupName, u.department, u.positionName, u.licenseNo,
          u.disabled ? 1 : 0, u.doctorActive === null ? null : u.doctorActive ? 1 : 0, 0, now,
        ]);
        await conn.query(
          `INSERT INTO app_users (login_name, display_name, doctor_code, group_name, department, position_name, license_no,
                                  hos_disabled, hos_doctor_active, hos_missing, synced_at)
           VALUES ?
           ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), doctor_code = VALUES(doctor_code),
             group_name = VALUES(group_name), department = VALUES(department), position_name = VALUES(position_name),
             license_no = VALUES(license_no), hos_disabled = VALUES(hos_disabled),
             hos_doctor_active = VALUES(hos_doctor_active), hos_missing = 0, synced_at = VALUES(synced_at)`,
          [rows]
        );
      }
      // Anyone not seen this time was removed from HOSxP: flag them (sign-in is refused), never delete
      const [missing] = await conn.query<ResultSetHeader>(
        "UPDATE app_users SET hos_missing = 1 WHERE source = 'hosxp' AND (synced_at IS NULL OR synced_at < ?)", [now]);

      for (let i = 0; i < doctors.length; i += CHUNK) {
        const rows = doctors.slice(i, i + CHUNK).map((d) => [
          d.code, d.name, d.licenseNo, d.department, d.jobPosition, d.active === null ? null : d.active ? 1 : 0, now,
        ]);
        await conn.query(
          `INSERT INTO hos_doctor (code, name, license_no, department, job_position, active, synced_at)
           VALUES ?
           ON DUPLICATE KEY UPDATE name = VALUES(name), license_no = VALUES(license_no), department = VALUES(department),
             job_position = VALUES(job_position), active = VALUES(active), synced_at = VALUES(synced_at)`,
          [rows]
        );
      }
      await conn.commit();

      // Groups whose template says "auto-apply": people seen for the first time get that role and menus (never anyone already known)
      let autoGranted = 0;
      const newLogins = unique.filter((u) => !known.has(u.loginName.toLowerCase())).map((u) => u.loginName);
      if (newLogins.length > 0) {
        const [granted] = await pool.query<ResultSetHeader>(
          `UPDATE app_users u JOIN group_templates t ON t.group_name = u.group_name AND t.auto_apply = 1
              SET u.role = t.role, u.menus = t.menus, u.is_enabled = 1, u.updated_by = 'auto-template'
            WHERE u.login_name IN (?) AND u.hos_disabled = 0`,
          [newLogins]
        );
        autoGranted = granted.affectedRows;
      }

      const result: SyncResult = {
        usersFetched: unique.length, usersAdded: added, usersMissing: missing.affectedRows, doctorsFetched: doctors.length, autoGranted,
      };
      await pool.query(
        "UPDATE user_sync_log SET finished_at = NOW(), status = 'ok', users_fetched = ?, users_added = ?, users_missing = ?, doctors_fetched = ? WHERE id = ?",
        [result.usersFetched, result.usersAdded, result.usersMissing, result.doctorsFetched, log.insertId]
      );
      return result;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 480);
    await pool.query("UPDATE user_sync_log SET finished_at = NOW(), status = 'error', message = ? WHERE id = ?", [message, log.insertId]).catch(() => {});
    throw e;
  } finally {
    running = false;
  }
}
