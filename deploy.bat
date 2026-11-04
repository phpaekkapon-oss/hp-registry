@echo off
REM ==================================================
REM  hp-registry - Deploy to production server
REM  Steps: new version + AI release notes -> commit/tag/push GitHub -> build -> upload -> restart pm2
REM  deploy.bat and deploy-all.bat do exactly the same thing. Skip the version step with: --no-release
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
