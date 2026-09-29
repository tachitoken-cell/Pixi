@echo off
title Mossvale (Pixi) - local game
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 22 LTS from https://nodejs.org and run this file again.
  start https://nodejs.org/en/download
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing the game's packages - first start only, this takes a minute...
  call npm install
  if errorlevel 1 ( echo Install failed. & pause & exit /b 1 )
)
echo Starting the game server and client. Keep this window open while you play; close it to stop the game.
start "" cmd /c "timeout /t 6 >nul & start http://localhost:5173/"
call npm run dev
pause
