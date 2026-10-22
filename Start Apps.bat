@echo off
rem Starts the five apps on http://localhost:3000 and opens the launcher in your browser.
rem Needs Node.js 20 or newer: https://nodejs.org
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 20 or newer from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000/"
node server\index.js
pause
