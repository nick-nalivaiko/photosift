# File Filtering Options

PhotoSift includes multiple built-in filters to clean up file dumps (like WhatsApp or Telegram exports) before or during sorting.

## 1. Junk Detection (Потенциальный мусор)

- Files under **150 KB** are often unwanted caches, thumbnails, or small memes.
- If enabled, these files bypass facial recognition entirely and are isolated into a `Мусор - не удаляется!` folder.

## 2. Dynamic Size Filter (Фильтрация по размеру)

- Users can define a custom `Min` and `Max` size range in Megabytes (e.g., 0.15 MB to 5 MB).
- **Dual-Thumb Slider**: The UI provides a fluid dual slider for setting both boundaries. Quick preset chips for rapid selection (e.g., `150-500 KB`) are available.
- **Infinity Support**: Setting the Max slider to the absolute end (10MB) removes the upper boundary (treated as $\infty$), capturing all files above the Min threshold.
- The folder generated is labeled dynamically to reflect the configuration, e.g., `Фильтрация по размеру 0.15-∞MB`.

## 3. Duplicates Removal

- Prevents copying exactly identical files. Relies on hashing algorithms (like MD5/SHA256) on the Python backend to check if the exact byte sequence has already been processed. Duplicate files are isolated into `Дубликаты`.

## 4. Unrecognized Files

- Any files that crash the image/video decoding process, or formats unsupported by OpenCV/InsightFace, are safely caught by a `try..except` block and moved to `Не распознано`.
