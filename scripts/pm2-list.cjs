#!/usr/bin/env node
/**
 * pm2-list.cjs - แสดงรายการโปรเซส pm2 ทั้งหมดบนเซิร์ฟเวอร์ (อ่านอย่างเดียว)
 * รวม pm2 หลักของผู้ใช้ (~/.pm2) และ pm2 แยกของ hp-registry (<โฟลเดอร์โปรแกรม>/.pm2)
 * ฝั่งเซิร์ฟเวอร์ส่งกลับเฉพาะ JSON (ASCII) แล้วจัดตารางภาษาไทยที่เครื่องนี้
 */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[1;31m',
  green: '\x1b[1;32m',
  yellow: '\x1b[1;33m',
  cyan: '\x1b[1;36m',
  white: '\x1b[1;37m',
};

process.chdir(path.resolve(__dirname, '..'));

const HOST = process.env.DEPLOY_HOST || '192.168.1.241';
const PORT = process.env.DEPLOY_PORT || '22';
const USER = process.env.DEPLOY_USER || 'srimuang';
const DIR = process.env.DEPLOY_DIR || '/var/www/html/hp-registry';
const APP = process.env.DEPLOY_APP || 'hp-registry';

const plink = path.join('C:', 'Program Files', 'PuTTY', 'plink.exe');
if (!fs.existsSync(plink)) {
  console.error(`${C.red}✖ ไม่พบ PuTTY (plink.exe) ที่ ${plink}${C.reset}`);
  process.exit(1);
}

let password = process.env.DEPLOY_PASSWORD || '';
if (!password) {
  try {
    password = execSync('powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-password.ps1 -Mode get', { encoding: 'utf8' }).trim();
  } catch {}
}
if (!password) {
  console.error(`${C.red}✖ ยังไม่มีรหัสผ่าน SSH ที่บันทึกไว้ — รัน deploy.bat ก่อนหนึ่งครั้งเพื่อบันทึกรหัสผ่าน${C.reset}`);
  process.exit(1);
}

// แต่ละชุด pm2: ถ้ายังไม่มี daemon (ไม่มี rpc.sock) จะข้าม ไม่สั่งให้สร้างใหม่
const remote = `bash -lc '
for H in "$HOME/.pm2" "${DIR}/.pm2"; do
  if [ -S "$H/rpc.sock" ]; then
    echo "SET=$(PM2_HOME="$H" pm2 jlist 2>/dev/null | tail -n1)"
  fi
done
echo "HOSTNAME=$(hostname)"
'`;

console.log(`${C.dim}\n  กำลังเชื่อมต่อ ${USER}@${HOST} ...${C.reset}`);
const res = spawnSync(plink, ['-batch', '-ssh', '-P', PORT, '-pw', password, `${USER}@${HOST}`, remote], { encoding: 'utf8' });
if (res.status !== 0) {
  console.error(`\n${C.red}  ✖ เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ${C.reset}`);
  console.error(`${C.yellow}    ตรวจสอบเครือข่าย/ไอพี และรหัสผ่าน (หากเปลี่ยนรหัสผ่าน ให้รัน: deploy.bat reset-pwd)${C.reset}\n`);
  process.exit(1);
}

let hostname = HOST;
const procs = [];
for (const line of String(res.stdout).split(/\r?\n/)) {
  if (line.startsWith('HOSTNAME=')) hostname = line.slice(9).trim() || HOST;
  if (!line.startsWith('SET=')) continue;
  try {
    for (const p of JSON.parse(line.slice(4))) {
      if (!procs.some((x) => x.name === p.name && x.pid === p.pid && x.pm2_env.pm_id === p.pm2_env.pm_id)) procs.push(p);
    }
  } catch {}
}

// ความกว้างบนหน้าจอ: สระบน/วรรณยุกต์ภาษาไทยไม่กินที่
const width = (s) => [...s].filter((ch) => !/[ัิ-ฺ็-๎]/.test(ch)).length;
const pad = (s, w) => s + ' '.repeat(Math.max(0, w - width(s)));
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const padC = (s, w) => s + ' '.repeat(Math.max(0, w - width(strip(s))));

