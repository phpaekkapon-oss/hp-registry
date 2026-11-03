#!/usr/bin/env node
/**
 * setup-ai-rules — ติดตั้งกฎ AI ชุดเดียวให้ทุกเครื่องมือ (AGENTS.md เป็นไฟล์กลาง)
 * ใช้: node install.mjs [โฟลเดอร์โปรเจกต์] [--dry-run] [--force] [--lang=th|en]
 * ไม่มี dependency ภายนอก (Node 18+)
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => (args.find((a) => a.startsWith(`--${n}=`)) || "").split("=")[1] || d;
const target = path.resolve(args.find((a) => !a.startsWith("--")) || process.cwd());
const DRY = flag("dry-run");
const FORCE = flag("force");
const LANG = opt("lang", "th") === "en" ? "en" : "th";

if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
  console.error(`✗ ไม่พบโฟลเดอร์: ${target}`);
  process.exit(1);
}

/* ───────── ตรวจ stack ───────── */
const has = (f) => fs.existsSync(path.join(target, f));
const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(target, f), "utf8"));
  } catch {
    return null;
  }
};
const readText = (f) => {
  try {
    return fs.readFileSync(path.join(target, f), "utf8");
  } catch {
    return "";
  }
};

function detect() {
  const stack = [];
  const verify = [];
  const pkg = readJson("package.json");
  if (pkg) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const pick = [
      ["next", "Next.js"], ["react", "React"], ["vue", "Vue"], ["nuxt", "Nuxt"], ["@angular/core", "Angular"], ["svelte", "Svelte"],
      ["express", "Express"], ["fastify", "Fastify"], ["@nestjs/core", "NestJS"], ["tailwindcss", "Tailwind CSS"], ["vite", "Vite"],
      ["typescript", "TypeScript"], ["prisma", "Prisma"], ["mysql2", "MySQL"], ["pg", "PostgreSQL"], ["mongoose", "MongoDB"],
    ];
    for (const [k, label] of pick) if (deps[k]) stack.push(`${label}${typeof deps[k] === "string" && /^[~^]?\d/.test(deps[k]) ? " " + deps[k].replace(/^[~^]/, "").split(".")[0] : ""}`);
    if (!stack.length) stack.push("Node.js");
    const pm = has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : has("bun.lockb") || has("bun.lock") ? "bun" : "npm";
    const run = pm === "npm" ? "npm run" : pm;
    const s = pkg.scripts || {};
    if (deps.typescript || has("tsconfig.json")) verify.push(`${pm === "npm" ? "npx" : pm === "yarn" ? "yarn" : pm + " exec"} tsc --noEmit`);
    for (const k of ["lint", "test", "build"]) if (s[k]) verify.push(`${run} ${k}`);
  }
  if (has("requirements.txt") || has("pyproject.toml")) {
    const t = readText("requirements.txt") + readText("pyproject.toml");
    stack.push("Python");
    for (const [re, l] of [[/django/i, "Django"], [/fastapi/i, "FastAPI"], [/flask/i, "Flask"]]) if (re.test(t)) stack.push(l);
    if (/pytest/i.test(t) || has("pytest.ini")) verify.push("pytest");
    if (/ruff/i.test(t)) verify.push("ruff check .");
    if (/mypy/i.test(t)) verify.push("mypy .");
  }
  const csproj = fs.readdirSync(target).find((f) => /\.(csproj|sln)$/.test(f));
  if (csproj) {
    stack.push("C# / .NET");
    verify.push("dotnet build", "dotnet test");
  }
  if (has("go.mod")) {
    stack.push("Go");
    verify.push("go vet ./...", "go test ./...");
  }
  if (has("Cargo.toml")) {
    stack.push("Rust");
    verify.push("cargo check", "cargo test");
  }
  if (has("pom.xml") || has("build.gradle") || has("build.gradle.kts")) {
    stack.push("Java/Kotlin");
    verify.push(has("pom.xml") ? "mvn -q verify" : "./gradlew build");
  }
  if (has("composer.json")) stack.push("PHP");
  if (has("Dockerfile") || has("docker-compose.yml") || has("compose.yaml")) stack.push("Docker");
  return { stack: [...new Set(stack)], verify: [...new Set(verify)] };
}

