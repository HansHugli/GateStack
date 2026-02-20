@echo off
echo ============================================
echo   GateStack - Building Windows Installer
echo   Version 0.2.0
echo ============================================
echo.
cd /d "%~dp0..\web"

:: Check dependencies
if not exist "node_modules" (
    echo [ERROR] node_modules not found. Run scripts\setup.bat first.
    pause
    exit /b 1
)

echo [1/3] Building Vite production bundle...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Vite build failed.
    pause
    exit /b 1
)

:: Verify dist output
if not exist "dist\index.html" (
    echo [ERROR] dist\index.html not found after build.
    pause
    exit /b 1
)

echo.
echo [2/3] Packaging with Electron Builder (NSIS installer)...
call npx electron-builder --win --x64
if %errorlevel% neq 0 (
    echo [ERROR] Electron Builder failed.
    echo.
    echo Common fixes:
    echo   - Make sure build\icon.ico exists (256x256)
    echo   - Try: npm install electron-builder --save-dev
    echo   - Try: npx electron-builder --win --x64
    pause
    exit /b 1
)

echo.
echo [3/3] Done!
echo.
echo ============================================
echo   Installer created successfully!
echo ============================================
echo.
echo Output directory: web\release\
echo.
dir /b release\*.exe 2>nul
echo.
echo You can distribute this .exe to install
echo GateStack on any Windows PC (no Node.js needed).
echo.
pause
