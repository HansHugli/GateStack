@echo off
echo ============================================
echo   GateStack Setup Script (Windows)
echo ============================================
echo.

:: Check for Rust
where rustc >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [1/4] Rust not found. Installing via rustup...
    echo       Download and run: https://win.rustup.rs
    echo       Then re-run this script.
    echo.
    start https://win.rustup.rs
    pause
    exit /b 1
) else (
    echo [1/4] Rust found:
    rustc --version
)

:: Install wasm-pack
where wasm-pack >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [2/4] Installing wasm-pack...
    cargo install wasm-pack
) else (
    echo [2/4] wasm-pack found:
    wasm-pack --version
)

:: Add wasm32 target
echo [3/4] Adding wasm32 target...
rustup target add wasm32-unknown-unknown

:: Install npm dependencies
echo [4/4] Installing web dependencies...
cd web
call npm install
cd ..

echo.
echo ============================================
echo   Setup complete! Next steps:
echo ============================================
echo.
echo   1. Build the WASM core:
echo      cd core
echo      wasm-pack build --target web --out-dir ../web/src/wasm
echo.
echo   2. Start the dev server:
echo      cd web
echo      npm run dev
echo.
echo   3. Open http://localhost:3000
echo.
echo   Or just run: dev.bat
echo ============================================
pause
