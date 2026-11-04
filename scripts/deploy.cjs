#!/usr/bin/env node
/**
 * deploy.cjs - สคริปต์นำระบบงานพัสดุ (hp-registry) ขึ้นเซิร์ฟเวอร์
 * รันผ่าน Node.js เพื่อให้รองรับภาษาไทย UTF-8 และ ANSI ได้ 100% บนทุกเครื่อง
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---- สี ANSI ----
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[1;31m',
  green: '\x1b[1;32m',
  yellow: '\x1b[1;33m',
  blue: '\x1b[1;34m',
  cyan: '\x1b[1;36m',
};

const rootDir = path.resolve(__dirname, '..');
process.chdir(rootDir);

// ---- ตั้งค่าเซิร์ฟเวอร์ ----
const DEPLOY_HOST = process.env.DEPLOY_HOST || '192.168.1.241';
const DEPLOY_PORT = process.env.DEPLOY_PORT || '22';
const DEPLOY_USER = process.env.DEPLOY_USER || 'srimuang';
const DEPLOY_DIR  = process.env.DEPLOY_DIR  || '/var/www/html/hp-registry';
const DEPLOY_APP  = process.env.DEPLOY_APP  || 'hp-registry';

// ---- คำสั่งล้างรหัสผ่าน: node scripts/deploy.cjs reset-pwd ----
const args = process.argv.slice(2);
if (args.includes('reset-pwd') || args.includes('--reset-password') || args.includes('reset')) {
  try {
    execSync('powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\deploy-password.ps1 -Mode clear', { stdio: 'inherit' });
  } catch {}
  console.log(`\n${C.green}[OK] ลบรหัสผ่าน SSH ที่บันทึกไว้ในเครื่องเรียบร้อยแล้ว${C.reset}`);
  console.log(`${C.yellow}     การ deploy ครั้งถัดไปจะถามรหัสผ่านใหม่อีกครั้ง${C.reset}\n`);
  process.exit(0);
}

console.log('');
console.log(`${C.cyan}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
console.log(`${C.cyan}   ระบบงานพัสดุ  ·  นำระบบขึ้นเซิร์ฟเวอร์ (Deploy)${C.reset}`);
console.log(`${C.cyan}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
console.log(`${C.dim}   ปลายทาง : ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_DIR}${C.reset}`);
console.log(`${C.dim}   โปรเซส  : pm2 / ${DEPLOY_APP}${C.reset}`);
console.log(`${C.dim}   เวอร์ชัน : ขึ้นเลขใหม่ + AI เขียนบันทึกการอัปเดต + ส่งขึ้น GitHub ให้อัตโนมัติ (ข้ามได้ด้วย --no-release)${C.reset}`);
console.log('');

// ---- ตรวจสอบโปรแกรมที่จำเป็น ----
const tarExe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
const plinkExe = 'C:\\Program Files\\PuTTY\\plink.exe';
const pscpExe = 'C:\\Program Files\\PuTTY\\pscp.exe';

if (!fs.existsSync(tarExe)) {
  console.error(`${C.red}✖ เกิดข้อผิดพลาด: ไม่พบ tar.exe ของ Windows${C.reset}`);
  process.exit(1);
}
if (!fs.existsSync(plinkExe) || !fs.existsSync(pscpExe)) {
  console.error(`${C.red}✖ เกิดข้อผิดพลาด: ไม่พบโปรแกรม PuTTY (plink.exe / pscp.exe) ที่ C:\\Program Files\\PuTTY${C.reset}`);
  process.exit(1);
}

// ---- จัดการรหัสผ่าน SSH (ดึงจาก DPAPI หรือถามครั้งแรก) ----
let deployPassword = process.env.DEPLOY_PASSWORD || '';
if (!deployPassword) {
  try {
    deployPassword = execSync(
      'powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\deploy-password.ps1 -Mode get',
      { encoding: 'utf8' }
    ).trim();
  } catch {}
}

if (!deployPassword) {
  console.log(`${C.yellow}   ยังไม่มีรหัสผ่าน SSH ที่บันทึกไว้ในเครื่อง${C.reset}`);
  console.log(`${C.yellow}   ก่อนพิมพ์รหัสผ่าน: สลับแป้นพิมพ์เป็นภาษาอังกฤษ (Win + Space) หรือคลิกขวาเพื่อวาง${C.reset}`);
  try {
    const env = { ...process.env, DEPLOY_USER };
    deployPassword = execSync(
      'powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\deploy-password.ps1 -Mode prompt',
      { env, encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] }
    ).trim();

    if (deployPassword) {
      execSync(
        'powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\deploy-password.ps1 -Mode save',
        { env: { ...process.env, DEPLOY_PASSWORD: deployPassword }, stdio: 'ignore' }
      );
      console.log(`${C.green}    ✔ บันทึกรหัสผ่านในเครื่องเรียบร้อยแล้ว (ครั้งต่อไปไม่ต้องกรอกซ้ำ)${C.reset}`);
    }
  } catch {
    deployPassword = '';
  }
}

if (!deployPassword) {
  console.error(`\n${C.red}✖ เกิดข้อผิดพลาด: ไม่ได้กรอกรหัสผ่าน${C.reset}`);
  process.exit(1);
}

function runStep(title, fn) {
  console.log(`\n${C.blue}  ■ ${title}${C.reset}`);
  try {
    fn();
    console.log(`${C.green}    ✔ สำเร็จ${C.reset}`);
  } catch (err) {
    console.error(`\n${C.red}✖ เกิดข้อผิดพลาด: ${err.message || err}${C.reset}`);
    process.exit(1);
  }
}

// 0. ออกเวอร์ชันใหม่อัตโนมัติ + ให้ AI เขียนบันทึกการอัปเดต (ข้ามได้ด้วย: deploy.bat --no-release)
const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

function bangkokToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
}

function nextVersion(current, kind) {
  const [maj, min, pat] = current.split('.').map(Number);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

/** Asks the AI on the server (keys and model order from Settings → AI); null when it cannot */
function aiNotes(version, commits, files) {
  try {
    execSync(`echo y | "${plinkExe}" -ssh -P ${DEPLOY_PORT} -pw "${deployPassword}" ${DEPLOY_USER}@${DEPLOY_HOST} exit`, { stdio: 'ignore' });
  } catch {}
  const remote = `bash -lc 'cd ${DEPLOY_DIR}/backend && npx --no-install tsx scripts/ai-release-notes.ts'`;
  const res = spawnSync(
    plinkExe,
    ['-batch', '-ssh', '-P', DEPLOY_PORT, '-pw', deployPassword, `${DEPLOY_USER}@${DEPLOY_HOST}`, remote],
    { input: JSON.stringify({ version, commits, files }), encoding: 'utf8', timeout: 240_000 }
  );
  const line = String(res.stdout || '').split('\n').find((l) => l.startsWith('@@AI@@'));
  if (!line) {
    console.log(`${C.yellow}    ! เรียก AI บนเซิร์ฟเวอร์ไม่ได้ (ครั้งแรกหลังติดตั้งฟีเจอร์นี้เป็นเรื่องปกติ) ใช้ข้อความจาก commit แทน${C.reset}`);
    return null;
  }
  const out = JSON.parse(line.slice('@@AI@@'.length));
  if (!out.ok) {
    console.log(`${C.yellow}    ! AI เขียนบันทึกไม่สำเร็จ: ${out.error} — ใช้ข้อความจาก commit แทน${C.reset}`);
    return null;
  }
  console.log(`${C.dim}    AI (${out.model}) เขียนบันทึกการอัปเดตแล้ว${C.reset}`);
  return { title: out.title, kind: out.kind, highlights: out.highlights };
}