function uptime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} วัน ${h} ชม.`;
  if (h > 0) return `${h} ชม. ${m} น.`;
  if (m > 0) return `${m} น.`;
  return `${s} วิ.`;
}

const rows = procs
  .map((p) => {
    const env = p.pm2_env;
    const online = env.status === 'online';
    const own = p.name === APP;
    const status = online ? `${C.green}● ทำงาน${C.reset}` : env.status === 'stopped' ? `${C.red}● หยุด${C.reset}` : `${C.yellow}● ${env.status}${C.reset}`;
    return {
      id: String(env.pm_id),
      name: p.name + (own ? ' ★' : ''),
      version: env.version && env.version !== 'N/A' ? env.version : '-',
      pid: online ? String(p.pid) : '-',
      status,
      uptime: online ? uptime(Date.now() - env.pm_uptime) : '-',
      restarts: String(env.restart_time),
      ram: `${(p.monit.memory / 1048576).toFixed(1)} MB`,
      cpu: `${p.monit.cpu}%`,
      online,
      own,
    };
  })
  .sort((a, b) => Number(a.id) - Number(b.id) || a.name.localeCompare(b.name));

const cols = [
  ['id', 'ID'],
  ['name', 'ชื่อบริการ'],
  ['version', 'เวอร์ชัน'],
  ['pid', 'PID'],
  ['status', 'สถานะ'],
  ['uptime', 'ทำงานมาแล้ว'],
  ['restarts', 'รีสตาร์ท'],
  ['ram', 'RAM'],
  ['cpu', 'CPU'],
];
const w = cols.map(([k, h]) => Math.max(width(h), ...rows.map((r) => width(strip(String(r[k]))))));
const line = (l, m, r) => `${C.cyan}${l}${w.map((x) => '─'.repeat(x + 2)).join(m)}${r}${C.reset}`;
const sep = `${C.cyan}│${C.reset}`;

const total = rows.length;
const onlineCount = rows.filter((r) => r.online).length;
const stopped = total - onlineCount;

console.log('');
console.log(`${C.cyan}  ${'━'.repeat(58)}${C.reset}`);
console.log(`${C.cyan}   ระบบงานพัสดุ  ·  รายการบริการ PM2 บนเซิร์ฟเวอร์${C.reset}`);
console.log(`${C.dim}   เซิร์ฟเวอร์ : ${hostname} (${HOST})   เวลา : ${new Date().toLocaleString('th-TH')}${C.reset}`);
console.log(`${C.cyan}  ${'━'.repeat(58)}${C.reset}`);
console.log('');

if (total === 0) {
  console.log(`${C.yellow}  ไม่พบโปรเซส pm2 ที่กำลังทำงานบนเซิร์ฟเวอร์นี้${C.reset}\n`);
  process.exit(0);
}

console.log('  ' + line('┌', '┬', '┐'));
console.log('  ' + sep + cols.map(([, h], i) => ` ${C.white}${pad(h, w[i])}${C.reset} `).join(sep) + sep);
console.log('  ' + line('├', '┼', '┤'));
for (const r of rows) {
  const cells = cols.map(([k], i) => {
    const v = String(r[k]);
    const colored = k === 'name' ? (r.own ? `${C.cyan}${v}${C.reset}` : v) : v;
    return ` ${padC(colored, w[i])} `;
  });
  console.log('  ' + sep + cells.join(sep) + sep);
}
console.log('  ' + line('└', '┴', '┘'));

console.log('');
console.log(
  `  สรุปภาพรวม: บริการทั้งหมด ${C.white}${total}${C.reset} ตัว  │  ` +
    `${C.green}ทำงานอยู่ ${onlineCount} ตัว${C.reset}  │  ` +
    `${stopped > 0 ? C.red : C.dim}หยุดทำงาน ${stopped} ตัว${C.reset}`
);
console.log(`${C.dim}  ★ = ${APP} (ใช้ pm2 แยกของตัวเองในโฟลเดอร์โปรแกรม)${C.reset}`);
console.log('');
process.exit(stopped > 0 ? 2 : 0);
