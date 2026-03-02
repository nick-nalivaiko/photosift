"""
PyInstaller build script for PhotoSift Engine sidecar.
Produces a single-file executable that Tauri can embed.
"""
import PyInstaller.__main__
import os
import shutil
from pathlib import Path

# Paths
HERE = Path(__file__).parent
OUTPUT_DIR = HERE.parent / "src-tauri" / "binaries"
DIST_DIR = HERE / "dist"
BUILD_DIR = HERE / "build"

def build():
    """Build the sidecar executable with PyInstaller."""
    PyInstaller.__main__.run([
        str(HERE / "main.py"),
        "--name=photosift-engine",
        "--onefile",            # single exe (all dependencies inside)
        "--console",          # needs console for stdin/stdout
        "--noconfirm",
        f"--distpath={DIST_DIR}",
        f"--workpath={BUILD_DIR}",
        "--hidden-import=insightface",
        "--hidden-import=onnxruntime",
        "--hidden-import=cv2",
        "--hidden-import=PIL",
        "--collect-all=insightface",
        "--collect-all=onnxruntime",
    ])

    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Copy single exe to Tauri binaries directory
    src_exe = DIST_DIR / "photosift-engine.exe"
    # Tauri expects: {name}-{target_triple}.exe
    dst_exe = OUTPUT_DIR / "photosift-engine-x86_64-pc-windows-msvc.exe"

    shutil.copy2(src_exe, dst_exe)

    print(f"\n✅ Build complete! Sidecar at: {dst_exe}")
    print(f"   Size: {dst_exe.stat().st_size / 1024 / 1024:.1f} MB")

if __name__ == "__main__":
    build()
