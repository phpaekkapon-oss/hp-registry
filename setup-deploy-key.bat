@echo off
chcp 65001 >nul
setlocal DisableDelayedExpansion
title ระบบงานพัสดุ - ตั้งค่ากุญแจ SSH (ทำครั้งเดียว)
cd /d "%~dp0"

if not defined DEPLOY_HOST set "DEPLOY_HOST=192.168.1.241"
if not defined DEPLOY_PORT set "DEPLOY_PORT=22"
if not defined DEPLOY_USER set "DEPLOY_USER=srimuang"

set "SSH=%SystemRoot%\System32\OpenSSH\ssh.exe"
set "KEYGEN=%SystemRoot%\System32\OpenSSH\ssh-keygen.exe"
set "KEY=%USERPROFILE%\.ssh\hp-registry-deploy"

for /f %%e in ('echo prompt $E^| cmd') do set "ESC=%%e"
set "C_RST=%ESC%[0m"
set "C_TITLE=%ESC%[1;36m"
set "C_OK=%ESC%[1;32m"
set "C_ERR=%ESC%[1;31m"
set "C_DIM=%ESC%[90m"

echo.
echo %C_TITLE%  ตั้งค่ากุญแจ SSH สำหรับ Deploy (ทำครั้งเดียว)%C_RST%
echo %C_DIM%  หลังจากนี้ deploy.bat จะไม่ถามรหัสผ่านอีก%C_RST%
echo %C_DIM%  ระบบจะถามรหัสผ่านของ %DEPLOY_USER%@%DEPLOY_HOST% หนึ่งครั้ง (พิมพ์แล้วไม่แสดงตัวอักษร)%C_RST%
echo.

if not exist "%SSH%" (echo %C_ERR%  ✖ ไม่พบ OpenSSH ของ Windows%C_RST% & pause & exit /b 1)
if not exist "%USERPROFILE%\.ssh" mkdir "%USERPROFILE%\.ssh"

if not exist "%KEY%" (
  "%KEYGEN%" -t ed25519 -N "" -C "hp-registry-deploy" -f "%KEY%" -q
  if errorlevel 1 (echo %C_ERR%  ✖ สร้างกุญแจไม่สำเร็จ%C_RST% & pause & exit /b 1)
  echo %C_OK%  ✔ สร้างกุญแจใหม่แล้ว%C_RST%
)

type "%KEY%.pub" | "%SSH%" -p %DEPLOY_PORT% -o StrictHostKeyChecking=accept-new %DEPLOY_USER%@%DEPLOY_HOST% "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
if errorlevel 1 (echo. & echo %C_ERR%  ✖ ติดตั้งกุญแจบนเซิร์ฟเวอร์ไม่สำเร็จ ตรวจสอบรหัสผ่านและเครือข่าย%C_RST% & pause & exit /b 1)

echo.
echo %C_OK%  ✔ ตั้งค่าเรียบร้อย ต่อไปรัน deploy.bat ได้เลยโดยไม่ต้องกรอกรหัสผ่าน%C_RST%
echo.
pause
