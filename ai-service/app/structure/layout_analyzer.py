import cv2
import numpy as np
import re
from typing import Dict, Any, Tuple, List, Optional
from ..models.schemas import LayoutAnalysis

class DocumentLayoutAnalyzer:
    """
    Anti-Crop and Structural Layout Verification Module.
    Ensures laboratory record photograph captures the complete page rather than
    an evasive crop omitting student identity, header, QR, or faculty evaluation zone.
    """

    EXPECTED_REGIONS = [
        "HEADER_TITLE",
        "STUDENT_INFO",
        "EXPERIMENT_INFO",
        "QR_TOKEN_ZONE",
        "FACULTY_EVAL_ZONE"
    ]

    def analyze(
        self,
        img: np.ndarray,
        ocr_text: str,
        qr_detected: bool,
        student_reg_extracted: bool
    ) -> LayoutAnalysis:
        h, w = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img

        detected_regions: List[str] = []
        missing_regions: List[str] = []

        # 1. Structural Aspect Ratio Check
        # Standard laboratory sheets (A4 portrait) have aspect ratio ~1.35 to 1.48
        aspect_ratio = h / max(w, 1)
        is_heavily_cropped = (aspect_ratio < 1.05 or aspect_ratio > 1.80)

        # 2. Zone Edge Energy checks (y-slices)
        # Zone 1: Header / Title (y: 0% to 15%)
        header_roi = gray[0:int(h * 0.15), :]
        header_edges = cv2.countNonZero(cv2.Canny(header_roi, 50, 150))
        has_header = (header_edges / max(header_roi.size, 1) > 0.008) or bool(
            re.search(r"(?:department|college|laboratory|record|institution)", ocr_text, re.IGNORECASE)
        )
        if has_header:
            detected_regions.append("HEADER_TITLE")
        else:
            missing_regions.append("HEADER_TITLE")

        # Zone 2: Student Information (y: 12% to 35%)
        student_roi = gray[int(h * 0.12):int(h * 0.35), :]
        student_edges = cv2.countNonZero(cv2.Canny(student_roi, 50, 150))
        has_student_info = student_reg_extracted or (
            student_edges / max(student_roi.size, 1) > 0.010 and bool(
                re.search(r"(?:register|reg|student|class|section)", ocr_text, re.IGNORECASE)
            )
        )
        if has_student_info:
            detected_regions.append("STUDENT_INFO")
        else:
            missing_regions.append("STUDENT_INFO")

        # Zone 3: Experiment Information (y: 28% to 52%)
        exp_roi = gray[int(h * 0.28):int(h * 0.52), :]
        exp_edges = cv2.countNonZero(cv2.Canny(exp_roi, 50, 150))
        has_exp_info = (exp_edges / max(exp_roi.size, 1) > 0.008) or bool(
            re.search(r"(?:experiment|exp|date|aim|title)", ocr_text, re.IGNORECASE)
        )
        if has_exp_info:
            detected_regions.append("EXPERIMENT_INFO")
        else:
            missing_regions.append("EXPERIMENT_INFO")

        # Zone 4: QR Token Zone
        if qr_detected:
            detected_regions.append("QR_TOKEN_ZONE")
        else:
            missing_regions.append("QR_TOKEN_ZONE")

        # Zone 5: Faculty Evaluation Zone (y: 60% to 100%)
        eval_roi = gray[int(h * 0.60):h, :]
        eval_edges = cv2.countNonZero(cv2.Canny(eval_roi, 50, 150))
        has_eval_info = (eval_edges / max(eval_roi.size, 1) > 0.008) or bool(
            re.search(r"(?:mark|score|signature|faculty|awarded)", ocr_text, re.IGNORECASE)
        )
        if has_eval_info:
            detected_regions.append("FACULTY_EVAL_ZONE")
        else:
            missing_regions.append("FACULTY_EVAL_ZONE")

        # Determine completion
        crop_warning = None
        # Student info and faculty eval are critical non-negotiable regions
        critical_missing = [r for r in ["STUDENT_INFO", "FACULTY_EVAL_ZONE"] if r in missing_regions]

        if is_heavily_cropped:
            crop_warning = f"Abnormal document crop ratio ({aspect_ratio:.2f}); partial page upload suspected"
        elif critical_missing:
            crop_warning = f"Critical document sections missing: {', '.join(critical_missing)}"

        is_complete = len(critical_missing) == 0 and not is_heavily_cropped

        return LayoutAnalysis(
            isComplete=is_complete,
            detectedRegions=detected_regions,
            missingRegions=missing_regions,
            cropWarning=crop_warning
        )
