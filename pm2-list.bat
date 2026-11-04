@echo off
REM ==================================================
REM  hp-registry - List all PM2 services on the server (read-only)
REM ==================================================
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js 18+
    pause
    exit /b 1
)

node "%~dp0scripts\pm2-list.cjs"
set "RC=%ERRORLEVEL%"
pause
exit /b %RC%
