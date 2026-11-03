# Veloce SaaS Workspace

โครงสร้างแบบ npm workspaces แยกหน้าบ้าน (`frontend/`) และหลังบ้าน (`backend/`) เป็นคนละแพ็กเกจ

```
├── frontend/                 # หน้าบ้าน: React 19 + Vite + Tailwind CSS
│   ├── public/               # Static assets (ฟอนต์ไทย Prompt & Sarabun แบบ offline)
│   ├── src/
│   │   ├── components/       # UI & Compound Components
│   │   ├── features/         # dashboard, users, reports
│   │   ├── layouts/          # Header, Sidebar, MobileBottomNav
│   │   ├── services/         # apiClient (เรียก /api/*), enterpriseService, themeService
│   │   ├── data/  lib/
│   │   ├── App.tsx  main.tsx  index.css
│   ├── index.html
│   ├── vite.config.ts        # dev proxy: /api -> http://localhost:3000
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── package.json
│
├── backend/                  # หลังบ้าน: Node.js + Express API
│   ├── src/
│   │   ├── routes/           # records, stats, health
│   │   ├── services/         # db (in-memory data layer)
│   │   ├── app.ts            # Express app + middleware
│   │   ├── server.ts         # Entrypoint (พอร์ต 3000)
│   │   └── types.ts
│   ├── .env.example
│   ├── tsconfig.json
│   └── package.json
│
├── package.json              # Workspace root + สคริปต์รวม
├── ARCHITECTURE.md
└── README.md
```

## Run Locally

**Prerequisites:** Node.js

1. ติดตั้ง dependencies (ครั้งเดียวจากโฟลเดอร์ราก): `npm install`
2. (ไม่บังคับในโหมดพัฒนา) คัดลอก `backend/.env.example` เป็น `backend/.env` เพื่อกำหนดรหัสผ่านเอง
3. รันทั้งสองฝั่ง: `npm run dev`
   - Frontend: http://localhost:5173 (proxy `/api` ไปหลังบ้านอัตโนมัติ)
   - Backend API: http://localhost:3000/api
4. เข้าสู่ระบบด้วยบัญชีทดสอบ (โหมดพัฒนาเท่านั้น): `admin` / `Admin@12345`, `doctor` / `Doctor@12345`, `staff` / `Staff@12345`

