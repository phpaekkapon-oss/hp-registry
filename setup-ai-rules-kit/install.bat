@echo off
setlocal EnableExtensions
chcp 65001 >nul
title setup-ai-rules installer

rem ===================================================================
rem  setup-ai-rules  -  install.bat   (ปุ่มเดียวจบ)
rem  1) ติดตั้ง skill เข้า Claude Code  (USERPROFILE\.claude\skills)
rem  2) สร้างกฎ AI (AGENTS.md ฯลฯ) ลงโปรเจกต์ — หาโฟลเดอร์โปรเจกต์ให้เอง
rem
rem  วิธีใช้ที่ง่ายที่สุด:
rem    วาง install.bat + install.mjs + SKILL.md ไว้ในโปรเจกต์ (โฟลเดอร์ไหนก็ได้ข้างใน)
rem    แล้วดับเบิลคลิก install.bat  ->  ติดตั้งลงโปรเจกต์นั้นทันที ไม่ต้องพิมพ์อะไร
rem    (หาโปรเจกต์โดยเดินขึ้นไปหาโฟลเดอร์ที่มี .git / package.json ฯลฯ)
rem
rem  ทางเลือก:
rem    install.bat C:\path\to\project    ระบุโปรเจกต์เอง
rem    install.bat . --dry-run           ดูก่อน ยังไม่เขียนไฟล์ (. = โฟลเดอร์ปัจจุบัน)
rem    ตัวเลือก: --dry-run   --force   --lang en
rem ===================================================================

set "KIT=%~dp0"
set "SKILL_DIR=%USERPROFILE%\.claude\skills\setup-ai-rules"
set "TARGET="
set "AUTO=0"
set "FLAGS="
set "PAUSE_END=0"

rem เปิดด้วยดับเบิลคลิก (ไม่ได้รันจาก cmd) -> หยุดรอก่อนปิดหน้าต่าง
echo %cmdcmdline% | "%SystemRoot%\System32\find.exe" /i "%~nx0" >nul && set "PAUSE_END=1"

:parse
if "%~1"=="" goto parsed
set "A=%~1"
if /i "%A%"=="--lang" goto lang
if "%A:~0,2%"=="--" goto flag
set "TARGET=%~1"
shift
goto parse

:flag
set "FLAGS=%FLAGS% %~1"
shift
goto parse

:lang
rem cmd ตัด --lang=en เป็นสองอาร์กิวเมนต์ ประกอบกลับเป็น --lang=en
set "FLAGS=%FLAGS% --lang=%~2"
shift
shift
goto parse

:parsed
where node >nul 2>nul
if errorlevel 1 goto nonode
if not exist "%KIT%install.mjs" goto nofile
if not exist "%KIT%SKILL.md" goto nofile

echo.
echo [1/2] ติดตั้ง skill setup-ai-rules เข้า Claude Code
if not exist "%SKILL_DIR%" mkdir "%SKILL_DIR%"
copy /y "%KIT%SKILL.md" "%SKILL_DIR%\SKILL.md" >nul
if errorlevel 1 goto copyfail
copy /y "%KIT%install.mjs" "%SKILL_DIR%\install.mjs" >nul
if errorlevel 1 goto copyfail
echo      OK  %SKILL_DIR%

if defined TARGET goto havetarget

rem ไม่ระบุ path -> เดินขึ้นไปหาโฟลเดอร์โปรเจกต์จากตำแหน่งของไฟล์นี้
rem ลำดับความสำคัญ: .git ก่อน แล้วค่อยไฟล์โปรเจกต์อื่น
for %%M in (.git package.json pyproject.toml requirements.txt go.mod Cargo.toml pom.xml composer.json) do (
  if not defined TARGET call :walk "%%M"
)
if defined TARGET set "AUTO=1"
if defined TARGET goto havetarget

rem ไม่พบโปรเจกต์ (เช่น วางไว้ที่ Desktop) -> ถามเอง
echo.
set /p "TARGET=[2/2] ไม่พบโปรเจกต์ พิมพ์ path โปรเจกต์ที่จะติดตั้งกฎ (เว้นว่าง = ข้าม): "
set "TARGET=%TARGET:"=%"
if not defined TARGET goto skip

:havetarget
if "%TARGET:~-1%"=="\" if not "%TARGET:~-2%"==":\" set "TARGET=%TARGET:~0,-1%"
echo.
if "%AUTO%"=="1" goto autoMsg
echo [2/2] ติดตั้งกฎ AI ลงโปรเจกต์: %TARGET%
goto runit
:autoMsg
echo [2/2] พบโปรเจกต์ ติดตั้งกฎ AI ให้อัตโนมัติ: %TARGET%
:runit
node "%KIT%install.mjs" "%TARGET%"%FLAGS%
if errorlevel 1 goto runfail
goto done

:skip
echo      ข้ามขั้นตอนที่ 2
goto done

:nonode
echo.
echo [X] ไม่พบ Node.js ในเครื่องนี้
echo     ดาวน์โหลดและติดตั้งที่ https://nodejs.org แล้วรันไฟล์นี้อีกครั้ง
goto fail

:nofile
echo.
echo [X] ไม่พบ install.mjs หรือ SKILL.md ในโฟลเดอร์เดียวกับไฟล์นี้
echo     ต้องเก็บไฟล์ทั้ง 3 ไว้ด้วยกัน: install.bat  install.mjs  SKILL.md
goto fail

:copyfail
echo.
echo [X] คัดลอกไฟล์เข้า %SKILL_DIR% ไม่สำเร็จ
goto fail

:runfail
echo.
echo [X] ติดตั้งกฎลงโปรเจกต์ไม่สำเร็จ ดูข้อความด้านบน
goto fail

:done
echo.
echo เสร็จแล้ว  เปิดไฟล์ AGENTS.md แล้วกรอกหมวด Project Context  (ไฟล์ที่มีอยู่เดิมไม่ถูกทับ)
echo ใน Claude Code พิมพ์ "ติดตั้งกฎ AI" ได้ในทุกโปรเจกต์
if "%PAUSE_END%"=="1" pause
exit /b 0

:fail
if "%PAUSE_END%"=="1" pause
exit /b 1

rem ---- :walk "ชื่อไฟล์"  เดินขึ้นจากโฟลเดอร์ของไฟล์นี้ ถ้าเจอไฟล์/โฟลเดอร์นั้นให้ตั้ง TARGET ----
:walk
set "D=%KIT:~0,-1%"
:walkup
if exist "%D%\%~1" (
  set "TARGET=%D%"
  exit /b 0
)
for %%I in ("%D%") do set "P=%%~dpI"
set "P=%P:~0,-1%"
if "%P:~-1%"==":" exit /b 0
if /i "%P%"=="%D%" exit /b 0
set "D=%P%"
goto walkup
