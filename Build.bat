@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ระบบงานพัสดุ (hp-registry) - สร้างระบบ (Build)

echo.
echo =======================================================
echo   ระบบงานพัสดุ (hp-registry) - สร้างระบบ (Build)
echo =======================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] ไม่พบ Node.js ในเครื่องนี้ กรุณาติดตั้ง Node.js
    goto :fail
)
where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] ไม่พบ npm ในเครื่องนี้
    goto :fail
)

for /f "delims=" %%v in ('node -v') do echo   Node.js : %%v
for /f "delims=" %%v in ('npm -v') do  echo   npm     : %%v
for /f "usebackq delims=" %%v in (`node -p "require('./package.json').version"`) do echo   Version : v%%v
echo.

echo [1/3] ตรวจสอบ dependencies...
if not exist "node_modules" (
    echo       กำลังติดตั้งไลบรารีที่จำเป็น...
    call npm install || goto :fail
)
echo       [OK] ไลบรารีครบถ้วน
echo.

echo [2/3] ตรวจสอบความถูกต้องของโค้ด (TypeScript / Lint)...
call npm run lint || goto :fail
echo       [OK] ผ่านการตรวจสอบไวยากรณ์โค้ด (Lint ผ่าน 100%%)
echo.

echo [3/3] กำลังสร้างไฟล์หน้าเว็บ (Build Frontend)...
call npm run build || goto :fail
if not exist "frontend\dist\index.html" (
    echo [ERROR] ไม่พบไฟล์ frontend\dist\index.html หลังการ build
    goto :fail
)
echo       [OK] สร้างไฟล์ frontend\dist สำเร็จ
echo.

echo =======================================================
echo   ✔ BUILD SUCCESSFUL (สร้างระบบสำเร็จสมบูรณ์แล้ว)
echo =======================================================
echo.
echo   ไฟล์พร้อมสำหรับนำขึ้นเซิร์ฟเวอร์
echo   (รัน deploy.bat เพื่อนำระบบขึ้นเซิร์ฟเวอร์จริง)
echo.
pause
exit /b 0

:fail
echo.
echo =======================================================
echo   ✖ BUILD FAILED (เกิดข้อผิดพลาดในการ Build)
echo =======================================================
echo   กรุณาตรวจสอบข้อความแจ้งเตือนด้านบนเพื่อแก้ไข
echo.
pause
exit /b 1
