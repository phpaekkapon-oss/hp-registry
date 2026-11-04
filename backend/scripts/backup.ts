/**
 * Dump the procurement database to a compressed SQL file (schema + data), keep the newest 30.
 *   npm run backup -w backend            -> <project>/backups/dw_hp_procure-YYYYMMDD-HHmmss.sql.gz
 *   npm run backup -w backend -- <dir>   -> same, into another folder (e.g. a network share)
 * Restore: gunzip the file and run it with the mysql client against an empty database.
 */
import 'dotenv/config';
import path from 'path';
import { runBackup } from '../src/services/backup';
import { getBackupPolicy, pruneBackups } from '../src/services/backupPolicy';
import { getPool } from '../src/services/mysql';

const r = await runBackup(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
// Clean-up rules from Settings → Backup apply to the default folder only (not to a copy made elsewhere)
const removed = process.argv[2] ? [] : await pruneBackups(await getBackupPolicy()).catch(() => [] as string[]);
console.log(`[backup] ${r.tables} tables, ${r.rows} rows -> ${r.file} (${(r.bytes / 1024).toFixed(1)} KB)${removed.length ? `; removed ${removed.length} old` : ''}`);
await getPool().end().catch(() => undefined);
