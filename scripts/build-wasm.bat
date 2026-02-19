@echo off
echo ============================================
echo   Building GateStack WASM Core
echo ============================================
echo.

cd /d "%~dp0..\core"

:: Check for Rust
where rustc >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Rust is not installed.
    echo Download from: https://rustup.rs/
    pause
    exit /b 1
)

:: Check for wasm-pack
where wasm-pack >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installing wasm-pack...
    cargo install wasm-pack
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install wasm-pack.
        pause
        exit /b 1
    )
)

:: Ensure wasm32 target is available
rustup target add wasm32-unknown-unknown 2>nul

echo [1/2] Compiling Rust → WASM...
call wasm-pack build --target web --out-dir ../web/src/wasm
if %errorlevel% neq 0 (
    echo [ERROR] wasm-pack build failed.
    pause
    exit /b 1
)

echo.
echo [2/2] Done!
echo WASM files are in: web\src\wasm\
echo The app will auto-detect and use the WASM core on next startup.
echo.
pause
