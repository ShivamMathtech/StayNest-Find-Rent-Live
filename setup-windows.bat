@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 or 24 LTS from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
node -e "const n=Number(process.versions.node.split('.')[0]); if(n<22 || n>=25){console.error('Use Node.js 22 or 24 LTS.');process.exit(1)}"
if errorlevel 1 goto failed
call npm ci
if errorlevel 1 goto failed
call npm run setup
if errorlevel 1 goto failed
echo.
echo Setup finished. Double-click start-windows.bat to start StayNest.
pause
exit /b 0
:failed
echo.
echo Setup failed. Read the error above and README.md troubleshooting.
pause
exit /b 1
