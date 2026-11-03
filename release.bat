@echo off
chcp 65001 >nul
title ระบบงานพัสดุ - Release
cd /d "%~dp0"

if "%~1"=="" (
  echo วิธีใช้: release.bat X.Y.Z   เช่น release.bat 1.0.1
  echo ก่อนรัน ให้เพิ่มรายการเวอร์ชันนั้นใน frontend\src\data\changelog.ts
  pause
  exit /b 1
)

where git >nul 2>nul || (echo [ERROR] ไม่พบ git & pause & exit /b 1)
where node >nul 2>nul || (echo [ERROR] ไม่พบ Node.js & pause & exit /b 1)

call npm run lint
if errorlevel 1 (echo [ERROR] lint ไม่ผ่าน & pause & exit /b 1)
call npm run build
if errorlevel 1 (echo [ERROR] build ไม่ผ่าน & pause & exit /b 1)

node scripts\release.mjs %~1
if errorlevel 1 (pause & exit /b 1)
pause
