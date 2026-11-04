import { Router, Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { requireAuth, requireMenu, requirePermission } from '../services/auth';
import { getPool } from '../services/mysql';
import { hosStatus } from '../services/hosxp';
import path from 'path';
import { DEFAULT_BACKUP_DIR, backupPath, deleteBackups, listBackups, runBackup } from '../services/backup';
import { backupOnce, filesToPrune, getBackupPolicy, lastAutoRun, pruneBackups, saveBackupPolicy, type BackupPolicy } from '../services/backupPolicy';
import { writeAudit } from '../services/audit';
import { APP_VERSION, STARTED_AT } from '../services/version';
import { clientIp } from './auth';

/** System information for settings → connections / backup / about. Admin only (except the public-safe version info). */
export const systemRouter = Router();

const adminOnly = [requireAuth, requirePermission('manageUsers'), requireMenu('usermgmt')];

// Anyone signed in: version and uptime
systemRouter.get('/about', requireAuth, (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      version: APP_VERSION,
      startedAt: STARTED_AT,
      uptimeSeconds: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      node: process.version,
    },
  });
});

systemRouter.get('/status', ...adminOnly, async (_req: Request, res: Response) => {
  const started = Date.now();
  let procure: { ok: boolean; database: string; host: string | null; latencyMs: number | null; tables: number | null; error: string | null } = {
    ok: false, database: process.env.DB_NAME || 'dw_hp_procure', host: process.env.DB_HOST ?? null, latencyMs: null, tables: null, error: null,
  };
  try {
    const [rows] = await getPool().query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()');
    procure = { ...procure, ok: true, latencyMs: Date.now() - started, tables: Number(rows[0].n) };
  } catch (e) {
    procure.error = (e as { code?: string }).code ?? (e as Error).message;
  }
  const [hos, [sync]] = await Promise.all([
    hosStatus(),
    getPool().query<RowDataPacket[]>('SELECT started_at, finished_at, status, users_fetched, run_by FROM user_sync_log ORDER BY id DESC LIMIT 1').catch(() => [[]] as unknown as [RowDataPacket[]]),
  ]);
  res.json({
    success: true,
    data: {
      procure,
      hosxp: hos,
      lastSync: sync[0]
        ? { at: new Date(sync[0].finished_at ?? sync[0].started_at).toISOString(), status: sync[0].status as string, users: sync[0].users_fetched as number | null, by: sync[0].run_by as string | null }
        : null,
    },
  });
});

const backupOverview = async () => {
  const files = listBackups();
  const policy = await getBackupPolicy();
  return {
    files,
    dir: DEFAULT_BACKUP_DIR,
    totalBytes: files.reduce((s, f) => s + f.bytes, 0),
    policy,
    /** Files the current rules would remove at the next clean-up */
    pruneCandidates: filesToPrune(policy),
    schedulerActive: process.env.NODE_ENV === 'production',
    lastAutoRun,
  };
};

const actorOf = (req: Request) => ({ username: req.auth!.user.username, name: req.auth!.user.displayName });

systemRouter.get('/backups', ...adminOnly, async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await backupOverview() });
  } catch (e) {
    console.error('[backup]', e);
    res.status(500).json({ success: false, message: 'โหลดรายการสำรองข้อมูลไม่สำเร็จ' });
  }
});

systemRouter.post('/backups/run', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const r = await backupOnce(async () => {
      const made = await runBackup();
      const removed = await pruneBackups(await getBackupPolicy());
      return { ...made, removed: removed.length };
    });
    if (!r) return res.status(409).json({ success: false, message: 'กำลังสำรองข้อมูลอยู่ กรุณารอสักครู่' });
    await writeAudit(actorOf(req), clientIp(req), {
      action: 'security', resource: 'backup', recordId: 'manual', summary: `สำรองข้อมูลด้วยตนเอง (${r.tables} ตาราง ${r.rows} แถว)`,
    });
    res.json({ success: true, data: { tables: r.tables, rows: r.rows, bytes: r.bytes, removed: r.removed, file: path.basename(r.file), overview: await backupOverview() } });
  } catch (e) {
    console.error('[backup]', e);
    res.status(500).json({ success: false, message: 'สำรองข้อมูลไม่สำเร็จ' });
  }
});

systemRouter.put('/backups/policy', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const before = await getBackupPolicy();
    const saved = await saveBackupPolicy((req.body ?? {}) as Partial<BackupPolicy>, req.auth!.user.username);
    if (typeof saved === 'string') return res.status(400).json({ success: false, message: saved });
    await writeAudit(actorOf(req), clientIp(req), {
      action: 'update', resource: 'backup', recordId: 'policy',
      summary: `ตั้งค่าสำรองข้อมูล: ${saved.autoBackup ? `อัตโนมัติทุกวัน ${saved.time} น.` : 'ปิดการสำรองอัตโนมัติ'} · เก็บไม่เกิน ${saved.keepCount} ไฟล์${saved.keepDays ? ` / ${saved.keepDays} วัน` : ''}`,
      before, after: saved,
    });
    res.json({ success: true, data: await backupOverview() });
  } catch (e) {
    console.error('[backup]', e);
    res.status(500).json({ success: false, message: 'บันทึกการตั้งค่าไม่สำเร็จ' });
  }
});

// Delete several files at once (names must be exact backup file names)
systemRouter.post('/backups/delete', ...adminOnly, async (req: Request, res: Response) => {
  const names = (req.body as { names?: unknown } | undefined)?.names;
  if (!Array.isArray(names) || names.length === 0 || names.length > 1000 || !names.every((n) => typeof n === 'string')) {
    return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์ที่จะลบ' });
  }
  try {
    const all = listBackups();
    if (all.length > 0 && names.length >= all.length) {
      return res.status(400).json({ success: false, message: 'ต้องเหลือไฟล์สำรองไว้อย่างน้อย 1 ไฟล์' });
    }
    const removed = deleteBackups(names as string[]);
    if (removed.length > 0) {
      await writeAudit(actorOf(req), clientIp(req), {
        action: 'delete', resource: 'backup', recordId: null, summary: `ลบไฟล์สำรองข้อมูล ${removed.length} ไฟล์`, before: removed,
      });
    }
    res.json({ success: true, data: { removed: removed.length, overview: await backupOverview() } });
  } catch (e) {
    console.error('[backup]', e);
    res.status(500).json({ success: false, message: 'ลบไฟล์ไม่สำเร็จ' });
  }
});

// Download one file (real data: admin only, and every download is logged)
systemRouter.get('/backups/file/:name', ...adminOnly, async (req: Request, res: Response) => {
  const file = backupPath(String(req.params.name));
  if (!file) return res.status(404).json({ success: false, message: 'ไม่พบไฟล์' });
  await writeAudit(actorOf(req), clientIp(req), { action: 'security', resource: 'backup', recordId: path.basename(file), summary: `ดาวน์โหลดไฟล์สำรอง ${path.basename(file)}` });
  res.download(file, path.basename(file));
});
