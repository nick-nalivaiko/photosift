# PhotoSift 📸

PhotoSift is a high-performance desktop application designed for rapid photo organization using AI-powered face recognition. It helps you sort through thousands of images in seconds, grouping them by people, dates, and quality.

## Key Features 🚀

- **AI Face Recognition**: Automatically detect and group people across your entire library.
- **Smart Sorting**: Organize photos into a clean folder structure based on identified individuals.
- **Privacy First**: All processing happens locally on your machine. No photos are ever uploaded to the cloud.
- **GPU Acceleration**: Utilizes CUDA/DirectML for lightning-fast AI inference.
- **Metadata Aware**: Reads EXIF data to optionally sort files by year and date.
- **Duplicate & Junk Detection**: Identifies identical copies and low-quality/small files automatically.

## Tech Stack 🛠️

- **Frontend**: React + TypeScript + Vite + Tailwind CSS.
- **Backend**: Rust (Tauri) for high-performance system operations.
- **AI Engine**: Python-based sidecar using InsightFace and ONNX Runtime.

## Development Setup 💻

### Prerequisites

- Node.js (v18+)
- Rust & Cargo
- Python 3.10+
- Visual Studio Build Tools (Windows)

### Installation

1. **Frontend & Tauri Dependencies**:

   ```bash
   npm install
   ```

2. **Python Engine Setup**:

   ```bash
   cd python-engine
   python -m venv .venv
   .\.venv\Scripts\activate
   pip install -r requirements.txt
   deactivate
   cd ..
   ```

3. **Running in Dev Mode**:

   ```bash
   .\dev.bat
   ```

4. **Building the Production Installer**:

   ```bash
   # First build the Python sidecar exe
   cd python-engine
   .\.venv\Scripts\activate
   python build.py
   deactivate
   cd ..

   # Then build the Tauri app
   .\build.bat
   ```

## License 📜

Private / Proprietary.
