import cv2
import numpy as np
from typing import Dict, Any, Tuple, List, Optional
from ..models.schemas import QualitySignals

class ImageQualityAnalyzer:
    """
    OpenCV-based Image Quality Module.
    Calculates defensible heuristics for blur, brightness, contrast, resolution,
    document coverage, perspective distortion, and specular glare.
    Produces quality decisions: GOOD, RETAKE_REQUIRED, or MANUAL_REVIEW.
    """

    def analyze(
        self,
        img: np.ndarray,
        doc_contour: Optional[np.ndarray] = None,
        doc_detected: bool = False,
        perspective_corrected: bool = False
    ) -> QualitySignals:
        h, w = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img

        # 1. Blur Score (Laplacian variance normalized)
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        # Normalized 0.0 to 1.0 (score ~ 250+ considered sharp 1.0)
        norm_blur = round(min(max(laplacian_var / 250.0, 0.0), 1.0), 2)

        # 2. Brightness (Mean luminance)
        mean_val = float(np.mean(gray))
        norm_brightness = round(mean_val / 255.0, 2)

        # 3. Contrast (Standard deviation of pixel intensities)
        std_val = float(np.std(gray))
        norm_contrast = round(min(std_val / 80.0, 1.0), 2)

        # 4. Document Coverage
        total_pixels = h * w
        if doc_contour is not None and doc_detected:
            doc_area = float(cv2.contourArea(doc_contour))
            doc_coverage = round(min(max(doc_area / max(total_pixels, 1), 0.05), 1.0), 2)
        else:
            doc_coverage = 0.95 if perspective_corrected or not doc_detected else 0.50

        # 5. Perspective Distortion Severity
        perspective_severity = 0.0
        if doc_contour is not None and len(doc_contour) == 4:
            pts = doc_contour.reshape(4, 2).astype("float32")
            # Skew calculation: compare opposite sides ratio
            w_top = np.linalg.norm(pts[1] - pts[0])
            w_bot = np.linalg.norm(pts[2] - pts[3])
            h_left = np.linalg.norm(pts[3] - pts[0])
            h_right = np.linalg.norm(pts[2] - pts[1])
            w_ratio = abs(w_top - w_bot) / max(w_top, w_bot, 1.0)
            h_ratio = abs(h_left - h_right) / max(h_left, h_right, 1.0)
            perspective_severity = round(min((w_ratio + h_ratio) / 2.0, 1.0), 2)

        # 6. Glare Estimation (Specular overexposure)
        # Fraction of pixels with brightness >= 252
        glare_mask = (gray >= 252).astype(np.uint8)
        glare_count = int(np.count_nonzero(glare_mask))
        glare_ratio = round(glare_count / max(total_pixels, 1), 3)

        # 7. Quality Decision Synthesis
        suspicion_flags: List[str] = []
        is_retake = False
        is_review = False

        # Extreme blur
        if laplacian_var < 35.0:
            suspicion_flags.append(f"Severe blur detected (sharpness score {norm_blur} / variance {laplacian_var:.1f})")
            is_retake = True
        elif laplacian_var < 75.0:
            suspicion_flags.append(f"Borderline image sharpness (score {norm_blur})")
            is_review = True

        # Extreme lighting
        if norm_brightness < 0.20:
            suspicion_flags.append(f"Image underexposed / very dark (brightness {norm_brightness})")
            is_retake = True
        elif norm_brightness > 0.95 and glare_ratio > 0.25:
            suspicion_flags.append(f"Severe glare / overexposure detected ({glare_ratio * 100:.1f}%)")
            is_retake = True
        elif norm_contrast < 0.25:
            suspicion_flags.append(f"Low contrast between text and background ({norm_contrast})")
            is_review = True

        # Extreme low resolution
        if w < 240 or h < 240:
            suspicion_flags.append(f"Image resolution too low ({w}x{h})")
            is_retake = True

        if is_retake:
            decision = "RETAKE_REQUIRED"
            image_quality = "LOW"
        elif is_review:
            decision = "MANUAL_REVIEW"
            image_quality = "MEDIUM"
        else:
            decision = "GOOD"
            image_quality = "HIGH"

        return QualitySignals(
            imageQuality=image_quality,
            documentBoundaryDetected=doc_detected,
            perspectiveCorrected=perspective_corrected,
            qrDetected=False,  # updated later in pipeline
            markRegionFound=False,  # updated later in pipeline
            suspicionFlags=suspicion_flags,
            requiresReview=(decision != "GOOD"),
            blurScore=norm_blur,
            brightness=norm_brightness,
            contrast=norm_contrast,
            documentCoverage=doc_coverage,
            perspectiveSeverity=perspective_severity,
            glareEstimate=glare_ratio,
            resolution={"width": w, "height": h},
            decision=decision
        )
