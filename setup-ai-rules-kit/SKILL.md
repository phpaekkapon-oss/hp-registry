---
name: setup-ai-rules
description: ติดตั้งไฟล์กฎ AI ชุดเดียวให้ทุกเครื่องมือ (Claude Code, Cursor, Copilot, Gemini, Windsurf, Codex) ในโปรเจกต์ใดก็ได้ — สร้าง AGENTS.md เป็นไฟล์กลาง + ไฟล์ชี้ของแต่ละ AI ตรวจ stack อัตโนมัติ ไม่ทับไฟล์เดิม. ใช้เมื่อผู้ใช้ขอ "ตั้งกฎ AI", "ติดตั้ง AGENTS.md", "setup rules", "ทำให้ AI ทุกตัวใช้กฎเดียวกัน" หรือเริ่มโปรเจกต์ใหม่
---

# setup-ai-rules

ติดตั้งกฎ AI ที่ใช้ได้ทุกโปรเจกต์ โดยให้ `AGENTS.md` เป็นไฟล์กลางไฟล์เดียว แล้วสร้างไฟล์ชี้ให้ AI ตัวอื่น

## ไฟล์ที่ติดตั้ง

| ไฟล์ | AI ที่อ่าน | วิธี |
|---|---|---|
| `AGENTS.md` | Cursor, Codex, Copilot (agent), Windsurf, อื่น ๆ | ไฟล์กลาง (เนื้อหาจริง) |
| `CLAUDE.md` | Claude Code | `@AGENTS.md` |
| `GEMINI.md` | Gemini CLI | `@AGENTS.md` |
| `.github/copilot-instructions.md` | GitHub Copilot (chat) | สรุปกฎหลัก + ชี้ไป AGENTS.md |
| `.windsurfrules` | Windsurf รุ่นเก่า | สรุปกฎหลัก + ชี้ไป AGENTS.md |

## วิธีใช้

1. รันที่โฟลเดอร์รากของโปรเจกต์ (หรือระบุ path):
   ```
   node ~/.claude/skills/setup-ai-rules/install.mjs [โฟลเดอร์โปรเจกต์] [--dry-run] [--force] [--lang=th|en]
   ```
   - `--dry-run` ดูว่าจะสร้าง/ข้ามอะไรโดยยังไม่เขียนไฟล์
   - `--force` เขียนทับไฟล์ที่มีอยู่ (ค่าปริยาย = ไม่ทับ ข้ามและรายงาน)
   - `--lang=en` สร้างเนื้อหาเป็นภาษาอังกฤษ (ค่าปริยายเป็นไทย)
2. สคริปต์ตรวจ stack จาก `package.json`, `requirements.txt`, `pyproject.toml`, `*.csproj`, `go.mod`, `Cargo.toml`, `pom.xml` และเติมบรรทัด Stack + คำสั่ง verify (typecheck/test/build) ให้
3. เปิด `AGENTS.md` แล้วกรอกหมวด **Project Context** (ส่วนที่มี `<!-- กรอก -->`) — ส่วนนี้ AI เดาเองไม่ได้ เช่น ฐานข้อมูลที่ห้ามเขียน กฎธุรกิจ ธีม/ภาษา UI

## ข้อควรทำเมื่อผู้ใช้เรียก skill นี้

- รันด้วย `--dry-run` ก่อน แสดงผลให้ผู้ใช้ดู แล้วค่อยรันจริง
- ถ้าโปรเจกต์มี `AGENTS.md` / `CLAUDE.md` อยู่แล้ว **ห้ามใช้ `--force`** เว้นแต่ผู้ใช้ขอ — สคริปต์จะเติมเฉพาะบรรทัดชี้ `@AGENTS.md` ให้ `CLAUDE.md`/`GEMINI.md` เดิมโดยไม่ลบเนื้อหา
- หลังติดตั้ง ช่วยผู้ใช้กรอก Project Context จากสิ่งที่อ่านได้ในโปรเจกต์ (README, โครงสร้างโฟลเดอร์, config) และบอกชัดว่าส่วนไหนเดาเอง
- ไม่ต้อง commit เองถ้าผู้ใช้ไม่ได้สั่ง
