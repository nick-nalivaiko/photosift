import os
import logging
import traceback
from typing import List
import numpy as np
import cv2
from insightface.app import FaceAnalysis

class FaceProcessor:
    def __init__(self, use_gpu: bool = True):
        self.use_gpu = use_gpu
        self.app = None
        
    def initialize(self):
        try:
            providers = ['CUDAExecutionProvider', 'CPUExecutionProvider'] if self.use_gpu else ['CPUExecutionProvider']
            logging.info(f"Initializing FaceAnalysis with providers: {providers}")
            
            # 'buffalo_l' is the default model pack containing RetinaFace + ArcFace
            self.app = FaceAnalysis(name='buffalo_l', providers=providers)
            self.app.prepare(ctx_id=0 if self.use_gpu else -1, det_size=(640, 640))
            logging.info("FaceAnalysis initialized successfully.")
            return True, "Models loaded"
        except Exception as e:
            err = traceback.format_exc()
            logging.error(f"Failed to initialize FaceAnalysis: {err}")
            return False, str(e)

    def extract_faces(self, image_path: str) -> List[np.ndarray]:
        """Reads image and returns a list of 512-d embeddings."""
        if not self.app:
            raise RuntimeError("FaceProcessor is not initialized")
            
        # Handle unicode paths correctly in Windows OpenCV
        stream = open(image_path, "rb")
        bytes_array = bytearray(stream.read())
        numpyarray = np.asarray(bytes_array, dtype=np.uint8)
        img = cv2.imdecode(numpyarray, cv2.IMREAD_COLOR)
        stream.close()
        
        if img is None:
            raise ValueError(f"Could not decode image at path: {image_path}")
            
        faces = self.app.get(img)
        embeddings = []
        for idx, face in enumerate(faces):
            # face.normed_embedding is a 512-dimension vector from ArcFace
            if face.normed_embedding is not None:
                embeddings.append(face.normed_embedding)
            else:
                logging.warning(f"Face {idx} in {image_path} missing normed_embedding.")
                
        return embeddings

# Global singleton
face_engine = FaceProcessor(use_gpu=True)
