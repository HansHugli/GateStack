@echo off
echo Building WASM core...
cd core
wasm-pack build --target web --out-dir ../web/src/wasm
if %ERRORLEVEL% neq 0 (
    echo.
    echo WASM build failed. Starting with mock mode instead...
    echo (The UI will work with simulated data)
    echo.
)
cd ..

echo Starting dev server...
cd web
npm run dev
