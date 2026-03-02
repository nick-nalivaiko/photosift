@echo off
echo =======================================================
echo Initializing MSVC C++ Build Environment for Tauri/Rust Build...
echo =======================================================
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"

echo.
echo Adding Cargo to PATH...
set PATH=%PATH%;C:\Users\Nicko\.cargo\bin

echo.
echo Starting Tauri Release Build...
npm run tauri build
