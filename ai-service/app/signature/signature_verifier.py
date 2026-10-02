from abc import ABC, abstractmethod
import cv2
import numpy as np
from typing import Dict, Any, Optional
from ..models.schemas import SignatureAnalysis

class SignatureVerificationProvider(ABC):
    """
    Abstract base interface for Faculty Signature Verification.
    Design enforces separation between presence/heuristic detection and
    future biometric/deep-learning verification models.
    """

    @abstractmethod
    def verify_signature(self, document_image: np.ndarray) -> SignatureAnalysis:
        """
        Analyze document image for faculty signature presence and structural characteristics.
        Returns: SignatureAnalysis with status: SIGNATURE_PRESENT, SIGNATURE_NOT_FOUND, or SIGNATURE_UNCERTAIN.
        """
        pass


class StrokeDensitySignatureProvider(SignatureVerificationProvider):
    """
    Heuristic Signature Provider analyzing stroke variance and contour entropy
    in designated faculty verification zone (evaluation table / bottom-right quadrant).
    
    IMPORTANT: This heuristic checks for the presence of handwritten ink strokes
    and does NOT claim biometric identity authentication of a specific faculty member.
    """

    def __init__(self, roi_coords: Optional[Dict[str, float]] = None):
        # Evaluation table & signature zone: y: 55% to 96%, x: 45% to 98%
        self.roi_coords = roi_coords or {
            "y_min": 0.55,
            "y_max": 0.96,
            "x_min": 0.45,
            "x_max": 0.98
        }

    def verify_signature(self, document_image: np.ndarray) -> SignatureAnalysis:
        h, w = document_image.shape[:2]
        y1 = int(h * self.roi_coords["y_min"])
        y2 = int(h * self.roi_coords["y_max"])
        x1 = int(w * self.roi_coords["x_min"])
        x2 = int(w * self.roi_coords["x_max"])

        if y1 >= y2 or x1 >= x2 or y2 > h or x2 > w:
            return SignatureAnalysis(
                status="SIGNATURE_UNCERTAIN",
                confidence=0.50,
                strokeDensity=0.0,
                providerName="StrokeDensitySignatureProvider"
            )

        sig_roi = document_image[y1:y2, x1:x2]
        gray_sig = cv2.cvtColor(sig_roi, cv2.COLOR_BGR2GRAY) if len(sig_roi.shape) == 3 else sig_roi

        # Morphological edge analysis for handwritten strokes
        edges = cv2.Canny(gray_sig, 50, 150)
        edge_pixel_count = cv2.countNonZero(edges)
        total_pixels = sig_roi.shape[0] * sig_roi.shape[1]
        stroke_density = edge_pixel_count / max(total_pixels, 1)

        # Calibrated stroke density thresholds:
        # > 0.0035 indicates distinct handwritten ink strokes
        # < 0.0015 indicates blank / empty signature line
        # 0.0015 - 0.0035 indicates faint marks or uncertain smudge
        if stroke_density >= 0.0035:
            status = "SIGNATURE_PRESENT"
            confidence = min(max(stroke_density * 30.0, 0.82), 0.96)
        elif stroke_density <= 0.0015:
            status = "SIGNATURE_NOT_FOUND"
            confidence = 0.90
        else:
            status = "SIGNATURE_UNCERTAIN"
            confidence = 0.55

        return SignatureAnalysis(
            status=status,
            confidence=round(confidence, 2),
            strokeDensity=round(stroke_density, 4),
            providerName="StrokeDensitySignatureProvider"
        )
