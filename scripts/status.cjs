#!/usr/bin/env node
/**
 * status.cjs - ตรวจสถานะระบบงานพัสดุบนเซิร์ฟเวอร์ (pm2, เปิดเองหลังรีบูต, API, เว็บผ่าน Apache)
 * อ่านอย่างเดียว ไม่แก้ไขอะไรบนเซิร์ฟเวอร์ ใช้รหัสผ่านที่ deploy.bat บันทึกไว้
 * ฝั่งเซิร์ฟเวอร์ส่งกลับเฉพาะข้อมูลดิบ (ASCII) แล้วจัดรูปแบบภาษาไทยที่เครื่องนี้ เพื่อกันตัวอักษรเพี้ยน
 */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[1;31m',
  green: '\x1b[1;32m',
  yellow: '\x1b[1;33m',
  cyan: '\x1b[1;36m',
  white: '\x1b[1;37m',
};
const RULE = '━'.repeat(58);

process.chdir(path.resolve(__dirname, '..'));

const HOST = process.env.DEPLOY_HOST || '192.168.1.241';
const PORT = process.env.DEPLOY_PORT || '22';
const USER = process.env.DEPLOY_USER || 'srimuang';
const DIR = process.env.DEPLOY_DIR || '/var/www/html/hp-registry';
const APP = process.env.DEPLOY_APP || 'hp-registry';
const API_PORT = process.env.APP_PORT || '3200';

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

console.log('');
console.log(`${C.cyan}  ${RULE}${C.reset}`);
console.log(`${C.cyan}   ระบบงานพัสดุ  ·  ตรวจสถานะเซิร์ฟเวอร์${C.reset}`);
console.log(`${C.dim}   ปลายทาง : ${USER}@${HOST}   โปรแกรม : ${APP}${C.reset}`);
console.log(`${C.cyan}  ${RULE}${C.reset}`);
console.log(`${C.dim}   กำลังเชื่อมต่อเซิร์ฟเวอร์ ...${C.reset}`);

// ฝั่งเซิร์ฟเวอร์: พิมพ์เป็นบรรทัด KEY=VALUE (ASCII) เท่านั้น
const remote = `bash -lc '
export PM2_HOME=${DIR}/.pm2
if [ -S "$PM2_HOME/rpc.sock" ]; then
  echo "PM2JSON=$(pm2 jlist 2>/dev/null | tail -n1)"
else
  echo "PM2JSON=none"
fi
echo "ENABLED=$(systemctl is-enabled pm2-${APP} 2>/dev/null | head -1)"
echo "ACTIVE=$(systemctl is-active pm2-${APP} 2>/dev/null | head -1)"
echo "API=$(curl -s -o /dev/null -m 5 -w %{http_code} http://127.0.0.1:${API_PORT}/api/health)"
echo "WEB=$(curl -s -o /dev/null -m 5 -w %{http_code} http://127.0.0.1/${APP}/)"
'`;

const res = spawnSync(plink, ['-batch', '-ssh', '-P', PORT, '-pw', password, `${USER}@${HOST}`, remote], { encoding: 'utf8' });
if (res.status !== 0) {
  console.error(`\n${C.red}  ✖ เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ${C.reset}`);
  console.error(`${C.yellow}    ตรวจสอบเครือข่าย/ไอพี และรหัสผ่าน (หากเปลี่ยนรหัสผ่าน ให้รัน: deploy.bat reset-pwd)${C.reset}\n`);
  process.exit(1);
}

const data = {};
for (const line of String(res.stdout).split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i > 0 && /^[A-Z0-9]+$/.test(line.slice(0, i))) data[line.slice(0, i)] = line.slice(i + 1).trim();
}

let proc = null;
if (data.PM2JSON && data.PM2JSON !== 'none') {
  try {
    const list = JSON.parse(data.PM2JSON);
    proc = list.find((p) => p.name === APP) || null;
  } catch {}
}

const dot = (ok, warn) => (ok ? `${C.green}●${C.reset}` : warn ? `${C.yellow}●${C.reset}` : `${C.red}●${C.reset}`);
const row = (label, value) => console.log(`    ${C.dim}${label.padEnd(24)}${C.reset}${value}`);
const section = (title) => console.log(`\n${C.white}  ■ ${title}${C.reset}`);

function formatDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} วัน ${h} ชั่วโมง`;
  if (h > 0) return `${h} ชั่วโมง ${m} นาที`;
  if (m > 0) return `${m} นาที`;
  return `${s} วินาที`;
}

const problems = [];
const notes = [];

section('โปรแกรม (pm2)');
const online = proc?.pm2_env?.status === 'online';
if (proc) {
  const env = proc.pm2_env;
  row('สถานะ', `${dot(online, env.status === 'launching')} ${online ? `${C.green}ทำงานอยู่${C.reset}` : `${C.red}${env.status}${C.reset}`}`);
  row('ทำงานมาแล้ว', online ? formatDuration(Date.now() - env.pm_uptime) : '-');
  row('รีสตาร์ท', `${env.restart_time} ครั้ง`);
  row('หน่วยความจำ / CPU', `${(proc.monit.memory / 1048576).toFixed(1)} MB / ${proc.monit.cpu}%`);
  row('หมายเลขโปรเซส', String(proc.pid));
  if (!online) problems.push('โปรแกรมไม่ได้ทำงานอยู่ ลองรัน deploy.bat ใหม่');
  if (env.restart_time > 5) notes.push(`รีสตาร์ท ${env.restart_time} ครั้ง — โปรแกรมอาจล่มซ้ำ ควรตรวจ log`);
} else {
  row('สถานะ', `${dot(false)} ${C.red}ไม่พบโปรแกรมใน pm2 ของระบบนี้${C.reset}`);
  problems.push('ยังไม่ได้ deploy ด้วยสคริปต์ล่าสุด หรือโปรแกรมถูกลบออกจาก pm2 — รัน deploy.bat');
}

section('เปิดเองหลังรีบูตเครื่อง');
const enabled = data.ENABLED === 'enabled';
row('การตั้งค่า', `${dot(enabled)} ${enabled ? `${C.green}ตั้งค่าแล้ว${C.reset}` : `${C.red}ยังไม่ได้ตั้งค่า${C.reset}`}`);
if (enabled && data.ACTIVE !== 'active') {
  row('หมายเหตุ', `${C.dim}บริการจะเริ่มเองเมื่อเครื่องรีบูต (ตอนนี้โปรแกรมรันอยู่แล้ว จึงเป็นปกติ)${C.reset}`);
}
if (!enabled) problems.push('ยังไม่ได้ตั้งให้เปิดเองหลังรีบูต — รัน deploy.bat (ต้องใช้สิทธิ์ sudo ของผู้ใช้ ' + USER + ')');

section('การเข้าใช้งานจริง');
const apiOk = data.API === '200';
const webOk = data.WEB === '200';
row('ระบบหลังบ้าน (API)', `${dot(apiOk)} ${apiOk ? `${C.green}ปกติ${C.reset}` : `${C.red}ผิดปกติ${C.reset}`} ${C.dim}HTTP ${data.API || '-'}${C.reset}`);
row('หน้าเว็บ (Apache)', `${dot(webOk)} ${webOk ? `${C.green}ปกติ${C.reset}` : `${C.red}ผิดปกติ${C.reset}`} ${C.dim}HTTP ${data.WEB || '-'}${C.reset}`);
if (!apiOk) problems.push('ระบบหลังบ้านไม่ตอบสนอง (ตรวจพอร์ต ' + API_PORT + ' และไฟล์ backend/.env)');
if (!webOk) problems.push('เข้าหน้าเว็บผ่าน Apache ไม่ได้ (ตรวจการตั้งค่า Apache: scripts/update-apache.cjs)');

console.log('');
console.log(`${C.cyan}  ${RULE}${C.reset}`);
if (problems.length === 0) {
  console.log(`${C.green}   ✔  สรุป: ระบบพร้อมใช้งานปกติ${C.reset}`);
  console.log(`${C.dim}      เปิดใช้งานที่ http://${HOST}/${APP}/${C.reset}`);
} else {
  console.log(`${C.red}   ✖  สรุป: พบสิ่งที่ต้องแก้ ${problems.length} รายการ${C.reset}`);
  for (const p of problems) console.log(`${C.yellow}      • ${p}${C.reset}`);
}
for (const n of notes) console.log(`${C.yellow}      ⚠ ${n}${C.reset}`);
console.log(`${C.cyan}  ${RULE}${C.reset}`);
console.log('');
process.exit(problems.length === 0 ? 0 : 2);
