# Core Face Sorting Algorithm

## Overview

The primary purpose of PhotoSift is to scan a large unordered pool of photos/videos, extract faces, and match them against user-defined "Reference Photos" (Эталонные фото).

## How it works

1. **Reference Faces**: The user provides high-quality reference photos of target individuals. The system extracts a face embedding (128d or 512d vector) from these references.
2. **Analysis**: The script iterates through the target directory. For each file, it runs face detection and extracts embeddings for all faces found.
3. **Matching**: It compares the Euclidean distance (or cosine similarity) between the features of the current photo's faces and the reference faces.
4. **Thresholds (Порог распознавания)**:
   - **Soft (Мягко)**: Higher tolerance, might catch side profiles or blurry faces but risks false positives.
   - **Normal (Норма)**: Balanced precision and recall.
   - **Strict (Строго)**: Requires high confidence, avoids false positives but might miss difficult angles.

## Modes

Единый режим с поддержкой произвольного количества персон:

- **Один человек**: Пользователь создаёт один слот с эталонными фото — приложение ищет совпадение любого лица на фото с любым эталоном.
- **Несколько людей**: Пользователь создаёт несколько слотов (по одному на человека). Фото считается «совпавшим» только если на нём найдены **все** указанные люди одновременно.

Отдельного переключателя режимов нет — поведение определяется автоматически по количеству добавленных персон.
