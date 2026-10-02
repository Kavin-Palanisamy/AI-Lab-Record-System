from typing import List, Dict, Any, Tuple
import numpy as np

class EvaluationMetrics:
    """
    Measurable recognition and security metrics engine.
    Strictly separates model/recognition performance from security rule enforcement.
    """

    @staticmethod
    def evaluate_mark_recognition(
        ground_truth: List[float],
        predictions: List[float]
    ) -> Dict[str, Any]:
        """
        Compute Exact Match Accuracy and tolerance margins for handwritten marks.
        """
        if not ground_truth or len(ground_truth) != len(predictions):
            return {"exactMatchAccuracy": 0.0, "withinHalfMarkAccuracy": 0.0, "totalEvaluated": 0}

        exact_matches = sum(1 for gt, pr in zip(ground_truth, predictions) if abs(gt - pr) < 1e-4)
        within_half = sum(1 for gt, pr in zip(ground_truth, predictions) if abs(gt - pr) <= 0.5 + 1e-4)
        total = len(ground_truth)

        # Confusion pair evaluation
        confusion_pairs = [
            (5.0, 5.5),
            (6.0, 8.0),
            (8.0, 8.5),
            (8.5, 9.5),
            (9.0, 10.0),
        ]
        confusion_stats: Dict[str, Dict[str, int]] = {}

        for a, b in confusion_pairs:
            pair_key = f"{a}_vs_{b}"
            confused_a_as_b = sum(1 for gt, pr in zip(ground_truth, predictions) if abs(gt - a) < 1e-4 and abs(pr - b) < 1e-4)
            confused_b_as_a = sum(1 for gt, pr in zip(ground_truth, predictions) if abs(gt - b) < 1e-4 and abs(pr - a) < 1e-4)
            confusion_stats[pair_key] = {
                "confused_forward": confused_a_as_b,
                "confused_reverse": confused_b_as_a,
                "clean_discrimination_rate": 1.0 - ((confused_a_as_b + confused_b_as_a) / max(total, 1))
            }

        return {
            "totalEvaluated": total,
            "exactMatchAccuracy": round(exact_matches / total, 4),
            "withinHalfMarkAccuracy": round(within_half / total, 4),
            "confusionPairs": confusion_stats,
        }

    @staticmethod
    def evaluate_field_recognition(
        ground_truth_regs: List[str],
        predicted_regs: List[str]
    ) -> Dict[str, Any]:
        """
        Compute field-level exact match and character-level accuracy for student register numbers.
        """
        if not ground_truth_regs or len(ground_truth_regs) != len(predicted_regs):
            return {"fieldAccuracy": 0.0, "characterAccuracy": 0.0}

        exact = sum(1 for gt, pr in zip(ground_truth_regs, predicted_regs) if gt.strip() == pr.strip())
        total_chars = 0
        matching_chars = 0

        for gt, pr in zip(ground_truth_regs, predicted_regs):
            gt_clean = gt.strip()
            pr_clean = pr.strip()
            total_chars += len(gt_clean)
            for c1, c2 in zip(gt_clean, pr_clean):
                if c1 == c2:
                    matching_chars += 1

        total = len(ground_truth_regs)
        return {
            "totalEvaluated": total,
            "fieldAccuracy": round(exact / total, 4),
            "characterAccuracy": round(matching_chars / max(total_chars, 1), 4)
        }

    @staticmethod
    def evaluate_security_rules(
        ownership_tests: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Evaluate zero-trust security rule enforcement.
        Unauthorized acceptance rate MUST BE 0.0000.
        """
        total_unauthorized_attempts = 0
        unauthorized_accepted = 0

        for test in ownership_tests:
            is_unauthorized = test.get("isUnauthorized", False)
            was_accepted = test.get("wasAccepted", False)

            if is_unauthorized:
                total_unauthorized_attempts += 1
                if was_accepted:
                    unauthorized_accepted += 1

        uar = (unauthorized_accepted / total_unauthorized_attempts) if total_unauthorized_attempts > 0 else 0.0

        return {
            "totalUnauthorizedAttempts": total_unauthorized_attempts,
            "unauthorizedAccepted": unauthorized_accepted,
            "unauthorizedAcceptanceRate": round(uar, 4),
            "securityInvariantMaintained": (unauthorized_accepted == 0)
        }
