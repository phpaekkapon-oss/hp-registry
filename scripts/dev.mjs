/**
 * Starts the dev servers (backend + frontend) on ports that do not clash with other programs.
 *
 *   node scripts/dev.mjs           (dev.bat runs this)
 *   node scripts/dev.mjs --check   only show which ports would be used (starts nothing, saves nothing)
 *   node scripts/dev.mjs --kill    kill any orphan processes on our ports then exit
 *
 * - The ports in use are remembered in .dev-ports.json, so the address stays the same from run to run.
 *   This matters for the installed app (PWA): it is tied to one address such as http://localhost:5174.
 * - A remembered port that another program has taken is replaced by the next free one (and remembered).
 * - If this system is already running, it just opens the browser instead of starting a second copy.
 * - On Windows, orphan Node/npm processes from a previous crashed session are killed automatically.
 */
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAVED = path.join(root, '.dev-ports.json');
const DEFAULTS = { web: 5174, api: 3000 };
const APP_TITLE = 'ระบบงานพัสดุ';

const log = (msg) => console.log(`[dev] ${msg}`);
const warn = (msg) => console.warn(`[dev] ⚠  ${msg}`);

function loadSaved() {
  try {
    const s = JSON.parse(fs.readFileSync(SAVED, 'utf8'));
    return { web: Number(s.web) || DEFAULTS.web, api: Number(s.api) || DEFAULTS.api };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Something answers on this port (IPv4 or IPv6 loopback) */
function answers(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (v) => { socket.destroy(); resolve(v); };
    socket.setTimeout(400, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** We could listen on this port ourselves */
function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen({ port }, () => server.close(() => resolve(true)));
  });
}

async function isFree(port) {
  if ((await answers(port, '127.0.0.1')) || (await answers(port, '::1'))) return false;
  return canListen(port);
}

async function get(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return await res.text();
  } catch {
    return null;
  }
}

/** This project's own servers, already running from an earlier dev.bat */
const isOurWeb = async (port) => (await get(`http://localhost:${port}/`))?.includes(APP_TITLE) ?? false;
const isOurApi = async (port) => (await get(`http://localhost:${port}/api/health`))?.includes('"status":"healthy"') ?? false;

async function nextFree(from, avoid) {
  for (let p = from; p < from + 200; p++) {
    if (p !== avoid && (await isFree(p))) return p;
  }
  throw new Error(`ไม่พบพอร์ตว่างตั้งแต่ ${from}`);
}

/**
 * Kill any Node/npm process that is listening on the given port (Windows only).
 * This cleans up orphan processes left by a previous crashed dev session.
 * It will NOT kill processes from other projects (e.g. HRMS) — only those
 * whose command line contains node/npm/vite/tsx (our dev toolchain).
 */
function killOrphanOnPort(port) {
  if (process.platform !== 'win32') return;
  try {
    // Find PIDs listening on the port
    const raw = execSync(
      `netstat -ano -p TCP 2>nul | findstr /R ":${port} .*LISTENING"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    const pids = [...new Set(
      raw.trim().split('\n')
        .map((l) => l.trim().split(/\s+/).at(-1))
        .filter((p) => p && /^\d+$/.test(p) && p !== '0')
    )];
    for (const pid of pids) {
      try {
        // Only kill if it's a Node/npm/vite process (our dev toolchain)
        const cmdRaw = execSync(
          `wmic process where "ProcessId=${pid}" get CommandLine /format:list 2>nul`,
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
        );
        const cmd = cmdRaw.toLowerCase();
        if (cmd.includes('node') || cmd.includes('npm') || cmd.includes('vite') || cmd.includes('tsx')) {
          execSync(`taskkill /F /PID ${pid} 2>nul`, { stdio: 'ignore' });
          log(`ลบ process เก่า PID ${pid} ออกจากพอร์ต ${port} ✓`);
        } else {
          log(`พอร์ต ${port} ถูกใช้โดย PID ${pid} (ไม่ใช่ Node — ข้ามไป)`);
        }
      } catch {
        // PID already gone — ignore
      }
    }
  } catch {
    // netstat/findstr failed silently
  }
}

function openBrowser(url) {
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

// ── Parse flags ──────────────────────────────────────────────────────────────
const checkOnly = process.argv.includes('--check');
const killOnly  = process.argv.includes('--kill');
const saved     = loadSaved();

// ── Kill-only mode ────────────────────────────────────────────────────────────
if (killOnly) {
  log(`กำลังล้าง process เก่าบนพอร์ต ${saved.api} และ ${saved.web} ...`);
  killOrphanOnPort(saved.api);
  killOrphanOnPort(saved.web);
  log('เสร็จสิ้น');
  process.exit(0);
}

// ── Already running? Open browser and exit ───────────────────────────────────
if (!checkOnly && (await isOurWeb(saved.web)) && (await isOurApi(saved.api))) {
  log(`ระบบกำลังทำงานอยู่แล้วที่ http://localhost:${saved.web} — เปิดเบราว์เซอร์ให้`);
  openBrowser(`http://localhost:${saved.web}`);
  process.exit(0);
}

// ── Clean up orphan processes from previous crashed session ──────────────────
// (only if the port is occupied by our own dev toolchain — won't touch HRMS etc.)
log('ตรวจสอบ process เก่าที่อาจค้างอยู่ ...');
killOrphanOnPort(saved.api);
killOrphanOnPort(saved.web);

// Wait a moment for OS to fully release the ports after killing
await new Promise((r) => setTimeout(r, 600));

// ── Pick free ports ───────────────────────────────────────────────────────────
const ports = { ...saved };

if (!(await isFree(ports.api))) {
  ports.api = await nextFree(ports.api + 1, ports.web);
  warn(`พอร์ต ${saved.api} ถูกโปรแกรมอื่นใช้อยู่ → backend ใช้พอร์ต ${ports.api} แทน`);
}
if (!(await isFree(ports.web))) {
  ports.web = await nextFree(ports.web + 1, ports.api);
  warn(`พอร์ต ${saved.web} ถูกโปรแกรมอื่นใช้อยู่ → หน้าเว็บใช้พอร์ต ${ports.web} แทน`);
  warn(`ถ้าติดตั้งแอปไว้ที่พอร์ตเดิม ให้ติดตั้งใหม่จาก http://localhost:${ports.web} (ครั้งเดียว ระบบจะจำพอร์ตนี้ไว้)`);
}

if (checkOnly) {
  log(`จะใช้ backend :${ports.api}  frontend :${ports.web}`);
  process.exit(0);
}

if (ports.web !== saved.web || ports.api !== saved.api || !fs.existsSync(SAVED)) {
  fs.writeFileSync(SAVED, `${JSON.stringify(ports, null, 2)}\n`);
}

const url = `http://localhost:${ports.web}`;
log(`backend  http://localhost:${ports.api}/api`);
log(`frontend ${url}`);
log('กด Ctrl+C เพื่อหยุด');
console.log('');

const child = spawn('npm', ['run', 'dev:servers'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    PORT: String(ports.api),
    BACKEND_URL: `http://localhost:${ports.api}`,
    WEB_PORT: String(ports.web),
  },
});

// Open the browser once the page actually answers (up to a minute)
(async () => {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (child.exitCode !== null) return;
    if (await isOurWeb(ports.web)) return openBrowser(url);
  }
})();

const stop = () => child.kill('SIGINT');
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => process.exit(code ?? 0));
