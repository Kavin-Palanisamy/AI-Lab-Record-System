import cv2
import numpy as np
from typing import Dict, Any, Tuple, List, Optional
from ..models.schemas import TamperAnalysis, MarkRegionAnalysis

class TamperAnalyzer:
    """
    Defensible Heuristic Image Tamper Analysis Module.
    NOTE: Computer vision heuristics indicate statistical anomalies and possible alterations;
    they do not mathematically prove physical authenticity.
    Produces statuses: PASS, MANUAL_REVIEW, or SUSPICIOUS.
    """

    def analyze(
        self,
        img: np.ndarray,
        mark_analysis: Optional[MarkRegionAnalysis] = None
    ) -> TamperAnalysis:
        h, w = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img

        signals: List[str] = []
        suspicion_score = 0.0
        details: Dict[str, Any] = {}

        # 1. Mark Region Coordinate Analysis
        if mark_analysis and mark_analysis.width > 10 and mark_analysis.height > 10:
            mx, my, mw, mh = mark_analysis.x, mark_analysis.y, mark_analysis.width, mark_analysis.height
            mark_crop = gray[my:my+mh, mx:mx+mw]

            # Signal A: Rectangular Replacement / Spliced Patch Detection
            # Look for an artificial internal quadrilateral contour inside the mark box
            mark_roi = gray[max(0, my-20):min(h, my+mh+20), max(0, mx-20):min(w, mx+mw+20)]
            roi_edges = cv2.Canny(mark_roi, 50, 150)
            contours, _ = cv2.findContours(roi_edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
            splice_found = False
            for c in contours:
                peri = cv2.arcLength(c, True)
                approx = cv2.approxPolyDP(c, 0.04 * peri, True)
                cx, cy, cw, ch = cv2.boundingRect(c)
                # An internal splice patch has distinct dimensions (smaller than table, but larger than digits)
                if len(approx) == 4 and 60 < cw < mark_roi.shape[1] * 0.90 and 15 < ch < mark_roi.shape[0] * 0.70:
                    splice_found = True
                    details["splice_box"] = {"x": cx, "y": cy, "width": cw, "height": ch}
                    break

            if splice_found:
                suspicion_score += 0.75
                signals.append("Possible alteration: Suspicious rectangular replacement region detected around mark")

            # Signal B: Unnatural Uniform Background Texture in Mark Box
            bg_mask = mark_crop > 225
            if np.count_nonzero(bg_mask) > 100:
                bg_pixels = mark_crop[bg_mask]
                bg_std = float(np.std(bg_pixels))
                details["mark_bg_std"] = round(bg_std, 2)
                if bg_std < 0.20:
                    suspicion_score += 0.45
                    signals.append("Possible digital paste: Unnaturally uniform background texture in mark region")

            # Signal C: Overwriting / Double Stroke Pattern Detection
            mark_edges = cv2.Canny(mark_crop, 60, 180)
            num_edge_pts = np.count_nonzero(mark_edges)
            mark_area = mw * mh
            stroke_density = num_edge_pts / max(mark_area, 1)
            details["mark_stroke_density"] = round(float(stroke_density), 4)
            if stroke_density > 0.16:
                suspicion_score += 0.40
                signals.append("Irregular stroke density: Possible overwriting pattern detected in mark box")

            # Signal D: Multi-variant OCR discrepancy
            if not mark_analysis.isConsistent and mark_analysis.discrepancyDelta >= 0.8:
                suspicion_score += 0.40
                signals.append(f"Multi-variant OCR discrepancy: Conflicting readings detected (delta: {mark_analysis.discrepancyDelta})")

            # Signal E: Mark Region vs Neighboring Cell Noise Discrepancy
            left_x = max(0, mx - mw)
            if left_x < mx:
                neighbor_crop = gray[my:my+mh, left_x:mx]
                if neighbor_crop.size > 0:
                    n_blur = cv2.GaussianBlur(neighbor_crop, (5, 5), 0)
                    m_blur = cv2.GaussianBlur(mark_crop, (5, 5), 0)
                    n_noise_var = float(np.var(cv2.absdiff(neighbor_crop, n_blur)))
                    m_noise_var = float(np.var(cv2.absdiff(mark_crop, m_blur)))
                    details["mark_noise_var"] = round(m_noise_var, 2)
                    details["neighbor_noise_var"] = round(n_noise_var, 2)
                    if m_noise_var > 1.0 and n_noise_var > 1.0:
                        local_ratio = max(m_noise_var, n_noise_var) / min(m_noise_var, n_noise_var)
                        details["local_cell_noise_ratio"] = round(local_ratio, 2)
                        if local_ratio > 8.0:
                            suspicion_score += 0.30
                            signals.append("Suspicious local noise discrepancy between mark region and adjacent cells")

        # 2. Screenshot / Non-Camera Artifact Indicator
        if len(img.shape) == 3:
            b, g, r = cv2.split(img)
            diff_bg = float(np.mean(cv2.absdiff(b, g)))
            diff_gr = float(np.mean(cv2.absdiff(g, r)))
            details["channel_diff_bg"] = round(diff_bg, 2)
            if diff_bg < 0.05 and diff_gr < 0.05:
                details["is_digital_synthetic"] = True

        norm_suspicion = round(min(max(suspicion_score, 0.0), 1.0), 2)

        # 3. Status Determination
        if norm_suspicion >= 0.65:
            status = "SUSPICIOUS"
        elif norm_suspicion >= 0.35:
            status = "MANUAL_REVIEW"
        else:
            status = "PASS"

        return TamperAnalysis(
            suspicionScore=norm_suspicion,
            signals=signals,
            status=status,
            details=details
        )