function fallbackNotes(commits) {
  const lines = commits
    .map((c) => c.replace(/^\w+(\([^)]*\))?!?:\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 5);
  return {
    title: 'ปรับปรุงระบบ',
    kind: 'patch',
    highlights: lines.length ? lines : ['ปรับปรุงประสิทธิภาพและแก้ไขข้อผิดพลาดเล็กน้อย'],
  };
}

function autoRelease() {
  try {
    git('rev-parse --is-inside-work-tree');
  } catch {
    console.log(`${C.yellow}    ! ไม่ใช่ git repository ข้ามการออกเวอร์ชัน${C.reset}`);
    return;
  }
  let lastTag = '';
  try { lastTag = git('describe --tags --abbrev=0'); } catch {}
  const range = lastTag ? `${lastTag}..HEAD` : '-20';
  const commits = git(`log ${range} --pretty=format:%s`).split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('chore(release)'));
  const dirty = git('status --porcelain').split('\n').map((l) => l.slice(3).trim()).filter(Boolean);
  const committed = lastTag ? git(`diff --name-only ${lastTag}..HEAD`).split('\n').filter(Boolean) : [];
  const files = [...new Set([...committed, ...dirty])];

  if (commits.length === 0 && dirty.length === 0) {
    console.log(`${C.dim}    ไม่มีการเปลี่ยนแปลงตั้งแต่ ${lastTag || 'ครั้งก่อน'} — ใช้เวอร์ชันเดิม${C.reset}`);
    return;
  }

  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const changelogPath = path.join(rootDir, 'frontend', 'src', 'data', 'changelog.ts');
  let changelog = fs.readFileSync(changelogPath, 'utf8');

  // An entry written by hand for the next patch version wins over the AI
  const patchNext = nextVersion(pkg.version, 'patch');
  let version;
  if (changelog.includes(`version: '${patchNext}'`)) {
    version = patchNext;
    console.log(`${C.dim}    ใช้บันทึก v${version} ที่เขียนไว้แล้วใน changelog.ts${C.reset}`);
  } else {
    const notes = aiNotes(patchNext, commits, files) || fallbackNotes(commits);
    version = nextVersion(pkg.version, notes.kind);
    const entry = [
      '  {',
      `    version: '${version}',`,
      `    date: '${bangkokToday()}',`,
      `    title: ${JSON.stringify(notes.title)},`,
      `    kind: '${notes.kind}',`,
      '    highlights: [',
      ...notes.highlights.map((h) => `      ${JSON.stringify(h)},`),
      '    ],',
      '  },',
    ].join('\n');
    const anchor = /export const CHANGELOG: ReleaseNote\[\] = \[\r?\n/;
    if (!anchor.test(changelog)) throw new Error('หาตำแหน่งใส่บันทึกใน changelog.ts ไม่เจอ');
    changelog = changelog.replace(anchor, (m) => `${m}${entry}\n`);
    fs.writeFileSync(changelogPath, changelog);
  }

  pkg.version = version;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const tag = `v${version}`;
  git('add -A');
  execSync(`git commit -q -m "chore(release): ${tag}"`, { stdio: 'ignore' });
  git(`tag -a ${tag} -m "ระบบงานพัสดุ ${tag}"`);
  console.log(`${C.green}    ✔ ออกเวอร์ชัน ${tag} (commit + tag แล้ว)${C.reset}`);

  const push = spawnSync('git', ['push', '-u', 'origin', 'HEAD', '--follow-tags'], { stdio: 'inherit' });
  if (push.status !== 0) {
    console.log(`${C.yellow}    ! ส่งขึ้น GitHub ไม่สำเร็จ (deploy ต่อได้) — ส่งเองภายหลังด้วย: git push --follow-tags${C.reset}`);
  }
}

