@echo off

:: Use globally installed npm if available
where npm >nul 2>1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm not found in PATH.
    pause
    exit /b
)

echo Starting PhotoSift in Dev Mode...
npm run tauri dev
pause
