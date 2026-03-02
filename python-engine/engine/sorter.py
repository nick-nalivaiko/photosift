"""
Sorter — orchestrates the full sorting pipeline.
Phase 1: Analyze all files (parallel).
Phase 2: Copy/move files (sequential).
"""
import os
import shutil
import threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable


class Sorter:
    """Main sorting engine with pause/stop support."""

    def __init__(
        self,
        detector,
        matcher,
        classifier,
        config: dict,
        progress_callback: Callable | None = None,
    ):
        self.detector = detector
        self.matcher = matcher
        self.classifier = classifier
        self.config = config
        self.progress_callback = progress_callback

        # Control flags
        self._paused = threading.Event()
        self._paused.set()  # Not paused initially
        self._stopped = threading.Event()

        # Config
        self.source_folder = config.get("source_folder", "")
        self.target_folder = config.get("target_folder", "")
        self.threshold = config.get("threshold", 0.45)
        self.threads = config.get("threads", 4)
        self.mode = config.get("mode", "solo")  # solo or multi
        self.recursive = config.get("recursive", False)
        self.process_video = config.get("process_video", False)
        self.move_files = config.get("move_files", False)

        # Sorting options
        self.sort_by_year = config.get("sort_by_year", False)
        self.split_solo_group = config.get("split_solo_group", False)
        self.collect_no_people = config.get("collect_no_people", False)
        self.collect_junk = config.get("collect_junk", False)
        self.collect_others = config.get("collect_others", False)
        self.collect_unrecognized = config.get("collect_unrecognized", False)
        self.collect_small = config.get("collect_small", False)
        self.detect_duplicates = config.get("detect_duplicates", False)

        # Stats
        self.stats = {
            "total": 0,
            "processed": 0,
            "matched": 0,
            "solo": 0,
            "group": 0,
            "no_people": 0,
            "junk": 0,
            "others": 0,
            "unrecognized": 0,
            "small": 0,
            "duplicates": 0,
            "errors": 0,
        }

    def run(self) -> dict:
        """Run the full sorting pipeline."""
        # Phase 1: Scan files
        files = self.classifier.scan_folder(self.source_folder, self.recursive)
        self.stats["total"] = len(files)

        if not files:
            return {"status": "empty", "stats": self.stats}

        self._report_progress("scanning", 0, len(files))

        # Phase 1: Analyze (parallel)
        plan: list[dict] = []  # {source, target_subfolder, category}
        seen_hashes: dict[str, str] = {}  # hash -> first file path

        with ThreadPoolExecutor(max_workers=self.threads) as pool:
            futures = {
                pool.submit(self._analyze_file, f, seen_hashes): f
                for f in files
            }

            for future in as_completed(futures):
                if self._stopped.is_set():
                    break

                self._paused.wait()  # Block if paused

                try:
                    result = future.result()
                    if result:
                        plan.append(result)
                except Exception:
                    self.stats["errors"] += 1

                self.stats["processed"] += 1
                self._report_progress(
                    "analysis",
                    self.stats["processed"],
                    self.stats["total"],
                )

        if self._stopped.is_set():
            return {"status": "stopped", "stats": self.stats}

        # Phase 2: Copy/Move (sequential)
        self._report_progress("copying", 0, len(plan))

        for i, item in enumerate(plan):
            if self._stopped.is_set():
                break
            self._paused.wait()

            try:
                self._execute_file_operation(item)
            except Exception:
                self.stats["errors"] += 1

            self._report_progress("copying", i + 1, len(plan))

        return {"status": "completed", "stats": self.stats}

    def _analyze_file(self, file_path: str, seen_hashes: dict) -> dict | None:
        """Analyze a single file and determine its target category."""
        # Junk check
        if self.collect_junk and self.classifier.is_junk(file_path):
            self.stats["junk"] += 1
            return self._make_plan(file_path, "junk")

        # Small file check
        if self.collect_small and self.classifier.is_small(file_path):
            self.stats["small"] += 1
            return self._make_plan(file_path, "small")

        # Duplicate check
        if self.detect_duplicates:
            file_hash = self.classifier.file_hash(file_path)
            if file_hash in seen_hashes:
                self.stats["duplicates"] += 1
                return self._make_plan(file_path, "duplicates")
            seen_hashes[file_hash] = file_path

        # Get faces from image or video
        faces = []
        if self.classifier.is_image(file_path):
            faces = self.detector.detect(file_path)
        elif self.classifier.is_video(file_path) and self.process_video:
            frame = self.classifier.get_video_first_frame(file_path)
            if frame is not None:
                faces = self.detector.detect_from_frame(frame)
        else:
            # Not a processable file
            if self.collect_unrecognized:
                self.stats["unrecognized"] += 1
                return self._make_plan(file_path, "unrecognized")
            return None

        # No faces detected
        if not faces:
            if self.collect_no_people:
                self.stats["no_people"] += 1
                return self._make_plan(file_path, "no_people")
            return None

        # Face matching
        face_embeddings = [f["embedding"] for f in faces]
        face_count = len(faces)

        if self.mode == "multi":
            # Multi mode: all required slots must match
            required_slots = self.matcher.slot_ids
            all_match = self.matcher.match_for_multi_mode(
                face_embeddings, required_slots, self.threshold
            )
            if all_match:
                self.stats["matched"] += 1
                category = self._get_match_category(face_count)
                return self._make_plan(file_path, category)
            else:
                if self.collect_others:
                    self.stats["others"] += 1
                    return self._make_plan(file_path, "others")
                return None
        else:
            # Solo mode: any face matching any reference
            any_match = False
            for emb in face_embeddings:
                result = self.matcher.match_face(emb, self.threshold)
                if result["matched"]:
                    any_match = True
                    break

            if any_match:
                self.stats["matched"] += 1
                category = self._get_match_category(face_count)
                return self._make_plan(file_path, category)
            else:
                if self.collect_others:
                    self.stats["others"] += 1
                    return self._make_plan(file_path, "others")
                return None

    def _get_match_category(self, face_count: int) -> str:
        """Determine subcategory based on face count."""
        if self.split_solo_group:
            if face_count == 1:
                self.stats["solo"] += 1
                return "matched_solo"
            else:
                self.stats["group"] += 1
                return "matched_group"
        return "matched"

    def _make_plan(self, source: str, category: str) -> dict:
        """Build a plan entry with source path and target subfolder."""
        parts = []

        # Year subfolder
        if self.sort_by_year and category.startswith("matched"):
            year = self.classifier.get_year(source)
            if year:
                parts.append(year)

        # Category subfolder
        category_folders = {
            "matched": "",
            "matched_solo": "Solo",
            "matched_group": "Group",
            "no_people": "No People",
            "junk": "Junk",
            "others": "Others",
            "unrecognized": "Unrecognized",
            "small": "Small Files",
            "duplicates": "Duplicates",
        }
        cat_folder = category_folders.get(category, category)
        if cat_folder:
            parts.append(cat_folder)

        subfolder = os.path.join(*parts) if parts else ""

        return {
            "source": source,
            "subfolder": subfolder,
            "category": category,
        }

    def _execute_file_operation(self, plan_item: dict):
        """Copy or move file to target location."""
        source = plan_item["source"]
        target_dir = os.path.join(self.target_folder, plan_item["subfolder"])
        os.makedirs(target_dir, exist_ok=True)

        filename = os.path.basename(source)
        target_path = os.path.join(target_dir, filename)

        # Handle name conflicts
        if os.path.exists(target_path):
            name, ext = os.path.splitext(filename)
            counter = 1
            while os.path.exists(target_path):
                target_path = os.path.join(target_dir, f"{name}_{counter}{ext}")
                counter += 1

        if self.move_files:
            shutil.move(source, target_path)
        else:
            shutil.copy2(source, target_path)

    def _report_progress(self, phase: str, current: int, total: int):
        """Send progress update to frontend."""
        if self.progress_callback:
            self.progress_callback({
                "phase": phase,
                "current": current,
                "total": total,
                "stats": self.stats,
            })

    def pause(self):
        self._paused.clear()

    def resume(self):
        self._paused.set()

    def stop(self):
        self._stopped.set()
        self._paused.set()  # Unblock if paused
