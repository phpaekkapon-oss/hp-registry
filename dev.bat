@echo off
chcp 65001 >nul
title ระบบงานพัสดุ - Dev Server
cd /d "%~dp0"

echo.
echo  ============================================================
echo   ระบบงานพัสดุ - กองโรคติดต่อทั่วไป กรมควบคุมโรค
echo   Development Server Launcher
echo  ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] ไม่พบ Node.js - กรุณาติดตั้งก่อน: https://nodejs.org
  pause
  exit /b 1
)

if not exist "backend\.env" (
  echo [WARN] ไม่พบ backend\.env
  echo        กรุณา copy backend\.env.example เป็น backend\.env แล้วกรอกค่า DB
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/3] ติดตั้ง dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install ล้มเหลว
    pause
    exit /b 1
  )
)

echo [2/3] ล้าง process เก่าที่อาจค้างอยู่ (ป้องกัน port conflict)...
node scripts/dev.mjs --kill >nul 2>nul

echo [3/3] เริ่มต้น backend และ frontend...
echo        พอร์ตจะถูกเลือกอัตโนมัติ (จำไว้ใน .dev-ports.json)
echo        เบราว์เซอร์จะเปิดอัตโนมัติเมื่อพร้อม
echo.

rem scripts\dev.mjs: ตรวจพอร์ตว่าง, ล้าง orphan process, เปิด browser อัตโนมัติ
call npm run dev
pause
