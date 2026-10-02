from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import numpy as np

class BaseOCRProvider(ABC):
    """
    Pluggable OCR Provider Interface.
    Allows swappable backends: Tesseract, EasyOCR, or Custom Document OCR.
    """
    name: str = "base"

    @abstractmethod
    async def extract_text(self, image: np.ndarray) -> Dict[str, Any]:
        """
        Extract text and bounding boxes from an image numpy array (BGR or Grayscale).
        Returns:
            dict containing:
                - 'text': full extracted text
                - 'words': list of word dicts with text and confidence
                - 'confidence': average OCR confidence (0.0 - 1.0)
        """
        pass
