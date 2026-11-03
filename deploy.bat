@echo off
chcp 65001 >nul
setlocal DisableDelayedExpansion
title ระบบงานพัสดุ - นำระบบขึ้นเซิร์ฟเวอร์
cd /d "%~dp0"

rem ---- ตั้งค่า (แก้ได้ หรือกำหนดเป็น environment variable ก่อนรัน) ----
if not defined DEPLOY_HOST set "DEPLOY_HOST=192.168.1.241"
if not defined DEPLOY_PORT set "DEPLOY_PORT=22"
if not defined DEPLOY_USER set "DEPLOY_USER=srimuang"
if not defined DEPLOY_DIR  set "DEPLOY_DIR=/var/www/html/hp-registry"
if not defined DEPLOY_APP  set "DEPLOY_APP=hp-registry"
rem เข้าสู่ระบบด้วยกุญแจ SSH (ตั้งค่าครั้งเดียวด้วย setup-deploy-key.bat) จึงไม่ต้องกรอกรหัสผ่าน

rem ---- สีตัวอักษร (ANSI) ----
for /f %%e in ('echo prompt $E^| cmd') do set "ESC=%%e"
set "C_RST=%ESC%[0m"
set "C_TITLE=%ESC%[1;36m"
set "C_STEP=%ESC%[1;34m"
set "C_OK=%ESC%[1;32m"
set "C_ERR=%ESC%[1;31m"
set "C_WARN=%ESC%[1;33m"
set "C_DIM=%ESC%[90m"

echo.
echo %C_TITLE%  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%C_RST%
echo %C_TITLE%   ระบบงานพัสดุ  ·  นำระบบขึ้นเซิร์ฟเวอร์ (Deploy)%C_RST%
echo %C_TITLE%  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%C_RST%
echo %C_DIM%   ปลายทาง : %DEPLOY_USER%@%DEPLOY_HOST%:%DEPLOY_DIR%%C_RST%
echo %C_DIM%   โปรเซส  : pm2 / %DEPLOY_APP%%C_RST%
echo.

set "SSH=%SystemRoot%\System32\OpenSSH\ssh.exe"
set "SCP=%SystemRoot%\System32\OpenSSH\scp.exe"
set "TAR=%SystemRoot%\System32\tar.exe"
set "KEY=%USERPROFILE%\.ssh\hp-registry-deploy"
set "SSHOPT=-i "%KEY%" -o BatchMode=yes -o StrictHostKeyChecking=accept-new"

where node >nul 2>nul || (call :fail "ไม่พบ Node.js ในเครื่องนี้ กรุณาติดตั้งก่อน" & exit /b 1)
if not exist "%TAR%" (call :fail "ไม่พบ tar.exe ของ Windows" & exit /b 1)
if not exist "%SSH%" (call :fail "ไม่พบ OpenSSH ของ Windows" & exit /b 1)
if not exist "%KEY%" (call :fail "ยังไม่ได้ตั้งค่ากุญแจ SSH กรุณารัน setup-deploy-key.bat หนึ่งครั้งก่อน" & exit /b 1)

call :step "1/5" "สร้างหน้าเว็บ (Build)"
call npm run build
if errorlevel 1 (call :fail "สร้างหน้าเว็บไม่ผ่าน กรุณาตรวจสอบข้อผิดพลาดด้านบน" & exit /b 1)
call :ok "สร้างหน้าเว็บสำเร็จ"

call :step "2/5" "รวมไฟล์เป็นแพ็กเกจ"
set "ARCHIVE=%TEMP%\%DEPLOY_APP%-deploy.tar.gz"
if exist "%ARCHIVE%" del "%ARCHIVE%"
"%TAR%" -czf "%ARCHIVE%" --exclude=node_modules --exclude=.env --exclude=.env.* --exclude=backups package.json package-lock.json backend frontend/package.json frontend/dist
if errorlevel 1 (call :fail "รวมไฟล์ไม่สำเร็จ" & exit /b 1)
call :ok "รวมไฟล์เรียบร้อย"

call :step "3/5" "เชื่อมต่อเซิร์ฟเวอร์"
"%SSH%" %SSHOPT% -p %DEPLOY_PORT% %DEPLOY_USER%@%DEPLOY_HOST% "mkdir -p %DEPLOY_DIR%"
if errorlevel 1 (del "%ARCHIVE%" & call :fail "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ตรวจสอบ IP เครือข่าย หรือรัน setup-deploy-key.bat ใหม่" & exit /b 1)
call :ok "เชื่อมต่อสำเร็จ"

call :step "4/5" "อัปโหลดไฟล์ขึ้นเซิร์ฟเวอร์"
"%SCP%" %SSHOPT% -P %DEPLOY_PORT% "%ARCHIVE%" %DEPLOY_USER%@%DEPLOY_HOST%:/tmp/%DEPLOY_APP%-deploy.tar.gz
if errorlevel 1 (del "%ARCHIVE%" & call :fail "อัปโหลดแพ็กเกจไม่สำเร็จ" & exit /b 1)
"%SCP%" %SSHOPT% -P %DEPLOY_PORT% "scripts\deploy-remote.sh" %DEPLOY_USER%@%DEPLOY_HOST%:/tmp/%DEPLOY_APP%-deploy-remote.sh
if errorlevel 1 (del "%ARCHIVE%" & call :fail "อัปโหลดสคริปต์ติดตั้งไม่สำเร็จ" & exit /b 1)
del "%ARCHIVE%"
call :ok "อัปโหลดเรียบร้อย"

call :step "5/5" "ติดตั้งและรีสตาร์ทระบบ (pm2) บนเซิร์ฟเวอร์"
"%SSH%" %SSHOPT% -p %DEPLOY_PORT% %DEPLOY_USER%@%DEPLOY_HOST% "bash -lc 'bash /tmp/%DEPLOY_APP%-deploy-remote.sh %DEPLOY_DIR% %DEPLOY_APP%; rc=$?; rm -f /tmp/%DEPLOY_APP%-deploy-remote.sh; exit $rc'"
if errorlevel 1 (call :fail "ขั้นตอนบนเซิร์ฟเวอร์ไม่สำเร็จ ดูรายละเอียดข้อความด้านบน" & exit /b 1)

echo.
echo %C_OK%  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%C_RST%
echo %C_OK%   ✔  นำระบบขึ้นเซิร์ฟเวอร์เรียบร้อยแล้ว%C_RST%
echo %C_OK%  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%C_RST%
echo.
pause
exit /b 0

:step
echo.
echo %C_STEP%  ■ ขั้นตอนที่ %~1  %~2%C_RST%
exit /b 0

:ok
echo %C_OK%    ✔ %~1%C_RST%
exit /b 0

:fail
echo.
echo %C_ERR%  ✖ เกิดข้อผิดพลาด: %~1%C_RST%
echo %C_WARN%    การนำระบบขึ้นเซิร์ฟเวอร์ถูกยกเลิก แก้ไขปัญหาแล้วรันใหม่ได้อีกครั้ง%C_RST%
echo.
pause
exit /b 1
