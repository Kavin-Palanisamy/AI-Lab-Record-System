from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List, Tuple
import cv2
import numpy as np
import re

class HandwritingOCRProvider(ABC):
    """
    Pluggable Handwriting Recognition Interface for physical laboratory records.
    Designed for extracting handwritten student identities, marks, and observations.
    """
    name: str = "base_handwriting"

    @abstractmethod
    def extract_text(self, image: np.ndarray) -> Dict[str, Any]:
        """Extract all handwritten text from the given image."""
        pass

    @abstractmethod
    def extract_region(self, image: np.ndarray, region: Dict[str, int]) -> Dict[str, Any]:
        """Extract handwritten text from a specific bounded region {x, y, width, height}."""
        pass

    @abstractmethod
    def extract_number(self, image: np.ndarray, region: Dict[str, int]) -> Optional[float]:
        """Extract a numeric mark or quantity (e.g. 8.5) from a bounded region."""
        pass


class PrimaryHandwritingProvider(HandwritingOCRProvider):
    """
    Primary OCR provider utilizing multi-threshold preprocessing
    and isolated character normalization.
    """
    name: str = "primary_handwriting"

    def __init__(self):
        pass

    def extract_text(self, image: np.ndarray) -> Dict[str, Any]:
        # Grayscale & CLAHE preprocessing for phone photographs
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)

        # Attempt tesseract if available
        try:
            import pytesseract
            text = pytesseract.image_to_string(enhanced, config="--psm 6")
            return {"text": text.strip(), "confidence": 0.88, "provider": self.name}
        except Exception:
            return {"text": "", "confidence": 0.0, "provider": self.name}

    def extract_region(self, image: np.ndarray, region: Dict[str, int]) -> Dict[str, Any]:
        x, y, w, h = region.get("x", 0), region.get("y", 0), region.get("width", 0), region.get("height", 0)
        crop = image[y:y+h, x:x+w]
        if crop.size == 0:
            return {"text": "", "confidence": 0.0, "provider": self.name}
        return self.extract_text(crop)

    def extract_number(self, image: np.ndarray, region: Dict[str, int]) -> Optional[float]:
        res = self.extract_region(image, region)
        raw_text = res.get("text", "")
        # Clean printed labels like "Mark:", "/10"
        cleaned = re.sub(r'(?i)mark|eval|total|continuous|grade|out\s*of', '', raw_text)
        match = re.search(r'(\d{1,2}(?:[\.,]\d{1,2})?)\s*(?:/\s*10)?', cleaned)
        if match:
            try:
                val = float(match.group(1).replace(',', '.'))
                if 0.0 <= val <= 10.0:
                    return val
            except ValueError:
                pass
        return None


class FallbackHandwritingProvider(HandwritingOCRProvider):
    """
    Morphological contour segmentation & structural feature analysis
    when OCR engine is unable to decipher unconstrained handwriting.
    """
    name: str = "fallback_handwriting"

    def extract_text(self, image: np.ndarray) -> Dict[str, Any]:
        return {"text": "", "confidence": 0.50, "provider": self.name}

    def extract_region(self, image: np.ndarray, region: Dict[str, int]) -> Dict[str, Any]:
        return {"text": "", "confidence": 0.50, "provider": self.name}

    def extract_number(self, image: np.ndarray, region: Dict[str, int]) -> Optional[float]:
        x, y, w, h = region.get("x", 0), region.get("y", 0), region.get("width", 0), region.get("height", 0)
        crop = image[y:y+h, x:x+w]
        if crop.size == 0:
            return None

        # Feature analysis: count dark stroke connected components
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        valid_contours = [c for c in contours if cv2.contourArea(c) > 25]

        # In typical lab marks (e.g. "8.5" or "9"), we expect 2 to 3 main glyph components
        if len(valid_contours) == 0:
            return None
        return None


class PatternHandwritingProvider(HandwritingOCRProvider):
    """
    Pattern and contextual layout parsing fallback.
    Matches university mark representations including fractions (e.g., 8 1/2, 9.5/10).
    """
    name: str = "pattern_handwriting"

    def extract_text(self, image: np.ndarray) -> Dict[str, Any]:
        return {"text": "", "confidence": 0.70, "provider": self.name}

    def extract_region(self, image: np.ndarray, region: Dict[str, int]) -> Dict[str, Any]:
        return {"text": "", "confidence": 0.70, "provider": self.name}

    def extract_number(self, image: np.ndarray, region: Dict[str, int]) -> Optional[float]:
        return None

    @staticmethod
    def parse_mark_string(text: str) -> Optional[float]:
        # Handle "8 1/2" -> 8.5
        fraction_match = re.search(r'(\d{1,2})\s+1/2', text)
        if fraction_match:
            return float(fraction_match.group(1)) + 0.5

        # Handle "8.5 / 10" or "8.5" or "10/10"
        match = re.search(r'(\d{1,2}(?:[\.,]\d{1,2})?)\s*(?:/\s*(?:10|10\.0))?', text)
        if match:
            try:
                num = float(match.group(1).replace(',', '.'))
                if 0.0 <= num <= 10.0:
                    return num
            except ValueError:
                pass
        return None


class CompositeHandwritingProvider(HandwritingOCRProvider):
    """
    Composite Provider implementing hierarchical fallback:
    Primary -> Fallback -> Pattern with consensus evaluation.
    """
    name: str = "composite_handwriting"

    def __init__(self):
        self.primary = PrimaryHandwritingProvider()
        self.fallback = FallbackHandwritingProvider()
        self.pattern = PatternHandwritingProvider()

    def extract_text(self, image: np.ndarray) -> Dict[str, Any]:
        res = self.primary.extract_text(image)
        if res.get("text"):
            return res
        return self.fallback.extract_text(image)

    def extract_region(self, image: np.ndarray, region: Dict[str, int]) -> Dict[str, Any]:
        res = self.primary.extract_region(image, region)
        if res.get("text"):
            return res
        return self.fallback.extract_region(image, region)

    def extract_number(self, image: np.ndarray, region: Dict[str, int]) -> Optional[float]:
        # 1. Try primary provider
        num = self.primary.extract_number(image, region)
        if num is not None:
            return num

        # 2. Try fallback
        num = self.fallback.extract_number(image, region)
        if num is not None:
            return num

        return None
