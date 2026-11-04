@echo off
REM ==================================================
REM  hp-registry - Deploy all (Frontend + Backend)
REM  Steps: new version + AI release notes -> commit/tag/push GitHub -> build -> upload -> restart pm2
REM  deploy.bat and deploy-all.bat do exactly the same thing. Skip the version step with: --no-release
REM ==================================================
chcp 65001 >nul
cd /d "%~dp0"
call "%~dp0deploy.bat" %*
set "RC=%ERRORLEVEL%"
exit /b %RC%
