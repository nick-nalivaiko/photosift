"""
Face Matching — stores reference embeddings and matches against them.
Uses cosine distance for comparison.
"""
import uuid
import numpy as np


class FaceMatcher:
    """Manages reference embeddings and performs face matching."""

    def __init__(self):
        # slot_id -> list of {ref_id, embedding, path}
        self.slots: dict[str, list[dict]] = {}

    def add_reference(self, embedding: list[float], slot_id: str, path: str) -> str:
        """Add a reference embedding. Returns a unique reference ID."""
        ref_id = str(uuid.uuid4())
        
        if slot_id not in self.slots:
            self.slots[slot_id] = []

        self.slots[slot_id].append({
            "ref_id": ref_id,
            "embedding": np.array(embedding, dtype=np.float32),
            "path": path,
        })
        return ref_id

    def remove_reference(self, ref_id: str):
        """Remove a reference by its ID."""
        for slot_id, refs in list(self.slots.items()):
            self.slots[slot_id] = [r for r in refs if r["ref_id"] != ref_id]
            if not self.slots[slot_id]:
                del self.slots[slot_id]

    def get_slot_embedding(self, slot_id: str) -> np.ndarray | None:
        """Get averaged embedding for a slot (used for comparison)."""
        refs = self.slots.get(slot_id, [])
        if not refs:
            return None
        
        embeddings = np.array([r["embedding"] for r in refs])
        avg = np.mean(embeddings, axis=0)
        # Normalize
        avg = avg / np.linalg.norm(avg)
        return avg

    def match_face(
        self,
        face_embedding: list[float] | np.ndarray,
        threshold: float = 0.45,
    ) -> dict:
        """
        Match a face embedding against all reference slots.
        
        Returns:
            {
                "matched": bool,
                "slot_id": str | None,
                "distance": float,
                "matched_slots": list[str],  # all slots that matched
            }
        """
        emb = np.array(face_embedding, dtype=np.float32)
        emb = emb / np.linalg.norm(emb)

        best_distance = float("inf")
        best_slot = None
        matched_slots = []

        for slot_id in self.slots:
            ref_emb = self.get_slot_embedding(slot_id)
            if ref_emb is None:
                continue

            # Cosine distance: lower = more similar
            distance = 1.0 - float(np.dot(emb, ref_emb))

            if distance < threshold:
                matched_slots.append(slot_id)

            if distance < best_distance:
                best_distance = distance
                best_slot = slot_id

        return {
            "matched": len(matched_slots) > 0,
            "slot_id": best_slot if matched_slots else None,
            "distance": float(best_distance),
            "matched_slots": matched_slots,
        }

    def match_for_multi_mode(
        self,
        face_embeddings: list,
        required_slots: list[str],
        threshold: float = 0.45,
    ) -> bool:
        """
        Multi-mode: Check if ALL required slots have at least one matching face.
        
        Args:
            face_embeddings: List of embeddings from all faces in the image
            required_slots: List of slot_ids that must all be present
            threshold: Cosine distance threshold
        """
        matched_slot_ids = set()

        for emb in face_embeddings:
            result = self.match_face(emb, threshold)
            if result["matched"]:
                matched_slot_ids.update(result["matched_slots"])

        return all(slot in matched_slot_ids for slot in required_slots)

    @property
    def slot_ids(self) -> list[str]:
        return list(self.slots.keys())

    @property
    def reference_count(self) -> int:
        return sum(len(refs) for refs in self.slots.values())
