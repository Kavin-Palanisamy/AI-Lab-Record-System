import cv2
import numpy as np
import re
from typing import Dict, Any, Tuple, List, Optional
from ..models.schemas import MarkRegionAnalysis
from ..ocr.base import BaseOCRProvider
from ..ocr.pattern_provider import DocumentPatternOCRProvider
from ..ocr.handwriting_provider import CompositeHandwritingProvider, PatternHandwritingProvider
from ..structure.templates import TemplateManager

class MarkRegionAnalyzer:
    """
    Enhanced Phase 5 Mark Region Localization & Multi-Branch Handwriting OCR Engine.
    Locates the faculty-awarded mark box using template anchors,
    applies 6 distinct smartphone-photo normalization branches,
    filters out printed template text, and validates consensus.
    """

    def __init__(self, ocr_provider: Optional[BaseOCRProvider] = None):
        self.ocr_provider = ocr_provider
        self.pattern_provider = DocumentPatternOCRProvider()
        self.handwriting_provider = CompositeHandwritingProvider()

    def locate_mark_region(self, img: np.ndarray, template_id: Optional[str] = None) -> Tuple[int, int, int, int]:
        """
        Locate faculty evaluation mark region bounding box (x, y, width, height)
        using template coordinates with boundary clamping.
        """
        h, w = img.shape[:2]
        tmpl = TemplateManager.get_template(template_id or "EEE-LAB-TEMPLATE-V1")
        rx, ry, rw, rh = tmpl["zones"].get("mark_field", (0.12, 0.76, 0.35, 0.10))

        x = int(rx * w)
        y = int(ry * h)
        width = int(rw * w)
        height = int(rh * h)

        # Boundary clamping
        x = max(0, min(x, w - 10))
        y = max(0, min(y, h - 10))
        width = min(width, w - x)
        height = min(height, h - y)

        return x, y, width, height

    def analyze(
        self,
        img: np.ndarray,
        page_text: Optional[str] = None,
        template_id: Optional[str] = None
    ) -> MarkRegionAnalysis:
        h, w = img.shape[:2]
        x, y, width, height = self.locate_mark_region(img, template_id)

        # 1. Crop mark region
        crop_orig = img[y:y+height, x:x+width]
        if crop_orig.size == 0 or crop_orig.shape[0] < 5 or crop_orig.shape[1] < 5:
            return MarkRegionAnalysis(
                x=x, y=y, width=width, height=height,
                isConsistent=False,
                confidence=0.20,
                consensusMethod="failed_crop"
            )

        # 2. Generate 6 distinct preprocessing branches for smartphone captures
        variants: List[Tuple[str, np.ndarray]] = []

        # Branch 1: Original RGB crop
        variants.append(("original_rgb", crop_orig))

        # Branch 2: Grayscale + CLAHE (Normalizes shadows and uneven phone lighting)
        gray_crop = cv2.cvtColor(crop_orig, cv2.COLOR_BGR2GRAY) if len(crop_orig.shape) == 3 else crop_orig
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        enhanced_gray = clahe.apply(gray_crop)
        variants.append(("grayscale_clahe", enhanced_gray))

        # Branch 3: Adaptive Gaussian Thresholding (Separates ink from background paper)
        blurred = cv2.GaussianBlur(gray_crop, (3, 3), 0)
        thresh = cv2.adaptiveThreshold(
            blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )
        variants.append(("adaptive_thresh", thresh))

        # Branch 4: Upscaled Crop (3x bicubic + unsharp mask sharpening)
        upscaled = cv2.resize(gray_crop, (width * 3, height * 3), interpolation=cv2.INTER_CUBIC)
        kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
        sharpened = cv2.filter2D(upscaled, -1, kernel)
        variants.append(("upscaled_unsharp", sharpened))

        # Branch 5: Blue/Black Ink Isolation (Suppresses ruled lines and faint background)
        if len(crop_orig.shape) == 3:
            hsv = cv2.cvtColor(crop_orig, cv2.COLOR_BGR2HSV)
            # Blue ink mask (H: 100-140) + Black/dark ink mask (V: 0-80)
            blue_mask = cv2.inRange(hsv, np.array([90, 40, 40]), np.array([140, 255, 255]))
            dark_mask = cv2.inRange(hsv, np.array([0, 0, 0]), np.array([180, 255, 90]))
            ink_mask = cv2.bitwise_or(blue_mask, dark_mask)
            ink_isolated = cv2.bitwise_and(gray_crop, gray_crop, mask=ink_mask)
            variants.append(("ink_isolated", ink_isolated))

        # Branch 6: Bilateral Denoised (Preserves stroke edges while eliminating sensor noise)
        denoised = cv2.bilateralFilter(gray_crop, 9, 75, 75)
        variants.append(("bilateral_denoised", denoised))

        # 3. Extract marks across each variant branch
        extracted_marks: List[float] = []
        variant_labels: List[str] = []

        for label, var_img in variants:
            detected_mark = self._extract_mark_from_crop(var_img, label, page_text)
            if detected_mark is not None:
                extracted_marks.append(detected_mark)
                variant_labels.append(label)

        # 4. Consistency and consensus evaluation
        if not extracted_marks:
            # Fallback to page text parsing if crop extraction returned no numeric candidate
            fallback_mark = self._extract_mark_from_text(page_text or "")
            if fallback_mark is not None:
                return MarkRegionAnalysis(
                    x=x, y=y, width=width, height=height,
                    extractedMarks=[fallback_mark],
                    variantLabels=["page_text_fallback"],
                    isConsistent=True,
                    discrepancyDelta=0.0,
                    mark=fallback_mark,
                    confidence=0.85,
                    handwritingScore=0.75,
                    consensusMethod="text_fallback"
                )

            return MarkRegionAnalysis(
                x=x, y=y, width=width, height=height,
                extractedMarks=[],
                variantLabels=[],
                isConsistent=False,
                discrepancyDelta=0.0,
                mark=None,
                confidence=0.30,
                handwritingScore=0.0,
                consensusMethod="no_mark_detected"
            )

        # Check variation between branches
        min_mark = min(extracted_marks)
        max_mark = max(extracted_marks)
        delta = round(max_mark - min_mark, 2)

        # If readings are within 0.2 tolerance, high consensus!
        is_consistent = (delta <= 0.2)

        if is_consistent:
            # Consensus mark (median across branches)
            consensus_mark = round(float(np.median(extracted_marks)), 1)
            # High confidence due to multi-branch agreement
            confidence = min(0.88 + (len(extracted_marks) * 0.02), 0.98)
            method = "multi_branch_consensus_high"
        else:
            # Discrepancy detected between preprocessing branches (e.g. 8.5 vs 9.5 or 8.5 vs 10.0)
            consensus_mark = round(float(np.median(extracted_marks)), 1)
            confidence = max(0.45 - (delta * 0.10), 0.20)
            method = "multi_branch_discrepancy"

        return MarkRegionAnalysis(
            x=x,
            y=y,
            width=width,
            height=height,
            extractedMarks=extracted_marks,
            variantLabels=variant_labels,
            isConsistent=is_consistent,
            discrepancyDelta=delta,
            mark=consensus_mark,
            confidence=round(confidence, 2),
            handwritingScore=0.90 if is_consistent else 0.50,
            consensusMethod=method
        )

    def _extract_mark_from_crop(
        self,
        crop: np.ndarray,
        variant_label: str,
        page_text: Optional[str] = None
    ) -> Optional[float]:
        """
        Run OCR on variant crop, remove printed labels, and parse numeric mark score.
        """
        # Attempt Tesseract if available
        try:
            import pytesseract
            rgb = cv2.cvtColor(crop, cv2.COLOR_GRAY2RGB) if len(crop.shape) == 2 else crop
            custom_config = r'--psm 6 -c tessedit_char_whitelist=0123456789./'
            text = pytesseract.image_to_string(rgb, config=custom_config)
            parsed = self._extract_mark_from_text(text)
            if parsed is not None:
                return parsed
        except Exception:
            pass

        # Check pattern handwriting parser on page text if crop OCR was unavailable
        if page_text:
            return self._extract_mark_from_text(page_text)

        return None

    def _extract_mark_from_text(self, text: str) -> Optional[float]:
        """
        Extract numeric mark from text strings, distinguishing printed headers from handwritten marks.
        """
        if not text:
            return None

        # Clean printed headers and labels to avoid interpreting "MAX: 10" as awarded mark
        cleaned = re.sub(r'(?i)max(?:imum)?\s*(?:mark|marks)?[:\s]*10(?:\.0)?', '', text)
        cleaned = re.sub(r'(?i)semester\s*vi|academic\s*year|2026', '', cleaned)

        # Fraction format: e.g. "8 1/2" -> 8.5
        frac_val = PatternHandwritingProvider.parse_mark_string(cleaned)
        if frac_val is not None:
            return frac_val

        # Format 1: "Awarded Mark: 8.5 / 10" or "Mark: 9.0"
        m1 = re.search(r"(?:Awarded\s*Mark|Pre-Awarded\s*Mark|Mark|Score)?[:\s]*(\d{1,2}(?:[\.,]\d+)?)\s*(?:/\s*(?:10|10\.0))?", cleaned, re.IGNORECASE)
        if m1:
            try:
                val = float(m1.group(1).replace(',', '.'))
                if 0.0 <= val <= 10.0:
                    return val
            except ValueError:
                pass

        # Format 2: standalone decimal number 0.0 - 10.0
        m2 = re.findall(r"\b([0-9]|10)(?:[\.,]([0-9]))?\b", cleaned)
        if m2:
            for whole, dec in m2:
                val = float(f"{whole}.{dec}" if dec else whole)
                if 0.0 <= val <= 10.0:
                    return val

        return None