## Scripts

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run dev` | รัน frontend + backend พร้อมกัน |
| `npm run dev:frontend` / `npm run dev:backend` | รันแยกฝั่ง |
| `npm run build` | build frontend ไปที่ `frontend/dist` |
| `npm start` | รัน backend โหมด production (เสิร์ฟ `frontend/dist` ด้วย) ที่พอร์ต 3000 |
| `npm run lint` | ตรวจ TypeScript ทั้งสองฝั่ง |

## ระบบเข้าสู่ระบบ (Authentication & Authorization)

- เข้าสู่ระบบด้วยชื่อผู้ใช้/รหัสผ่าน เซิร์ฟเวอร์เก็บ session และส่งคุกกี้ `HttpOnly; SameSite=Lax` (และ `Secure` ใน production) เบราว์เซอร์ไม่เห็นรหัส session
- รหัสผ่านเก็บเป็น hash แบบ scrypt ไม่เก็บข้อความจริง
- `/api/records` และ `/api/stats` ต้องเข้าสู่ระบบ สิทธิ์ตรวจที่เซิร์ฟเวอร์: **Admin** ทำได้ทั้งหมด, **Doctor** ดู/เพิ่ม/แก้ไขได้, **Staff** ดูได้อย่างเดียวและข้อมูลส่วนบุคคลถูกซ่อนจากเซิร์ฟเวอร์
- ใส่รหัสผ่านผิด 5 ครั้งจะถูกล็อก 15 นาที, session หมดอายุเมื่อไม่ใช้งาน 30 นาที (สูงสุด 8 ชั่วโมง), หน้าเว็บออกจากระบบอัตโนมัติและล้างข้อมูลที่เก็บในเครื่องเมื่อออกจากระบบ
- ป้องกัน CSRF ด้วยการตรวจ Origin ต้องตรงกับ Host (ถ้าใช้ reverse proxy ที่เปลี่ยนชื่อ ให้ตั้ง `ALLOWED_ORIGINS`)

### Production

ตั้งค่า `ADMIN_PASSWORD`, `DOCTOR_PASSWORD`, `STAFF_PASSWORD` ใน `backend/.env` เซิร์ฟเวอร์จะไม่ยอมเริ่มทำงานถ้าไม่ตั้ง (ไม่มีรหัสผ่านเริ่มต้นใน production) และควรให้บริการผ่าน HTTPS

> บัญชีผู้ใช้ปัจจุบันเป็นรายการเล็กๆ ใน `backend/src/services/auth.ts` ถ้าหน่วยงานใช้ LDAP/AD, ThaiD หรือ OIDC ให้เปลี่ยนเฉพาะฟังก์ชัน `verifyCredentials` ส่วนอื่นของระบบไม่ต้องแก้

## ติดตั้งเป็นเว็บแอป (PWA)

ระบบติดตั้งลงอุปกรณ์เป็นแอปได้ (เปิดเป็นหน้าต่างเต็ม มีไอคอนบนหน้าจอโฮม/เดสก์ท็อป)

- **Chrome / Edge / Android:** หน้าล็อกอินมีปุ่ม "ติดตั้งเป็นแอปบนอุปกรณ์นี้" และมีเมนูเดียวกันในเมนูโปรไฟล์
- **iPhone / iPad (Safari):** แตะ "แชร์" แล้วเลือก "เพิ่มลงในหน้าจอโฮม" (iOS ไม่มีปุ่มติดตั้งให้เว็บเรียกเอง)
- **ต้องเปิดผ่าน HTTPS** (หรือ `localhost`) เบราว์เซอร์จึงจะยอมให้ติดตั้งและใช้ service worker ถ้าเปิดผ่านที่อยู่ `http://192.168.x.x` ในเครือข่ายภายใน จะติดตั้งไม่ได้ ให้ตั้ง HTTPS หน้าเซิร์ฟเวอร์ก่อน
- build จริง (`npm run build` แล้ว `npm start`) ใช้ service worker ที่เปิดหน้าได้ตอนออฟไลน์ ส่วนตอน `npm run dev` ใช้ service worker แบบเปล่าที่ไม่แคชอะไร (เพื่อให้ลองติดตั้งได้ระหว่างพัฒนา)
- service worker เก็บเฉพาะไฟล์หน้าเว็บ (HTML, JS, CSS, ฟอนต์, ไอคอน) **ไม่เก็บข้อมูลจาก `/api` เลย** เพื่อไม่ให้ข้อมูลผู้ป่วยค้างในแคช
- ถ้าอยากบังคับให้เครื่องผู้ใช้ทิ้งแคชเก่า ให้เพิ่มเลข `CACHE_VERSION` ใน `frontend/public/sw.js`
- ไอคอนอยู่ใน `frontend/public/icons/` และ manifest ที่ `frontend/public/manifest.webmanifest`

## งานพัสดุ: ทะเบียนคุมใบสั่ง/สัญญา (MySQL)

เมนู **งานพัสดุ** แทนไฟล์ Excel `[ปีงบ 2570] O16_ทะเบียนคุมใบสั่ง_สัญญา.xlsx` โดยเก็บข้อมูลใน MySQL ฐาน `dw_hp_procure` (เซิร์ฟเวอร์ `192.168.1.241:3306`)

| แท็บ | ตาราง | ชีตต้นฉบับ |
| --- | --- | --- |
| ทะเบียนใบสั่ง | `purchase_orders` | ทะเบียนใบสั่ง |
| ทะเบียนสัญญา | `contracts` | ทะเบียนสัญญา |
| ทะเบียนหนังสือรับ | `incoming_docs` | ทะเบียนหนังสือรับ |
| หลักประกันสัญญา | `contract_guarantees` | ทะเบียนคุมหลักประกันสัญญา |
| ความก้าวหน้า | `progress_projects`, `progress_step_dates`, `progress_steps_ref` | ความก้าวหน้า (17 ขั้นตอน) |
| รายงานสรุป | `report_notes` + สรุปจากใบสั่ง/สัญญา | รายงานสรุป |
| (ตัวเลือก dropdown) | `ref_lookup` | x |

ตั้งค่า `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` ใน `backend/.env` (ดู `.env.example`) แล้วรัน:

```
npm run db:init -w backend                      # สร้างฐานข้อมูล/ตาราง/ข้อมูลตัวเลือก (รันซ้ำได้)
npm run db:import -w backend -- "<ไฟล์.xlsx>"   # นำเข้าข้อมูลจาก Excel (เพิ่ม --replace เพื่อล้างแล้วนำเข้าใหม่)
```

หมายเหตุ

