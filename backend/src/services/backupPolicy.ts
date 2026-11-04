import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from './mysql';
import { DEFAULT_BACKUP_DIR, deleteBackups, listBackups, runBackup } from './backup';
import { writeAudit } from './audit';

/**
 * Backup schedule and clean-up rules (Settings → Backup), kept in app_settings.
 * In production the server itself makes the daily backup at the chosen time and then removes
 * files that are too old or beyond the count limit, so the disk does not fill up.
 */

export interface BackupPolicy {
  /** Make a backup every day at `time` */
  autoBackup: boolean;
  /** HH:MM, Thailand time */
  time: string;
  /** Delete files older than this many days (0 = never by age) */
  keepDays: number;
  /** Always keep at most this many files (the newest) */
  keepCount: number;
}

export const DEFAULT_POLICY: BackupPolicy = { autoBackup: true, time: '02:00', keepDays: 30, keepCount: 30 };

const KEY = 'backup';
const SYSTEM = { username: 'system', name: 'ระบบ (อัตโนมัติ)' };

export async function getBackupPolicy(): Promise<BackupPolicy> {
  const [rows] = await getPool().query<RowDataPacket[]>('SELECT svalue FROM app_settings WHERE skey = ?', [KEY]);
  if (!rows[0]) return { ...DEFAULT_POLICY };
  try {
    return { ...DEFAULT_POLICY, ...(JSON.parse(rows[0].svalue) as Partial<BackupPolicy>) };
  } catch {
    return { ...DEFAULT_POLICY };
  }
}

/** Validates and stores the policy; returns an error message for bad input */
export async function saveBackupPolicy(input: Partial<BackupPolicy>, by: string): Promise<BackupPolicy | string> {
  const next: BackupPolicy = { ...(await getBackupPolicy()), ...input };
  if (typeof next.autoBackup !== 'boolean') return 'ค่าการสำรองอัตโนมัติไม่ถูกต้อง';
  if (typeof next.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(next.time)) return 'เวลาต้องอยู่ในรูปแบบ ชม:นาที เช่น 02:00';
  if (!Number.isInteger(next.keepDays) || next.keepDays < 0 || next.keepDays > 3650) return 'จำนวนวันที่เก็บต้องเป็น 0–3650';
  if (!Number.isInteger(next.keepCount) || next.keepCount < 1 || next.keepCount > 1000) return 'จำนวนไฟล์ที่เก็บต้องเป็น 1–1000';
  await getPool().query(
    'INSERT INTO app_settings (skey, svalue, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE svalue = VALUES(svalue), updated_by = VALUES(updated_by)',
    [KEY, JSON.stringify(next), by]
  );
  return next;
}

/** Files the policy says should go: beyond the newest keepCount, or older than keepDays. The newest file is never removed. */
export function filesToPrune(policy: BackupPolicy, now = Date.now()): string[] {
  const files = listBackups(DEFAULT_BACKUP_DIR);
  const cutoff = policy.keepDays > 0 ? now - policy.keepDays * 86_400_000 : -Infinity;
  return files.filter((f, i) => i > 0 && (i >= policy.keepCount || new Date(f.at).getTime() < cutoff)).map((f) => f.name);
}

export async function pruneBackups(policy: BackupPolicy): Promise<string[]> {
  const removed = deleteBackups(filesToPrune(policy));
  if (removed.length > 0) {
    await writeAudit(SYSTEM, 'server', {
      action: 'delete',
      resource: 'backup',
      recordId: null,
      summary: `ลบไฟล์สำรองอัตโนมัติตามนโยบาย ${removed.length} ไฟล์ (เก็บไม่เกิน ${policy.keepCount} ไฟล์${policy.keepDays ? ` / ${policy.keepDays} วัน` : ''})`,
      before: removed,
    });
  }
  return removed;
}

let running = false;
/** One backup at a time, whether started by a person or by the schedule */
export async function backupOnce<T>(fn: () => Promise<T>): Promise<T | null> {
  if (running) return null;
  running = true;
  try {
    return await fn();
  } finally {
    running = false;
  }
}

let lastAutoDay = '';
export let lastAutoRun: { at: string; ok: boolean; message: string } | null = null;

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
const nowHm = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());

async function tick(): Promise<void> {
  let policy: BackupPolicy;
  try {
    policy = await getBackupPolicy();
  } catch {
    return; // database unreachable: try again next minute
  }
  if (!policy.autoBackup || nowHm() !== policy.time || lastAutoDay === today()) return;
  lastAutoDay = today();
  const result = await backupOnce(async () => {
    const r = await runBackup();
    const removed = await pruneBackups(policy);
    await writeAudit(SYSTEM, 'server', {
      action: 'security', resource: 'backup', recordId: 'auto',
      summary: `สำรองข้อมูลอัตโนมัติ (${r.tables} ตาราง ${r.rows} แถว)${removed.length ? ` · ลบไฟล์เก่า ${removed.length} ไฟล์` : ''}`,
    });
    return r;
  }).catch((e: Error) => {
    lastAutoRun = { at: new Date().toISOString(), ok: false, message: e.message };
    console.error('[backup] auto backup failed:', e.message);
    return undefined;
  });
  if (result) lastAutoRun = { at: new Date().toISOString(), ok: true, message: `${result.tables} ตาราง ${result.rows} แถว` };
}

/** Production only: the dev machine must not make its own copies of the shared database */
export function startBackupScheduler(): void {
  setInterval(() => void tick(), 60_000).unref();
  // Apply the clean-up rules once at start-up too (e.g. after the limits were lowered)
  void getBackupPolicy().then(pruneBackups).catch(() => undefined);
}
