# Organization & Splitting

PhotoSift doesn't just find faces; it structures the output logically.

## Sort by Year (Разбивка по годам)

- **Mechanism**: The backend reads EXIF metadata (specifically `DateTimeOriginal`) from JPEGs/HEICs.
- If EXIF is missing, it falls back to the file's created/modified timestamps (OS level).
- **Structure**: All main categorization folders (`Matched`, `No Faces`, `Junk`, etc.) are nested inside Root-level Year folders (e.g., `2022/`, `2023/`).

## Solo / Group Split (Разделить: только я / совместные)

- **Mechanism**: When PhotoSift detects the target face, it checks how many _total_ faces are in the frame.
- If **1 face** is found and it matches the target: Placed in `Только Я` (Solo).
- If **>1 faces** are found and one matches the target: Placed in `С Другими` (With Others).

## Other People (Фото с другими людьми)

- If faces are detected in the image, but **none** match the target reference photos, the file is routed to `Другие Люди`.

## No People (Фото без людей)

- If the face detector returns 0 bounding boxes (landscapes, food, documents), the file is routed to `Без Людей`.