- เซิร์ฟเวอร์ MySQL ตัวนี้บังคับ connection charset เป็น `tis620` โค้ดจึงสั่ง `SET NAMES utf8mb4` ทุกการเชื่อมต่อ (`backend/src/services/mysql.ts`) ถ้าเขียนสคริปต์อื่นต่อฐานนี้ต้องทำเหมือนกัน ไม่เช่นนั้นภาษาไทยจะเพี้ยน
- ใน Excel วันที่พิมพ์เป็นปี พ.ศ. ในปฏิทิน ค.ศ. (2569 หรือ 1969) ตัวนำเข้าแปลงเป็น ค.ศ. จริงเก็บในฐานข้อมูล และหน้าเว็บแสดงเป็น พ.ศ.
- สิทธิ์: Admin ทำได้ทั้งหมด, Doctor เพิ่ม/แก้ไขได้, Staff ดูได้อย่างเดียว และเลขประจำตัวผู้เสียภาษีถูกซ่อนจากเซิร์ฟเวอร์
- API: `/api/procure/{orders|contracts|incoming|guarantees|progress|summary|lookups}`

### ตารางข้อมูล

ตารางของแท็บทะเบียน (ใบสั่ง/สัญญา/หนังสือรับ/หลักประกัน) ใช้ `DataTable` กลางที่ `frontend/src/components/ui/data-table.tsx` สร้างด้วย **TanStack Table v8** และแสดงผลด้วยคอมโพเนนต์ตารางสไตล์ shadcn/ui (`ui/table.tsx`) รองรับเรียงลำดับ แบ่งหน้า (25/50/100 แถว) และเลือกซ่อน/แสดงคอลัมน์ ถ้าจะเพิ่มทะเบียนใหม่ให้นิยามคอลัมน์ใน `features/procure/fields.ts` แล้วใช้ `RegistryTab` ได้เลย

### เมนูเดิมของแม่แบบ (ทะเบียนผู้ป่วย / ภาพรวม / งบประมาณ)

ซ่อนไว้ตามค่าเริ่มต้นเพราะไม่เกี่ยวกับงานพัสดุ (โค้ดยังอยู่) ถ้าต้องการเปิดกลับให้ตั้ง `SHOW_DEMO_MODULES = true` ใน `frontend/src/services/enterpriseService.ts`

### วันที่ เวลาไทย และ Excel

- ช่องวันที่ทุกช่องใช้ปฏิทินไทย (`frontend/src/components/ui/thai-date-picker.tsx`): แสดงปี พ.ศ. พิมพ์ `วว/ดด/ปปปป` ได้ (ปี 2400 ขึ้นไปอ่านเป็น พ.ศ.) และใช้คีย์บอร์ดได้ (ลูกศร, PageUp/PageDown, Home/End, Enter) ค่าที่เก็บในฐานข้อมูลเป็น ค.ศ. (`YYYY-MM-DD`)
- "วันนี้" และการคำนวณเลยกำหนด ใช้เวลาประเทศไทย (Asia/Bangkok, UTC+7) เสมอ ไม่ขึ้นกับนาฬิกาเครื่องผู้ใช้ และ MySQL session ตั้ง `time_zone = '+07:00'`
- ตัวกรองช่วงวันที่เลือกได้ทั้งฟิลด์วันที่ (ลงวันที่/รับเรื่อง/อนุมัติ/ตรวจรับ/ส่งเบิก) และช่วงสำเร็จรูป (ไตรมาสและปีงบประมาณคิดจาก 1 ต.ค. – 30 ก.ย.)
- ปุ่ม **ส่งออก → Excel (.xlsx)** ส่งออกตามตัวกรองที่เลือก ส่วน **ส่งออก Excel ทุกทะเบียน** รวมทุกทะเบียนเป็นหลายชีตในไฟล์เดียว วันที่ในไฟล์เป็นข้อความ พ.ศ. (เช่น `23 ต.ค. 2569`) เพื่อไม่ให้ Excel แสดงปีผิด ส่วนจำนวนเงินเป็นตัวเลขจริง

### ธีมและโหมดมืด (ส่วนงานพัสดุ)

สีของช่องกรอก เมนูเลือก ปุ่ม และหัวตาราง อ้างอิงตัวแปร `--pf-*` ใน `frontend/src/index.css` ซึ่งดึงจากโทนสีพื้นผิวของแอปทั้งโหมดสว่าง/มืด ถ้าจะปรับโทนให้แก้ที่ตัวแปรเหล่านี้ที่เดียว เมนูเลือกใช้ `components/ui/select.tsx` (Radix Select) แทน `<select>` ของเบราว์เซอร์
