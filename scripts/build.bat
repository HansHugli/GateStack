@echo off
echo ============================================
echo   Building GateStack Installer
echo ============================================
echo.
cd /d "%~dp0..\web"

echo [1/3] Building Vite production bundle...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Vite build failed.
    pause
    exit /b 1
)

echo.
echo [2/3] Packaging with Electron Builder...
call npx electron-builder --win
if %errorlevel% neq 0 (
    echo [ERROR] Electron Builder failed.
    pause
    exit /b 1
)

echo.
echo [3/3] Done!
echo.
echo Installer is in: web\release\
echo.
dir /b release\*.exe 2>nul
echo.
pause
