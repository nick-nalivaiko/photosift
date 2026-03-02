import os
import shutil
import numpy as np
from typing import Dict, Any, List, Tuple
from .face_processor import face_engine
from .exif_reader import get_exif_year
from .duplicate_detector import calculate_hash, is_small_file, is_micro_file

def cosine_similarity(v1: np.ndarray, v2: np.ndarray) -> float:
    """Computes cosine similarity between two vectors."""
    dot = np.dot(v1, v2)
    norm1 = np.linalg.norm(v1)
    norm2 = np.linalg.norm(v2)
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return float(dot / (norm1 * norm2))

def evaluate_image(
    file_path: str,
    config: Dict[str, Any],
    references: Dict[str, List[np.ndarray]],
    threshold: float
) -> Tuple[str, bool, str]:
    """
    Returns (CategoryName, IsDuplicate, FileHash)
    """
    file_hash = ""
    if config.get("detect_duplicates", False):
        file_hash = calculate_hash(file_path)

    if config.get("collect_junk", False):
        if is_micro_file(file_path):
            return ("Junk", False, file_hash)

    if config.get("collect_small", False):
        min_mb = config.get("small_size_min_mb", 0.0)
        max_mb = config.get("small_size_max_mb", 1.0)
        min_bytes = int(min_mb * 1024 * 1024)
        
        # Treat 10.0 MB as Infinity (unlimited max size)
        if max_mb >= 10.0:
            max_bytes = float('inf')
        else:
            max_bytes = int(max_mb * 1024 * 1024)
            
        if is_small_file(file_path, min_size_bytes=min_bytes, max_size_bytes=max_bytes):
            return ("Small", False, file_hash)

    # Extract faces
    try:
        faces = face_engine.extract_faces(file_path)
    except Exception:
        # Cannot read image -> Unrecognized or Junk
        return ("Unrecognized", False, file_hash)

    if len(faces) == 0:
        if config.get("collect_no_people", False):
            return ("No Faces", False, file_hash)
        else:
            return ("Others", False, file_hash)

    # Check matches
    matched_persons = set()
    unmatched_faces_count = 0
    
    # Pre-build ref_id -> person_name mapping
    ref_to_person = {}
    for p_obj in config.get("persons", []):
        p_name = p_obj.get("name")
        for rid in p_obj.get("referenceIds", []):
            ref_to_person[rid] = p_name

    for face in faces:
        face_best_sim = 0.0
        best_ref_id = None
        for ref_id, ref_embeddings in references.items():
            for ref_emb in ref_embeddings:
                sim = cosine_similarity(face, ref_emb)
                if sim > face_best_sim:
                    face_best_sim = sim
                    best_ref_id = ref_id
        
        if face_best_sim >= threshold and best_ref_id:
            person_name = ref_to_person.get(best_ref_id)
            if person_name:
                matched_persons.add(person_name)
            else:
                # Reference exists but not linked to any person -> treat as unmatched
                unmatched_faces_count += 1
        else:
            unmatched_faces_count += 1

    if not matched_persons:
        # None of the faces matched our targets above the threshold
        return ("Others", False, file_hash)

    # Matches exist!
    if not config.get("split_solo_group", False):
        return ("Matched", False, file_hash)

    # Unify sorting: Solo is just Multi with 1 person
    if unmatched_faces_count > 0:
        return ("Group", False, file_hash) # "С другими" 
    else:
        # Only known people in photo
        if len(matched_persons) == 1:
            return (list(matched_persons)[0], False, file_hash) # Specific Person Name
        else:
            return ("Together", False, file_hash) # "Вместе"

def generate_target_path(
    source_path: str,
    base_target: str,
    category: str,
    config: Dict[str, Any]
) -> str:
    """Builds the final destination path."""
    year = ""
    if config.get("sort_by_year", False):
        exif_y = get_exif_year(source_path)
        if exif_y:
            year = exif_y
        else:
            # Fallback: use file modification date
            try:
                mtime = os.path.getmtime(source_path)
                import datetime
                year = str(datetime.datetime.fromtimestamp(mtime).year)
            except Exception:
                labels_cfg = config.get("labels", {})
                year = labels_cfg.get("unknown_year", "Unknown Year")

    labels = config.get("labels", {})
    category_map = {
        "Matched": labels.get("matched", "Matched"),
        "Together": labels.get("together", "Together"),
        "Group": labels.get("group", "Group"),
        "No Faces": labels.get("no_people", "No Faces"),
        "Junk": labels.get("junk", "Junk"),
        "Others": labels.get("others", "Others"),
        "Unrecognized": labels.get("unrecognized", "Unrecognized"),
        "Duplicates": labels.get("duplicates", "Duplicates"),
        "Small": labels.get("small", "Small Files")
    }
    
    localized_category = category_map.get(category, category)

    parts = [base_target]
    if year:
        parts.append(year)
    parts.append(localized_category)
    
    target_dir = os.path.join(*parts)
    return os.path.join(target_dir, os.path.basename(source_path))

def copy_or_move(source: str, target: str, move: bool = False):
    """Executes the file transfer, resolving name collisions."""
    os.makedirs(os.path.dirname(target), exist_ok=True)
    
    final_target = target
    base, ext = os.path.splitext(target)
    counter = 1
    while os.path.exists(final_target):
        final_target = f"{base}({counter}){ext}"
        counter += 1
        
    if move:
        shutil.move(source, final_target)
    else:
        shutil.copy2(source, final_target)
