@echo off
rem Daily database backup (run by Windows Task Scheduler "HP-Registry-Backup"). Keeps the newest 30 files in .\backups
cd /d "%~dp0backend"
call npm run backup >> "%~dp0backups\backup.log" 2>&1
