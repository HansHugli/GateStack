@echo off
echo Starting GateStack in browser dev mode...
cd /d "%~dp0..\web"
call npm run dev
