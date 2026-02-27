@echo off
echo ============================================
echo   GateStack WASM Build
echo ============================================
echo.

:: Check for Rust
where rustc >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Rust is not installed.
    echo.
    echo Install Rust:
    echo   1. Go to https://rustup.rs/
    echo   2. Download and run rustup-init.exe
    echo   3. Choose option 1 default installation
    echo   4. Restart your terminal
    echo   5. Run this script again
    echo.
    pause
    exit /b 1
)

echo [OK] Rust found:
rustc --version
echo.

:: Check for wasm-pack
where wasm-pack >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installing wasm-pack...
    cargo install wasm-pack
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install wasm-pack
        pause
        exit /b 1
    )
)

echo [OK] wasm-pack found:
wasm-pack --version
echo.

:: Add wasm32 target
echo [1/2] Adding wasm32 target...
rustup target add wasm32-unknown-unknown
echo.

:: Build WASM
echo [2/2] Building WASM core...
cd /d "%~dp0..\core"
wasm-pack build --target bundler --out-dir ../web/src/wasm --release
if %errorlevel% neq 0 (
    echo [ERROR] WASM build failed
    pause
    exit /b 1
)

echo.
echo ============================================
echo   WASM build complete!
echo   Output: web/src/wasm/
echo ============================================
pause