if (!args.includes('--no-release')) {
  runStep('ขั้นตอนที่ 1/6  ออกเวอร์ชันใหม่ และให้ AI เขียนบันทึกการอัปเดต', autoRelease);
}

// 1. Build Frontend
runStep('ขั้นตอนที่ 2/6  สร้างหน้าเว็บ (Build Frontend)', () => {
  execSync('npm run build', { stdio: 'inherit' });
  const indexPath = path.join(rootDir, 'frontend', 'dist', 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error('ไม่พบไฟล์ frontend/dist/index.html หลังการ build');
  }
});

// 2. รวมแพ็กเกจ
const archivePath = path.join(os.tmpdir(), `${DEPLOY_APP}-deploy.tar.gz`);
runStep('ขั้นตอนที่ 3/6  รวมไฟล์เป็นแพ็กเกจ', () => {
  if (fs.existsSync(archivePath)) {
    try { fs.unlinkSync(archivePath); } catch {}
  }
  const tarCmd = `"${tarExe}" -czf "${archivePath}" --exclude=node_modules --exclude=.env --exclude=.env.* --exclude=backups --exclude=.git package.json package-lock.json backend frontend/package.json frontend/dist`;
  execSync(tarCmd, { stdio: 'inherit' });
  if (!fs.existsSync(archivePath)) {
    throw new Error('รวมไฟล์แพ็กเกจไม่สำเร็จ');
  }
});

