@echo off
REM ==================================================
REM  hp-registry - Deploy all (Frontend + Backend)
REM ==================================================
chcp 65001 >nul
cd /d "%~dp0"
call "%~dp0deploy.bat" %*
set "RC=%ERRORLEVEL%"
exit /b %RC%
