import hashlib
import os

def calculate_hash(file_path: str) -> str:
    """Calculates the MD5 hash of a file for duplicate detection."""
    hash_md5 = hashlib.md5()
    try:
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()
    except Exception:
        return ""

def is_micro_file(file_path: str, max_size_bytes: int = 150*1024) -> bool:
    """Checks if a file represents extremely small 'junk' (default under 150kb)."""
    try:
        return os.path.getsize(file_path) < max_size_bytes
    except OSError:
        return False

def is_small_file(file_path: str, min_size_bytes: int = 0, max_size_bytes: float = 1024*1024) -> bool:
    """Checks if a file represents a 'small file' within the specified size range."""
    try:
        size = os.path.getsize(file_path)
        return min_size_bytes <= size <= max_size_bytes
    except OSError:
        return False
