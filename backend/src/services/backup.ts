import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { mysql, connect } from './mysql';

/** Compressed SQL dumps of the procurement database (schema + data); the newest KEEP files are kept. */

const KEEP = 30;
const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_BACKUP_DIR = path.resolve(here, '../../../backups');
const dbName = () => process.env.DB_NAME || 'dw_hp_procure';

const pad = (n: number) => String(n).padStart(2, '0');

export interface BackupFile {
  name: string;
  bytes: number;
  at: string;
}

export function listBackups(dir = DEFAULT_BACKUP_DIR): BackupFile[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${dbName()}-`) && f.endsWith('.sql.gz'))
    .map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, bytes: st.size, at: st.mtime.toISOString() };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

export async function runBackup(dir = DEFAULT_BACKUP_DIR): Promise<{ file: string; tables: number; rows: number; bytes: number; removed: number }> {
  fs.mkdirSync(dir, { recursive: true });
  const now = new Date();
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const file = path.join(dir, `${dbName()}-${stamp}.sql.gz`);

  const conn = await connect(true);
  try {
    const gz = zlib.createGzip();
    const out = fs.createWriteStream(file);
    gz.pipe(out);
    const write = (s: string) => {
      gz.write(s);
    };

    write(`-- ${dbName()} backup ${now.toISOString()}\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n`);
    const [tables] = (await conn.query('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"')) as [Record<string, string>[], unknown];
    let rowTotal = 0;
    for (const t of tables) {
      const table = Object.values(t)[0];
      const [[create]] = (await conn.query(`SHOW CREATE TABLE \`${table}\``)) as unknown as [[Record<string, string>]];
      write(`DROP TABLE IF EXISTS \`${table}\`;\n${create['Create Table']};\n\n`);
      const [rows] = (await conn.query(`SELECT * FROM \`${table}\``)) as [Record<string, unknown>[], unknown];
      rowTotal += rows.length;
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const cols = Object.keys(chunk[0]).map((c) => `\`${c}\``).join(', ');
        const values = chunk.map((r) => `(${Object.values(r).map((v) => mysql.escape(v as never)).join(', ')})`).join(',\n');
        write(`INSERT INTO \`${table}\` (${cols}) VALUES\n${values};\n`);
      }
      write('\n');
    }
    write('SET FOREIGN_KEY_CHECKS = 1;\n');
    await new Promise<void>((resolve, reject) => {
      out.on('finish', resolve);
      out.on('error', reject);
      gz.end();
    });

    const old = listBackups(dir).slice(KEEP);
    for (const f of old) fs.unlinkSync(path.join(dir, f.name));
    return { file, tables: tables.length, rows: rowTotal, bytes: fs.statSync(file).size, removed: old.length };
  } finally {
    await conn.end();
  }
}
