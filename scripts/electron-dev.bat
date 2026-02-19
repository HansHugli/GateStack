@echo off
echo Starting GateStack in Electron dev mode...
echo (Vite dev server + Electron window)
echo.
cd /d "%~dp0..\web"
call npm run electron:dev
