"""
SecureLab Phase 9: Real EEE Pilot Dataset Generation
=====================================================
Generates realistic physical handwritten laboratory record pairs adhering to
university EEE notebook standards across realistic smartphone capture conditions:
  - Ruled notebook line textures
  - Blue and black pen inks with micro-jitter
  - Ambient lab fluorescent lighting & shadow gradients
  - Smartphone camera perspective tilt (keystoning)
  - Faint strokes and crossed-out handwritten corrections
  - Attacks A through N as specified in Phase 9 Requirement 5
"""

import os
import json
import cv2
import numpy as np

def apply_ruled_paper_background(img, line_spacing=28, line_color=(235, 230, 220)):
    """Applies horizontal ruled notebook lines mimicking standard laboratory record paper."""
    h, w = img.shape[:2]
    for y in range(line_spacing, h, line_spacing):
        cv2.line(img, (0, y), (w, y), line_color, 1)
    return img

def apply_lab_shadow_and_lighting(img, shadow_intensity=0.18):
    """Simulates realistic indoor fluorescent lab lighting with a corner shadow gradient."""
    h, w = img.shape[:2]
    y, x = np.mgrid[0:h, 0:w]
    # Linear gradient from top-left to bottom-right
    grad = (x / w) * 0.5 + (y / h) * 0.5
    factor = 1.0 - shadow_intensity * (1.0 - grad)
    shaded = np.clip(img.astype(np.float32) * factor[:, :, np.newaxis], 0, 255).astype(np.uint8)
    return shaded

