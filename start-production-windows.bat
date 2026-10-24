@echo off
setlocal
cd /d "%~dp0"
call npm run build
if errorlevel 1 goto failed
call npm start
if errorlevel 1 goto failed
exit /b 0
:failed
pause
exit /b 1
