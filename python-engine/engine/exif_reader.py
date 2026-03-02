import os
from PIL import Image
from PIL.ExifTags import TAGS

def get_exif_year(file_path: str) -> str:
    """Extracts the year from EXIF DateTime tags, falling back to None if not found."""
    try:
        # Avoid opening heavy files fully
        with Image.open(file_path) as img:
            exif_data = img._getexif()
            if not exif_data:
                return None
            
            date_tags = ["DateTimeOriginal", "DateTimeDigitized", "DateTime"]
            dates_found = []

            for tag_id, value in exif_data.items():
                tag = TAGS.get(tag_id, tag_id)
                if tag in date_tags and isinstance(value, str):
                    dates_found.append((tag, value))

            if not dates_found:
                return None

            # Prioritize original -> digitized -> datetime
            best_date = None
            for dt_tag in date_tags:
                for found_tag, val in dates_found:
                    if found_tag == dt_tag:
                        best_date = val
                        break
                if best_date:
                    break
            
            if best_date and len(best_date) >= 4:
                year = best_date.split(":")[0]
                if year.isdigit() and len(year) == 4:
                    return year
                
        return None
    except Exception:
        return None