const { stack, verify } = detect();
const name = path.basename(target);
const stackLine = stack.length ? stack.join(" · ") : "<!-- กรอก -->";
const verifyLine = verify.length ? verify.map((v) => `\`${v}\``).join(" → ") : "<!-- กรอก: คำสั่ง typecheck/test/build -->";

/* ───────── เนื้อหา ───────── */
const T = {
  th: {
    agents: `# AGENTS.md — กฎกลางสำหรับ AI ทุกตัว (${name})

> ไฟล์นี้คือแหล่งกฎเดียวของโปรเจกต์ Claude Code (\`CLAUDE.md\`), Gemini (\`GEMINI.md\`), Copilot, Windsurf, Cursor, Codex อ่านจากที่นี่ — แก้ที่นี่ที่เดียว

## 1. หลักการทำงาน
- **คิดก่อนเขียน**: ระบุสมมติฐาน ถ้ามีหลายความหมายให้เสนอทางเลือก ถ้าไม่ชัดให้ถามก่อนลงมือ
- **เรียบง่ายที่สุด**: เขียนเท่าที่โจทย์ต้องการ ไม่เพิ่มฟีเจอร์/abstraction/config ที่ไม่มีใครขอ
- **แก้เฉพาะจุด**: ทุกบรรทัดที่แก้ต้องโยงกลับไปที่คำขอได้ · เลียนแบบสไตล์โค้ดรอบข้าง · ไม่ refactor/จัดรูปโค้ดที่ไม่เกี่ยว · เห็นโค้ดตายที่ไม่เกี่ยวให้แจ้ง ไม่ลบเอง
- **กำหนดเกณฑ์สำเร็จแล้วตรวจจริง**: แปลงงานเป็นเป้าที่ตรวจได้ (เช่น เขียนเทสต์ที่พังก่อน แล้วแก้ให้ผ่าน) ห้ามรายงานว่าเสร็จโดยไม่มีผลรันจริง

## 2. มาตรฐานโค้ด
- ห้ามโค้ดตัดทอน / placeholder / \`// TODO\` / "เหมือนเดิม" — เขียนให้ใช้งานได้จริง
- ไม่ใช้ชนิดหลวม (\`any\` ใน TypeScript ฯลฯ) ถ้าไม่จำเป็น · จัดการ error ที่เกิดได้จริง ไม่ใส่ try/catch กับสิ่งที่เป็นไปไม่ได้
- ตั้งชื่อตามที่โปรเจกต์ใช้อยู่แล้ว · ไม่ใส่ comment อธิบายสิ่งที่โค้ดบอกอยู่แล้ว (comment ไว้อธิบาย "ทำไม")
- เงิน/จำนวนที่ต้องแม่นยำ ใช้ชนิด decimal ห้าม float

## 3. ความปลอดภัยและข้อมูล
- ห้ามใส่ secret/รหัสผ่าน/token ในโค้ด, commit, log หรือไฟล์ตัวอย่าง (ใช้ \`.env\` ที่ไม่ commit)
- SQL ต้อง parameterized เสมอ · ตรวจ input ที่ขอบระบบ (request, ไฟล์อัปโหลด)
- ข้อมูลส่วนบุคคล (เลขบัตร, เบอร์, สุขภาพ) ต้อง mask ตามสิทธิ์ ไม่ใส่ข้อมูลจริงในโค้ด/เทสต์/commit
- การแก้ไข/ลบข้อมูลสำคัญต้องเก็บ audit (ใคร/เมื่อไร/เหตุผล) · ทำลายข้อมูลแบบกู้ไม่ได้ต้องถามก่อน

## 4. Git และการส่งงาน
- Conventional Commits (\`feat:\` \`fix:\` \`chore:\` \`docs:\` …) · commit เล็ก ทำสิ่งเดียว
- ห้ามแก้/ลบ tag หรือ history ที่ push แล้ว (ไม่ force push เว้นแต่ผู้ใช้สั่ง)
- commit/push เมื่อผู้ใช้สั่งหรือตกลงไว้ล่วงหน้าเท่านั้น

## 5. การตรวจก่อนบอกว่าเสร็จ
- คำสั่งตรวจ: ${verifyLine}
- ต้องมีผลรันล่าสุดจริง (exit code 0) ก่อนรายงานว่าเสร็จ · ถ้าเทสต์ล้ม รายงานตามจริงพร้อมผลลัพธ์ · ถ้าข้ามขั้นตอนใด บอกว่าข้าม

## 6. Project Context
- **Stack**: ${stackLine}
- **โครงสร้างโฟลเดอร์สำคัญ**: <!-- กรอก -->
- **ฐานข้อมูล/ระบบภายนอกที่ห้ามเขียน**: <!-- กรอก เช่น ฐานข้อมูลต้นทางอ่านอย่างเดียว -->
- **กฎธุรกิจที่เดาเองไม่ได้**: <!-- กรอก -->
- **UI/ภาษา/ธีม**: <!-- กรอก เช่น UI ภาษาไทย รองรับโหมดมืด -->
`,
    pointer: `> กฎทั้งหมดของโปรเจกต์อยู่ที่ @AGENTS.md (ไฟล์กลางที่ AI ทุกตัวใช้ร่วมกัน) — อ่านไฟล์นั้นก่อนเสมอ`,
    summary: `กฎหลักของโปรเจกต์ (ฉบับเต็มอยู่ที่ AGENTS.md ในโฟลเดอร์รากของ repo — ให้ปฏิบัติตามไฟล์นั้น):
- คิดก่อนเขียน · เขียนเท่าที่โจทย์ต้องการ · แก้เฉพาะจุด เลียนแบบสไตล์เดิม
- ห้ามโค้ดตัดทอน/placeholder/\`// TODO\` · ห้ามรายงานว่าเสร็จโดยไม่มีผลรันตรวจจริง
- ห้ามใส่ secret ในโค้ด/commit · SQL parameterized · mask ข้อมูลส่วนบุคคล · เก็บ audit เมื่อแก้ข้อมูลสำคัญ
- Conventional Commits · ห้ามแก้/ลบ tag หรือ history ที่ push แล้ว`,
  },
  en: {
    agents: `# AGENTS.md — Shared rules for every AI tool (${name})

> This is the single source of project rules. Claude Code (\`CLAUDE.md\`), Gemini (\`GEMINI.md\`), Copilot, Windsurf, Cursor and Codex all read from here — edit only this file.

## 1. Working principles
- **Think before coding**: state assumptions; if there are several interpretations, present them; if unclear, ask before implementing.
- **Simplicity first**: write only what was asked — no unrequested features, abstractions or configuration.
- **Surgical changes**: every changed line must trace back to the request · match surrounding style · do not refactor or reformat unrelated code · mention unrelated dead code, do not delete it.
- **Define success, then verify**: turn the task into checkable goals (e.g. write a failing test first, then make it pass). Never report completion without real command output.

## 2. Code standards
- No truncated code, placeholders, \`// TODO\` or "same as before" — write complete working code.
- Avoid loose types (\`any\` in TypeScript, etc.) unless necessary · handle errors that can really happen, not impossible ones.
- Follow the project's existing naming · comments explain *why*, not what.
- Money / exact quantities: use decimal types, never float.

## 3. Security & data
- Never put secrets, passwords or tokens in code, commits, logs or sample files (use an uncommitted \`.env\`).
- SQL must be parameterized · validate input at system boundaries (requests, uploads).
- Mask personal data (national ID, phone, health) according to permissions; no real data in code, tests or commits.
- Changes/deletions of important data must keep an audit trail (who/when/why) · ask before irreversible destruction.

## 4. Git & delivery
- Conventional Commits (\`feat:\` \`fix:\` \`chore:\` \`docs:\` …) · small, single-purpose commits.
- Never rewrite or delete pushed tags/history (no force push unless the user asks).
- Commit/push only when the user asks or has agreed in advance.

## 5. Verify before saying "done"
- Checks: ${verifyLine}
- Fresh output with exit code 0 is required before reporting completion · if tests fail, report it with the output · if a step was skipped, say so.

## 6. Project context
- **Stack**: ${stackLine}
- **Key folders**: <!-- fill in -->
- **Databases / external systems that must stay read-only**: <!-- fill in -->
- **Business rules an AI cannot guess**: <!-- fill in -->
- **UI / language / theme**: <!-- fill in -->
`,
    pointer: `> All project rules live in @AGENTS.md (the shared file every AI tool uses) — read it first.`,
    summary: `Project rules (full version in AGENTS.md at the repo root — follow that file):
- Think before coding · write only what was asked · surgical changes, match existing style
- No truncated code / placeholders / \`// TODO\` · never claim completion without real verification output
- No secrets in code/commits · parameterized SQL · mask personal data · keep an audit trail for important changes
- Conventional Commits · never rewrite or delete pushed tags/history`,
  },
}[LANG];

