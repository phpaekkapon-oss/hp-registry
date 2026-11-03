@echo off
chcp 65001 >nul
setlocal DisableDelayedExpansion
title ระบบงานพัสดุ - Deploy
cd /d "%~dp0"

rem ---- ตั้งค่า (แก้ได้ หรือกำหนดเป็น environment variable ก่อนรัน) ----
if not defined DEPLOY_HOST set "DEPLOY_HOST=192.168.1.241"
if not defined DEPLOY_PORT set "DEPLOY_PORT=22"
if not defined DEPLOY_USER set "DEPLOY_USER=srimuang"
if not defined DEPLOY_DIR  set "DEPLOY_DIR=/var/www/html/hp-registry"
if not defined DEPLOY_APP  set "DEPLOY_APP=hp-registry"
rem รหัสผ่านไม่เก็บในไฟล์: ตั้ง DEPLOY_PASSWORD ไว้ก่อนรัน หรือกรอกเมื่อถูกถาม

echo.
echo  ============================================================
echo   ระบบงานพัสดุ - Deploy ขึ้น %DEPLOY_USER%@%DEPLOY_HOST%:%DEPLOY_DIR%
echo  ============================================================
echo.

where node >nul 2>nul || (echo [ERROR] ไม่พบ Node.js & pause & exit /b 1)
if not exist "%SystemRoot%\System32\tar.exe" (echo [ERROR] ไม่พบ tar.exe ของ Windows & pause & exit /b 1)
set "PLINK=C:\Program Files\PuTTY\plink.exe"
set "PSCP=C:\Program Files\PuTTY\pscp.exe"
if not exist "%PLINK%" (echo [ERROR] ไม่พบ PuTTY ^(plink/pscp^) ที่ C:\Program Files\PuTTY & pause & exit /b 1)

if not defined DEPLOY_PASSWORD (
  for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "$s = Read-Host 'รหัสผ่าน SSH ของ %DEPLOY_USER%' -AsSecureString; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))"`) do set "DEPLOY_PASSWORD=%%P"
)
if not defined DEPLOY_PASSWORD (echo [ERROR] ไม่ได้กรอกรหัสผ่าน & pause & exit /b 1)

echo [1/5] Build frontend...
call npm run build
if errorlevel 1 (echo [ERROR] build ไม่ผ่าน & pause & exit /b 1)

echo [2/5] แพ็กไฟล์...
set "ARCHIVE=%TEMP%\%DEPLOY_APP%-deploy.tar.gz"
if exist "%ARCHIVE%" del "%ARCHIVE%"
"%SystemRoot%\System32\tar.exe" -czf "%ARCHIVE%" --exclude=node_modules --exclude=.env --exclude=.env.* --exclude=backups package.json package-lock.json backend frontend/package.json frontend/dist
if errorlevel 1 (echo [ERROR] แพ็กไฟล์ไม่สำเร็จ & pause & exit /b 1)

echo [3/5] เชื่อมต่อเซิร์ฟเวอร์...
rem บันทึก host key ครั้งแรกอัตโนมัติ
echo y | "%PLINK%" -ssh -P %DEPLOY_PORT% -pw "%DEPLOY_PASSWORD%" %DEPLOY_USER%@%DEPLOY_HOST% "mkdir -p %DEPLOY_DIR%" >nul 2>nul
"%PLINK%" -batch -ssh -P %DEPLOY_PORT% -pw "%DEPLOY_PASSWORD%" %DEPLOY_USER%@%DEPLOY_HOST% "mkdir -p %DEPLOY_DIR%"
if errorlevel 1 (echo [ERROR] เชื่อมต่อ/สร้างโฟลเดอร์บนเซิร์ฟเวอร์ไม่สำเร็จ & del "%ARCHIVE%" & pause & exit /b 1)

echo [4/5] อัปโหลด...
"%PSCP%" -batch -P %DEPLOY_PORT% -pw "%DEPLOY_PASSWORD%" "%ARCHIVE%" %DEPLOY_USER%@%DEPLOY_HOST%:/tmp/%DEPLOY_APP%-deploy.tar.gz
if errorlevel 1 (echo [ERROR] อัปโหลดไม่สำเร็จ & del "%ARCHIVE%" & pause & exit /b 1)
"%PSCP%" -batch -P %DEPLOY_PORT% -pw "%DEPLOY_PASSWORD%" "scripts\deploy-remote.sh" %DEPLOY_USER%@%DEPLOY_HOST%:/tmp/%DEPLOY_APP%-deploy-remote.sh
if errorlevel 1 (echo [ERROR] อัปโหลดสคริปต์ไม่สำเร็จ & del "%ARCHIVE%" & pause & exit /b 1)
del "%ARCHIVE%"

echo [5/5] ติดตั้งและรีสตาร์ท pm2...
"%PLINK%" -batch -ssh -P %DEPLOY_PORT% -pw "%DEPLOY_PASSWORD%" %DEPLOY_USER%@%DEPLOY_HOST% "bash -lc 'bash /tmp/%DEPLOY_APP%-deploy-remote.sh %DEPLOY_DIR% %DEPLOY_APP%; rc=$?; rm -f /tmp/%DEPLOY_APP%-deploy-remote.sh; exit $rc'"
if errorlevel 1 (echo. & echo [ERROR] ขั้นตอนบนเซิร์ฟเวอร์ล้มเหลว - ดูข้อความด้านบน & pause & exit /b 1)

echo.
echo  Deploy สำเร็จ - pm2 process: %DEPLOY_APP%
echo.
pause
exit /b 0
