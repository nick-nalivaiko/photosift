@echo off

:: Use globally installed cargo if available
where cargo >nul 2>1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Cargo not found in PATH. Please install Rust: https://rustup.rs/
    pause
    exit /b
)

echo Starting PhotoSift Build...
npm run tauri build
pause
