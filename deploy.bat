@echo off
REM ==================================================
REM  hp-registry - Deploy to production server via Node.js
REM ==================================================
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js 18+
    pause
    exit /b 1
)

node "%~dp0scripts\deploy.cjs" %*
set "RC=%ERRORLEVEL%"

if "%RC%"=="0" (
    echo.
    echo ---------- Server status after deploy ----------
    node "%~dp0scripts\status.cjs"
)

if "%~1"=="" pause
exit /b %RC%
