"""
Face Detection using InsightFace (RetinaFace).
Detects faces and extracts 512-d ArcFace embeddings.
"""
import numpy as np
from pathlib import Path


class FaceDetector:
    """Wraps InsightFace for face detection + embedding extraction."""

    def __init__(self, use_gpu: bool = True):
        import insightface
        from insightface.app import FaceAnalysis
        import onnxruntime as ort

        # Determine execution provider
        available = ort.get_available_providers()
        self.gpu_available = "CUDAExecutionProvider" in available and use_gpu
        
        if self.gpu_available:
            self.providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
            self.provider_name = "CUDAExecutionProvider"
        else:
            self.providers = ["CPUExecutionProvider"]
            self.provider_name = "CPUExecutionProvider"

        # Initialize InsightFace app
        # buffalo_l = RetinaFace detection + ArcFace recognition (best accuracy)
        self.app = FaceAnalysis(
            name="buffalo_l",
            providers=self.providers,
        )
        self.app.prepare(ctx_id=0 if self.gpu_available else -1, det_size=(640, 640))

    def detect(self, image_path: str) -> list[dict]:
        """
        Detect faces in an image and return their embeddings.
        
        Returns:
            List of dicts with keys:
            - embedding: numpy array (512-d)
            - bbox: [x1, y1, x2, y2]
            - area: float (face area in pixels)
            - score: float (detection confidence)
        """
        import cv2

        img = cv2.imread(str(image_path))
        if img is None:
            return []

        # Apply EXIF orientation correction
        img = self._correct_orientation(img, image_path)

        faces = self.app.get(img)

        results = []
        for face in faces:
            bbox = face.bbox.astype(int).tolist()
            area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
            results.append({
                "embedding": face.embedding.tolist(),
                "bbox": bbox,
                "area": float(area),
                "score": float(face.det_score),
            })

        return results

    def detect_from_frame(self, frame: np.ndarray) -> list[dict]:
        """Detect faces from a numpy array frame (for video processing)."""
        faces = self.app.get(frame)
        results = []
        for face in faces:
            bbox = face.bbox.astype(int).tolist()
            area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
            results.append({
                "embedding": face.embedding.tolist(),
                "bbox": bbox,
                "area": float(area),
                "score": float(face.det_score),
            })
        return results

    def _correct_orientation(self, img, image_path: str):
        """Correct image orientation based on EXIF data."""
        try:
            from PIL import Image
            from PIL.ExifTags import Base as ExifBase

            pil_img = Image.open(image_path)
            exif = pil_img.getexif()
            orientation = exif.get(ExifBase.Orientation, 1)

            import cv2
            if orientation == 3:
                img = cv2.rotate(img, cv2.ROTATE_180)
            elif orientation == 6:
                img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
            elif orientation == 8:
                img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
        except Exception:
            pass  # No EXIF or error — use as-is

        return img