/* ───────── เขียนไฟล์ ───────── */
const report = [];
const write = (rel, content) => {
  const abs = path.join(target, rel);
  const exists = fs.existsSync(abs);
  if (exists && !FORCE) return report.push(["ข้าม (มีอยู่แล้ว)", rel]);
  if (!DRY) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
  }
  report.push([exists ? "เขียนทับ" : "สร้าง", rel]);
};

/** ไฟล์ชี้ (CLAUDE.md/GEMINI.md): ถ้ามีอยู่แล้วเติมบรรทัดชี้ ไม่ลบเนื้อหาเดิม */
const pointerFile = (rel, title) => {
  const abs = path.join(target, rel);
  if (!fs.existsSync(abs)) return write(rel, `# ${title}\n\n${T.pointer}\n`);
  const cur = fs.readFileSync(abs, "utf8");
  if (/@AGENTS\.md/.test(cur)) return report.push(["ข้าม (ชี้ AGENTS.md แล้ว)", rel]);
  if (FORCE) return write(rel, `# ${title}\n\n${T.pointer}\n`);
  if (!DRY) {
    const eol = cur.includes("\r\n") ? "\r\n" : "\n";
    const lines = cur.split(/\r?\n/);
    const at = /^#\s/.test(lines[0]) ? 1 : 0; // ใต้หัวข้อแรกถ้ามี
    lines.splice(at, 0, "", T.pointer);
    fs.writeFileSync(abs, lines.join(eol), "utf8");
  }
  report.push(["เติมบรรทัดชี้ AGENTS.md", rel]);
};

write("AGENTS.md", T.agents);
pointerFile("CLAUDE.md", "CLAUDE.md");
pointerFile("GEMINI.md", "GEMINI.md");
write(".github/copilot-instructions.md", `# Copilot Instructions\n\n${T.summary}\n`);
write(".windsurfrules", `${T.summary}\n`);

console.log(`\nsetup-ai-rules → ${target}${DRY ? "  (dry-run: ยังไม่เขียนไฟล์)" : ""}`);
console.log(`Stack ที่ตรวจพบ: ${stack.join(", ") || "— (ไม่พบ ให้กรอกเอง)"}`);
console.log(`คำสั่งตรวจ: ${verify.join(" → ") || "— (ไม่พบ ให้กรอกเอง)"}\n`);
for (const [act, rel] of report) console.log(`  ${act.padEnd(26)} ${rel}`);
console.log(`\nขั้นต่อไป: เปิด AGENTS.md แล้วกรอกหมวด "Project Context" (ส่วนที่มี <!-- ... -->)\n`);