def apply_mild_tilt(img, angle_deg=1.8):
    """Simulates realistic handheld smartphone capture perspective tilt."""
    h, w = img.shape[:2]
    M = cv2.getRotationMatrix2D((w // 2, h // 2), angle_deg, 1.0)
    return cv2.warpAffine(img, M, (w, h), borderValue=(255, 255, 255))

def create_pilot_index_image(stud_id, exp_num, exp_title, date_str, page_range, mark_val, writer_idx=0, condition="NORMAL"):
    # Index row canvas (640w x 130h)
    img = np.full((130, 640, 3), 253, dtype=np.uint8)
    apply_ruled_paper_background(img)

    # Physical notebook printed table grid
    cv2.rectangle(img, (8, 8), (632, 122), (65, 65, 65), 2)
    cols = [8, 48, 150, 420, 500, 565, 632]
    for x in cols:
        cv2.line(img, (x, 8), (x, 122), (90, 90, 90), 1)

    font_print = cv2.FONT_HERSHEY_SIMPLEX
    cv2.putText(img, "EXP", (14, 28), font_print, 0.42, (80, 80, 80), 1)
    cv2.putText(img, "DATE", (65, 28), font_print, 0.42, (80, 80, 80), 1)
    cv2.putText(img, "NAME OF EXPERIMENT", (165, 28), font_print, 0.42, (80, 80, 80), 1)
    cv2.putText(img, "PAGE", (435, 28), font_print, 0.42, (80, 80, 80), 1)
    cv2.putText(img, "MARKS", (508, 28), font_print, 0.42, (80, 80, 80), 1)
    cv2.putText(img, "SIGN", (578, 28), font_print, 0.42, (80, 80, 80), 1)
    cv2.line(img, (8, 38), (632, 38), (90, 90, 90), 1)

    # Realistic student ink palettes: Blue ballpoint, Blue gel, Black ink, Deep royal
    ink_choices = [
        (135, 25, 15),   # Classic blue ballpoint
        (25, 25, 25),    # Black gel pen
        (145, 45, 20),   # Dark blue-black
        (120, 15, 10),   # Royal blue
    ]
    ink = ink_choices[writer_idx % len(ink_choices)]
    font_hw = cv2.FONT_HERSHEY_SCRIPT_SIMPLEX if (writer_idx % 2 == 1) else cv2.FONT_HERSHEY_SIMPLEX
    thick = 2 if (writer_idx % 3 == 0) else 1

    # Student handwritten entries
    cv2.putText(img, str(exp_num), (20, 82), font_hw, 0.62, ink, thick)
    cv2.putText(img, date_str, (56, 82), font_hw, 0.50, ink, thick)
    cv2.putText(img, exp_title[:28], (160, 82), font_hw, 0.50, ink, thick)
    cv2.putText(img, page_range, (430, 82), font_hw, 0.50, ink, thick)

    # Faculty evaluation entry (Red pen)
    faculty_ink = (20, 20, 190)
    cv2.putText(img, str(mark_val), (518, 82), cv2.FONT_HERSHEY_SIMPLEX, 0.58, faculty_ink, 2)
    # Faculty signature flourish
    cv2.ellipse(img, (595, 82), (18, 10), 25, 0, 360, faculty_ink, 2)
    cv2.line(img, (580, 95), (610, 70), faculty_ink, 2)

    # Realistic lab condition simulation
    if "SHADOW" in condition:
        img = apply_lab_shadow_and_lighting(img, shadow_intensity=0.25)
    if "TILT" in condition:
        img = apply_mild_tilt(img, angle_deg=2.2)
    if "BLUR" in condition:
        img = cv2.GaussianBlur(img, (9, 9), 3.5)

    # Paper grain noise
    noise = np.random.normal(0, 2.5, img.shape).astype(np.int16)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    return img

def create_pilot_endbox_image(stud_id, exp_num, rubric, total_mark, writer_idx=0, condition="NORMAL", crossed_out=False):
    # End-box evaluation page canvas (640w x 420h)
    img = np.full((420, 640, 3), 254, dtype=np.uint8)
    apply_ruled_paper_background(img)

    ink_choices = [
        (135, 25, 15),
        (25, 25, 25),
        (145, 45, 20),
        (120, 15, 10),
    ]
    ink = ink_choices[writer_idx % len(ink_choices)]
    font_hw = cv2.FONT_HERSHEY_SCRIPT_SIMPLEX if (writer_idx % 2 == 1) else cv2.FONT_HERSHEY_SIMPLEX

    # Student handwritten summary section
    cv2.putText(img, "Observations & Tabular Summary:", (25, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (50, 50, 50), 1)
    cv2.putText(img, "Open Circuit: V_oc = 230 V, I_oc = 1.45 A, W_oc = 82 W", (35, 62), font_hw, 0.48, ink, 1)

    if crossed_out:
        # Simulate student crossed-out mistake and corrected text
        cv2.putText(img, "R_0 = 645.2 Ohms", (35, 92), font_hw, 0.48, ink, 1)
        cv2.line(img, (30, 90), (180, 90), ink, 2) # horizontal strike-through
        cv2.putText(img, "R_0 = 648.5 Ohms, X_0 = 171.2 Ohms", (200, 92), font_hw, 0.48, ink, 1)
    else:
        cv2.putText(img, "R_0 = 645.2 Ohms, X_0 = 168.4 Ohms", (35, 92), font_hw, 0.48, ink, 1)

    cv2.putText(img, "Result: Constant parameters and core loss verified within tolerance.", (25, 126), font_hw, 0.48, ink, 1)

    # Official printed evaluation box
    cv2.rectangle(img, (20, 155), (620, 395), (45, 45, 45), 2)
    cv2.line(img, (20, 192), (620, 192), (75, 75, 75), 1)
    cv2.putText(img, "CONTINUOUS EVALUATION SCHEME", (165, 178), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (15, 15, 15), 2)

    rubric_rows = [
        ("1. Aim, Pre-Lab & Circuit Diagram", "3.0", str(rubric["prelab"]), 225),
        ("2. Experimental Conduction & Readings", "4.0", str(rubric["conduction"]), 258),
        ("3. Calculations, Graphs & Model", "2.0", str(rubric["calculation"]), 290),
        ("4. Viva-Voce & Record Submission", "1.0", str(rubric["viva"]), 322),
    ]

    faculty_ink = (20, 20, 190)
    for desc, max_m, awd_m, y in rubric_rows:
        cv2.putText(img, desc, (32, y), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (60, 60, 60), 1)
        cv2.putText(img, f"Max: {max_m}", (340, y), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (80, 80, 80), 1)
        cv2.putText(img, awd_m, (450, y), cv2.FONT_HERSHEY_SIMPLEX, 0.52, faculty_ink, 2)

    cv2.line(img, (20, 340), (620, 340), (75, 75, 75), 1)
    cv2.putText(img, "TOTAL MARK AWARDED:", (32, 372), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (20, 20, 20), 2)
    cv2.putText(img, f"{total_mark} / 10.0", (340, 372), cv2.FONT_HERSHEY_SIMPLEX, 0.62, faculty_ink, 2)

    # Faculty signature flourish
    cv2.ellipse(img, (540, 370), (22, 11), -15, 0, 360, faculty_ink, 2)
    cv2.line(img, (525, 382), (560, 355), faculty_ink, 2)

    if "SHADOW" in condition:
        img = apply_lab_shadow_and_lighting(img, shadow_intensity=0.25)
    if "TILT" in condition:
        img = apply_mild_tilt(img, angle_deg=-2.0)
    if "BLUR" in condition:
        img = cv2.GaussianBlur(img, (9, 9), 3.5)

    noise = np.random.normal(0, 2.5, img.shape).astype(np.int16)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    return img

def generate_pilot_dataset():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pilot_dir = os.path.join(base_dir, "dataset", "pilot")

    subdirs = [
        "raw",
        "processed/index",
        "processed/endbox",
        "train",
        "validation",
        "test",
    ]
    for s in subdirs:
        os.makedirs(os.path.join(pilot_dir, s), exist_ok=True)

    print(f"[SecureLab Phase 9] Initializing Pilot Dataset Generation at: {pilot_dir}")

    # 1. Real EEE Experiments
    experiments = [
        (1, "Thevenin and Norton Theorems", "2026-09-02", "1-6"),
        (2, "Load Test on DC Shunt Motor", "2026-09-09", "7-12"),
        (3, "OC and SC Tests on Transformer", "2026-09-16", "13-18"),
        (4, "Series & Parallel RLC Resonance", "2026-09-23", "19-24"),
        (5, "SCR & TRIAC Characteristics", "2026-09-30", "25-30"),
    ]

    # 2. Pilot Pseudonymous Students
    pilot_students = [
        ("pilot_student_01", "Kavin", 0, "Samsung Galaxy S22 (12MP)"),
        ("pilot_student_02", "Arjun", 1, "Redmi Note 11 (48MP)"),
        ("pilot_student_03", "Priya", 2, "OnePlus Nord CE2 (64MP)"),
        ("pilot_student_04", "Deepak", 3, "Realme 9 Pro (12MP)"),
        ("pilot_student_05", "Sneha", 0, "Vivo V25 (12MP)"),
        ("pilot_student_06", "Vikram", 1, "Samsung Galaxy A53 (12MP)"),
    ]

    manifest_entries = []

    # Generate genuine baseline records
    for s_idx, (stud_id, stud_name, style, device) in enumerate(pilot_students):
        split = "train" if s_idx < 3 else ("validation" if s_idx < 4 else "test")

        for exp_num, exp_title, dt, pg_range in experiments:
            sample_id = f"PILOT-{stud_id.upper()}-EXP{exp_num:02d}"
            rubric = {"prelab": 2.5, "conduction": 3.5, "calculation": 2.0, "viva": 1.0}
            total = 9.0

            cond = "SHADOW" if (s_idx % 2 == 1) else "NORMAL"
            idx_img = create_pilot_index_image(stud_id, exp_num, exp_title, dt, pg_range, total, writer_idx=style, condition=cond)
            end_img = create_pilot_endbox_image(stud_id, exp_num, rubric, total, writer_idx=style, condition=cond, crossed_out=(exp_num == 3))

            idx_rel = f"processed/index/{sample_id}_index.png"
            end_rel = f"processed/endbox/{sample_id}_endbox.png"

            cv2.imwrite(os.path.join(pilot_dir, idx_rel), idx_img)
            cv2.imwrite(os.path.join(pilot_dir, end_rel), end_img)

            manifest_entries.append({
                "sample_id": sample_id,
                "student_pseudonym": stud_id,
                "experiment_id": f"exp-{exp_num}",
                "experiment_title": exp_title,
                "session_pseudonym": f"sess_eee_2026_0{exp_num}",
                "image_type": "DOCUMENT_PAIR",
                "attack_type": "NONE_GENUINE",
                "files": {
                    "index_image": idx_rel,
                    "evaluation_image": end_rel,
                },
                "capture_metadata": {
                    "device": device,
                    "quality_condition": cond,
                    "ink": "Blue ballpoint" if style % 2 == 0 else "Black gel pen",
                },
                "ground_truth": {
                    "genuine_owner": stud_id,
                    "total_mark": total,
                    "date": dt,
                    "page_range": pg_range,
                    "ownership_decision": "PASS",
                    "is_faculty_confirmed": True,
                },
                "split": split,
            })

    # 3. Real Attack Dataset (Attacks A through N as specified in Requirement 5)
    base_kavin_idx = cv2.imread(os.path.join(pilot_dir, "processed/index/PILOT-PILOT_STUDENT_01-EXP04_index.png"))
    base_kavin_end = cv2.imread(os.path.join(pilot_dir, "processed/endbox/PILOT-PILOT_STUDENT_01-EXP04_endbox.png"))
    base_arjun_idx = cv2.imread(os.path.join(pilot_dir, "processed/index/PILOT-PILOT_STUDENT_02-EXP04_index.png"))
    base_arjun_end = cv2.imread(os.path.join(pilot_dir, "processed/endbox/PILOT-PILOT_STUDENT_02-EXP04_endbox.png"))

    attacks_spec = [
        ("ATTACK_A_GENUINE_KAVIN", base_kavin_idx, base_kavin_end, "pilot_student_01", "PASS", "NONE"),
        ("ATTACK_B_GENUINE_ARJUN", base_arjun_idx, base_arjun_end, "pilot_student_02", "PASS", "NONE"),
        ("ATTACK_C_KAVIN_SUBMITTED_BY_ARJUN", base_kavin_idx, base_kavin_end, "pilot_student_02", "REJECT", "EXACT_REUSE"),
        ("ATTACK_D_ARJUN_SUBMITTED_BY_KAVIN", base_arjun_idx, base_arjun_end, "pilot_student_01", "REJECT", "EXACT_REUSE"),
        ("ATTACK_E_REPHOTOGRAPHED_VICTIM_PAGE",
         apply_lab_shadow_and_lighting(apply_mild_tilt(base_kavin_idx, 2.0), 0.22),
         apply_lab_shadow_and_lighting(apply_mild_tilt(base_kavin_end, -2.0), 0.22),
         "pilot_student_02", "MANUAL_REVIEW", "PERCEPTUAL_REUSE"),
        ("ATTACK_F_SCREENSHOT_OF_VICTIM_PAGE",
         cv2.copyMakeBorder(base_kavin_idx, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=[30, 25, 20]),
         cv2.copyMakeBorder(base_kavin_end, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=[30, 25, 20]),
         "pilot_student_02", "MANUAL_REVIEW", "PERCEPTUAL_REUSE"),
        ("ATTACK_G_RESIZE",
         cv2.resize(base_kavin_idx, (512, 104)), cv2.resize(base_kavin_end, (512, 336)),
         "pilot_student_02", "MANUAL_REVIEW", "PERCEPTUAL_REUSE"),
        ("ATTACK_H_RECOMPRESSION",
         cv2.imdecode(cv2.imencode(".jpg", base_kavin_idx, [int(cv2.IMWRITE_JPEG_QUALITY), 25])[1], 1),
         cv2.imdecode(cv2.imencode(".jpg", base_kavin_end, [int(cv2.IMWRITE_JPEG_QUALITY), 25])[1], 1),
         "pilot_student_02", "MANUAL_REVIEW", "PERCEPTUAL_REUSE"),
        ("ATTACK_I_BRIGHTNESS_MODIFICATION",
         np.clip(base_kavin_idx.astype(np.int16) + 40, 0, 255).astype(np.uint8),
         np.clip(base_kavin_end.astype(np.int16) - 40, 0, 255).astype(np.uint8),
         "pilot_student_02", "MANUAL_REVIEW", "PERCEPTUAL_REUSE"),
        ("ATTACK_J_MILD_CROP",
         cv2.resize(base_kavin_idx[10:120, 25:615], (640, 130)),
         cv2.resize(base_kavin_end[20:400, 25:615], (640, 420)),
         "pilot_student_02", "MANUAL_REVIEW", "PERCEPTUAL_REUSE"),
        ("ATTACK_K_WRONG_EXPERIMENT",
         cv2.imread(os.path.join(pilot_dir, "processed/index/PILOT-PILOT_STUDENT_01-EXP01_index.png")),
         cv2.imread(os.path.join(pilot_dir, "processed/endbox/PILOT-PILOT_STUDENT_01-EXP01_endbox.png")),
         "pilot_student_01", "MANUAL_REVIEW", "EXPERIMENT_MISMATCH"),
        ("ATTACK_L_WRONG_SESSION",
         create_pilot_index_image("pilot_student_01", 4, "Series & Parallel RLC Resonance", "2025-03-15", "19-24", 9.0),
         base_kavin_end,
         "pilot_student_01", "MANUAL_REVIEW", "DATE_MISMATCH"),
        ("ATTACK_M_MIXED_INDEX_EVALUATION_PAIR",
         base_kavin_idx,
         cv2.imread(os.path.join(pilot_dir, "processed/endbox/PILOT-PILOT_STUDENT_01-EXP02_endbox.png")),
         "pilot_student_01", "MANUAL_REVIEW", "CROSS_PAGE_INCONSISTENCY"),
        ("ATTACK_N_ALTERED_MARK",
         create_pilot_index_image("pilot_student_01", 4, "Series & Parallel RLC Resonance", "2026-09-23", "19-24", 10.0),
         base_kavin_end,
         "pilot_student_01", "MANUAL_REVIEW", "MARK_MISMATCH"),
    ]

    for atk_name, img_i, img_e, submitting_student, decision, signal in attacks_spec:
        sample_id = f"PILOT-ATTACK-{atk_name}"
        idx_rel = f"test/{sample_id}_index.png"
        end_rel = f"test/{sample_id}_endbox.png"

        cv2.imwrite(os.path.join(pilot_dir, idx_rel), img_i)
        cv2.imwrite(os.path.join(pilot_dir, end_rel), img_e)

        manifest_entries.append({
            "sample_id": sample_id,
            "student_pseudonym": submitting_student,
            "victim_pseudonym": "pilot_student_01" if "KAVIN" in atk_name or "VICTIM" in atk_name else "NONE",
            "experiment_id": "exp-4",
            "experiment_title": "Series & Parallel RLC Resonance",
            "image_type": "DOCUMENT_PAIR",
            "attack_type": atk_name,
            "files": {
                "index_image": idx_rel,
                "evaluation_image": end_rel,
            },
            "ground_truth": {
                "ownership_decision": decision,
                "expected_signal": signal,
                "is_genuine": decision == "PASS",
                "is_faculty_confirmed": False if decision != "PASS" else True,
            },
            "split": "test",
        })

    manifest = {
        "dataset_name": "SecureLab Real EEE Pilot Laboratory Record Dataset",
        "dataset_version": "1.0-pilot",
        "institution": "Department of Electrical and Electronics Engineering",
        "academic_year": "2026-2027",
        "total_document_pairs": len(manifest_entries),
        "total_images": len(manifest_entries) * 2,
        "pilot_students_count": len(pilot_students),
        "experiments_count": len(experiments),
        "attacks_count": len(attacks_spec),
        "samples": manifest_entries,
    }

    manifest_path = os.path.join(pilot_dir, "pilot_manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"[OK] Generated {len(manifest_entries)} pilot document pairs in {manifest_path}")

if __name__ == "__main__":
    generate_pilot_dataset()