// 3. เชื่อมต่อเซิร์ฟเวอร์
runStep('ขั้นตอนที่ 4/6  เชื่อมต่อเซิร์ฟเวอร์', () => {
  // บันทึก host key อัตโนมัติหากยังไม่มี
  try {
    execSync(`echo y | "${plinkExe}" -ssh -P ${DEPLOY_PORT} -pw "${deployPassword}" ${DEPLOY_USER}@${DEPLOY_HOST} exit`, { stdio: 'ignore' });
  } catch {}

  const mkdirRes = spawnSync(
    plinkExe,
    ['-batch', '-ssh', '-P', DEPLOY_PORT, '-pw', deployPassword, `${DEPLOY_USER}@${DEPLOY_HOST}`, `mkdir -p ${DEPLOY_DIR}`],
    { stdio: 'inherit' }
  );
  if (mkdirRes.status !== 0) {
    if (fs.existsSync(archivePath)) { try { fs.unlinkSync(archivePath); } catch {} }
    console.log(`${C.yellow}   (หากเปลี่ยนรหัสผ่าน ให้รัน "deploy.bat reset-pwd" เพื่อล้างรหัสผ่านเดิมที่บันทึกไว้)${C.reset}`);
    throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ตรวจสอบ IP เครือข่าย และรหัสผ่าน');
  }
});

// 4. อัปโหลดไฟล์
runStep('ขั้นตอนที่ 5/6  อัปโหลดไฟล์ขึ้นเซิร์ฟเวอร์', () => {
  const pscpArchive = spawnSync(
    pscpExe,
    ['-batch', '-P', DEPLOY_PORT, '-pw', deployPassword, archivePath, `${DEPLOY_USER}@${DEPLOY_HOST}:/tmp/${DEPLOY_APP}-deploy.tar.gz`],
    { stdio: 'inherit' }
  );
  if (pscpArchive.status !== 0) {
    if (fs.existsSync(archivePath)) { try { fs.unlinkSync(archivePath); } catch {} }
    throw new Error('อัปโหลดแพ็กเกจไม่สำเร็จ');
  }

  const pscpScript = spawnSync(
    pscpExe,
    ['-batch', '-P', DEPLOY_PORT, '-pw', deployPassword, path.join('scripts', 'deploy-remote.sh'), `${DEPLOY_USER}@${DEPLOY_HOST}:/tmp/${DEPLOY_APP}-deploy-remote.sh`],
    { stdio: 'inherit' }
  );
  if (fs.existsSync(archivePath)) { try { fs.unlinkSync(archivePath); } catch {} }
  if (pscpScript.status !== 0) {
    throw new Error('อัปโหลดสคริปต์ติดตั้งไม่สำเร็จ');
  }
});

// 5. รันรีโมต PM2
runStep('ขั้นตอนที่ 6/6  ติดตั้งและรีสตาร์ทระบบ (pm2) บนเซิร์ฟเวอร์', () => {
  const remoteCmd = `bash -lc 'bash /tmp/${DEPLOY_APP}-deploy-remote.sh ${DEPLOY_DIR} ${DEPLOY_APP}; rc=$?; rm -f /tmp/${DEPLOY_APP}-deploy-remote.sh; exit $rc'`;
  const remoteRes = spawnSync(
    plinkExe,
    ['-batch', '-ssh', '-P', DEPLOY_PORT, '-pw', deployPassword, `${DEPLOY_USER}@${DEPLOY_HOST}`, remoteCmd],
    { stdio: ['pipe', 'inherit', 'inherit'], input: `${deployPassword}\n` }
  );
  if (remoteRes.status !== 0) {
    throw new Error('ขั้นตอนบนเซิร์ฟเวอร์ไม่สำเร็จ ดูรายละเอียดข้อความด้านบน');
  }
});

console.log('');
console.log(`${C.green}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
console.log(`${C.green}   ✔  นำระบบขึ้นเซิร์ฟเวอร์เรียบร้อยแล้ว พร้อมใช้งานทันที!${C.reset}`);
console.log(`${C.green}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
console.log('');
process.exit(0);

