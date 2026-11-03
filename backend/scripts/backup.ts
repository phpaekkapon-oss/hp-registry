/**
 * Dump the procurement database to a compressed SQL file (schema + data), keep the newest 30.
 *   npm run backup -w backend            -> <project>/backups/dw_hp_procure-YYYYMMDD-HHmmss.sql.gz
 *   npm run backup -w backend -- <dir>   -> same, into another folder (e.g. a network share)
 * Restore: gunzip the file and run it with the mysql client against an empty database.
 */
import 'dotenv/config';
import path from 'path';
import { runBackup } from '../src/services/backup';

const r = await runBackup(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
console.log(`[backup] ${r.tables} tables, ${r.rows} rows -> ${r.file} (${(r.bytes / 1024).toFixed(1)} KB)${r.removed ? `; removed ${r.removed} old` : ''}`);
