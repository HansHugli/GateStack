@echo off
echo ============================================
echo   GateStack Setup
echo ============================================
echo.

cd /d "%~dp0..\web"

:: Check for Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo Download from: https://nodejs.org/
    pause
    exit /b 1
)

echo [1/2] Installing Node dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)

echo.
echo [2/2] Checking for Rust (optional, for WASM core)...
where rustc >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Rust not found. WASM core will not be built.
    echo [INFO] The app runs fine without it (uses JavaScript mock).
    echo [INFO] To install Rust later: https://rustup.rs/
) else (
    echo [OK] Rust found: 
    rustc --version
    where wasm-pack >nul 2>&1
    if %errorlevel% neq 0 (
        echo [INFO] Installing wasm-pack...
        cargo install wasm-pack
    )
    rustup target add wasm32-unknown-unknown 2>nul
)

echo.
echo ============================================
echo   Setup complete!
echo.
echo   Quick start:
echo     scripts\dev.bat          - Browser dev mode
echo     scripts\electron-dev.bat - Electron dev mode  
echo     scripts\build.bat        - Build installer
echo ============================================
pause
