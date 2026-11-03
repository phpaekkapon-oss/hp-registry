// Usage: node scripts/release.mjs <version>   (e.g. 1.0.1)
// Bumps package.json, commits, tags vX.Y.Z and pushes to GitHub (plus a GitHub Release when `gh` is logged in).
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = path.join(root, 'package.json');
const changelogPath = path.join(root, 'frontend/src/data/changelog.ts');

const fail = (msg) => {
  console.error(`[ERROR] ${msg}`);
  process.exit(1);
};
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const tryRun = (cmd, args) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) fail('ระบุเวอร์ชันเป็นรูปแบบ X.Y.Z เช่น release.bat 1.0.1');

const tag = `v${version}`;
const changelog = readFileSync(changelogPath, 'utf8');
if (!changelog.includes(`version: '${version}'`)) {
  fail(`ยังไม่มีรายการ ${version} ใน frontend/src/data/changelog.ts — เพิ่มบันทึกการอัปเดตก่อน แล้วรันใหม่`);
}
if (tryRun('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`]).status === 0) fail(`มี tag ${tag} อยู่แล้ว`);

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
if (pkg.version !== version) {
  pkg.version = version;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

git('add', '-A');
if (git('status', '--porcelain')) git('commit', '-m', `chore(release): ${tag}`);
git('tag', '-a', tag, '-m', `ระบบงานพัสดุ ${tag}`);
console.log(`[OK] สร้าง commit และ tag ${tag} แล้ว`);

if (tryRun('git', ['remote', 'get-url', 'origin']).status !== 0) {
  console.log('[WARN] ยังไม่ได้ตั้ง remote origin จึงยังไม่ push — ตั้งด้วย: git remote add origin https://github.com/<ชื่อ>/<repo>.git');
  console.log('       จากนั้นรัน: git push -u origin HEAD --follow-tags');
  process.exit(0);
}

const push = spawnSync('git', ['push', '-u', 'origin', 'HEAD', '--follow-tags'], { cwd: root, stdio: 'inherit' });
if (push.status !== 0) fail('git push ไม่สำเร็จ (ตรวจสอบสิทธิ์/การเข้าสู่ระบบ GitHub) — commit และ tag ยังอยู่ในเครื่อง');

const titleMatch = new RegExp(`version: '${version.replaceAll('.', '\\.')}'[\\s\\S]*?title: '([^']*)'`).exec(changelog);
const gh = tryRun('gh', ['release', 'create', tag, '--title', `${tag} ${titleMatch?.[1] ?? ''}`.trim(), '--notes', `ระบบงานพัสดุ ${tag}${titleMatch ? ` — ${titleMatch[1]}` : ''}`]);
if (gh.error || gh.status !== 0) {
  console.log('[WARN] สร้าง GitHub Release อัตโนมัติไม่ได้ (ต้องติดตั้งและ gh auth login) — tag ถูก push แล้ว สร้าง Release เองได้ที่หน้า Releases');
} else {
  console.log(gh.stdout.trim());
}
console.log(`[DONE] ${tag}`);
