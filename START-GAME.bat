@echo off
title Mossvale - local game
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 22 LTS from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8080/"
node server.mjs
pause
