@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (
  echo Run setup-windows.bat first.
  pause
  exit /b 1
)
if not exist .env.local call npm run setup
echo Open http://localhost:3000 after the server is ready.
echo Keep this window open. Press Ctrl+C to stop.
call npm run dev
if errorlevel 1 pause
