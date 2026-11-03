# Full-Stack Folder Architecture (แยกหน้าบ้าน - หลังบ้าน)

โปรเจกต์ใช้ npm workspaces: `frontend` และ `backend` เป็นแพ็กเกจอิสระ มี `package.json`, `tsconfig.json` และ dependencies ของตัวเอง

```
├── frontend/                    # 🎨 หน้าบ้าน (React 19 + Vite + Tailwind CSS)
│   ├── public/fonts/            # ฟอนต์ไทย .woff2 (Offline Ready)
│   ├── src/
│   │   ├── components/          # UI Components (compound, ui, ClayAlertModal)
│   │   ├── features/            # dashboard / users / reports
│   │   ├── layouts/             # Header, Sidebar, Mobile Bottom Nav
│   │   ├── services/            # apiClient.ts (เรียก /api/*), enterpriseService.ts, themeService.ts
│   │   ├── data/                # Local datasets
│   │   ├── lib/                 # cn(), helpers
│   │   ├── App.tsx / main.tsx / index.css
│   ├── index.html
│   ├── vite.config.ts           # dev server :5173, proxy /api -> backend :3000
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── package.json
│
├── backend/                     # 🖥️ หลังบ้าน (Node.js + Express API)
│   ├── src/
│   │   ├── routes/              # records.ts, stats.ts, health.ts
│   │   ├── services/db.ts       # Data layer (in-memory)
│   │   ├── app.ts               # Express app & middleware
│   │   ├── server.ts            # Entrypoint (mount /api, เสิร์ฟ frontend/dist ใน production)
│   │   └── types.ts
│   ├── .env.example
│   ├── tsconfig.json
│   └── package.json
│
└── package.json                 # Workspace root (สคริปต์รวม: dev, build, start, lint)
```

## การทำงาน
- **Development** (`npm run dev`): backend รันที่ `:3000` (`/api/*`), frontend รันที่ `:5173` และ proxy `/api` ไป backend
- **Production** (`npm run build` แล้ว `npm start`): backend เสิร์ฟ API ที่ `/api` และไฟล์ static จาก `frontend/dist` ที่พอร์ตเดียว
- **Data flow**: `frontend/src/services/apiClient.ts` → `/api/*` → `backend/src/routes/*` → `backend/src/services/db.ts` (มี offline fallback ฝั่ง frontend)
