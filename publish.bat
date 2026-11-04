@echo off
REM ==================================================
REM  hp-registry - ปุ่มเดียวจบ: ตรวจโค้ด -> ออกเวอร์ชัน + ส่งขึ้น GitHub -> deploy ขึ้นเซิร์ฟเวอร์
REM  วิธีใช้: publish.bat 1.0.2      (หรือดับเบิลคลิกแล้วพิมพ์เลขเวอร์ชัน)
REM  ก่อนรัน ให้เพิ่มรายการเวอร์ชันใหม่ใน frontend\src\data\changelog.ts
REM ==================================================
chcp 65001 >nul
title ระบบงานพัสดุ - Publish
cd /d "%~dp0"

where node >nul 2>nul || (echo [ERROR] ไม่พบ Node.js & pause & exit /b 1)
where git >nul 2>nul || (echo [ERROR] ไม่พบ git & pause & exit /b 1)

set "VER=%~1"
if "%VER%"=="" (
  for /f "usebackq delims=" %%v in (`node -p "require('./package.json').version"`) do echo เวอร์ชันปัจจุบัน: %%v
  set /p "VER=พิมพ์เลขเวอร์ชันใหม่ (เช่น 1.0.2): "
)
if "%VER%"=="" (echo [ERROR] ยังไม่ได้ระบุเวอร์ชัน & pause & exit /b 1)

echo.
echo ===== 1/3 ตรวจโค้ด =====
call npm run lint
if errorlevel 1 (echo [ERROR] lint ไม่ผ่าน หยุดการทำงาน & pause & exit /b 1)

echo.
echo ===== 2/3 ออกเวอร์ชัน %VER% และส่งขึ้น GitHub =====
node scripts\release.mjs %VER%
if errorlevel 1 (echo [ERROR] ออกเวอร์ชันไม่สำเร็จ ยังไม่ได้ deploy & pause & exit /b 1)

echo.
echo ===== 3/3 Deploy ขึ้นเซิร์ฟเวอร์ =====
node scripts\deploy.cjs
if errorlevel 1 (echo [ERROR] deploy ไม่สำเร็จ (เวอร์ชันถูกส่งขึ้น GitHub แล้ว) & pause & exit /b 1)

echo.
echo ---------- สถานะเซิร์ฟเวอร์หลัง deploy ----------
node scripts\status.cjs

echo.
echo [DONE] เวอร์ชัน %VER% เผยแพร่เรียบร้อย
pause
