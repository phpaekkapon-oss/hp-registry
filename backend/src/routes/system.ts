import { Router, Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { requireAuth, requireMenu, requirePermission } from '../services/auth';
import { getPool } from '../services/mysql';
import { hosStatus } from '../services/hosxp';
import { listBackups, runBackup } from '../services/backup';
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

systemRouter.get('/backups', ...adminOnly, (_req: Request, res: Response) => {
  res.json({ success: true, data: listBackups() });
});

let backingUp = false;
systemRouter.post('/backups/run', ...adminOnly, async (req: Request, res: Response) => {
  if (backingUp) return res.status(409).json({ success: false, message: 'กำลังสำรองข้อมูลอยู่ กรุณารอสักครู่' });
  backingUp = true;
  try {
    const r = await runBackup();
    await writeAudit({ username: req.auth!.user.username, name: req.auth!.user.displayName }, clientIp(req), {
      action: 'security', resource: 'auth', recordId: 'backup', summary: `สำรองข้อมูลด้วยตนเอง (${r.tables} ตาราง ${r.rows} แถว)`,
    });
    res.json({ success: true, data: { ...r, file: r.file.split(/[\/]/).pop(), backups: listBackups() } });
  } catch (e) {
    console.error('[backup]', e);
    res.status(500).json({ success: false, message: 'สำรองข้อมูลไม่สำเร็จ' });
  } finally {
    backingUp = false;
  }
});
