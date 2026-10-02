"""
SecureLab Phase 8 Dataset Generation Script
===========================================
Generates realistic handwritten EEE laboratory record pairs and adversarial
transformation sets (Attacks A–N) under ethical, privacy-preserving pseudonymous
student profiles for rigorous model benchmarking.
"""

import os
import json
import random
import cv2
import numpy as np

def create_index_image(student_pseudo, exp_num, exp_title, date_str, page_range, mark_val, writer_style=0):
    # Create white canvas for index row (600w x 120h)
    img = np.full((120, 600, 3), 255, dtype=np.uint8)
    
    # Draw table border and vertical column lines
    cv2.rectangle(img, (5, 5), (595, 115), (60, 60, 60), 2)
    col_x = [5, 45, 145, 400, 480, 540, 595]
    for x in col_x:
        cv2.line(img, (x, 5), (x, 115), (100, 100, 100), 1)
        
    # Table headers (printed)
    font_printed = cv2.FONT_HERSHEY_SIMPLEX
    cv2.putText(img, "EXP", (12, 25), font_printed, 0.4, (80, 80, 80), 1)
    cv2.putText(img, "DATE", (60, 25), font_printed, 0.4, (80, 80, 80), 1)
    cv2.putText(img, "EXPERIMENT TITLE", (160, 25), font_printed, 0.4, (80, 80, 80), 1)
    cv2.putText(img, "PAGE", (415, 25), font_printed, 0.4, (80, 80, 80), 1)
    cv2.putText(img, "MARKS", (488, 25), font_printed, 0.4, (80, 80, 80), 1)
    cv2.putText(img, "SIGN", (550, 25), font_printed, 0.4, (80, 80, 80), 1)
    cv2.line(img, (5, 35), (595, 35), (100, 100, 100), 1)

    # Handwritten values (student style variations: stroke weight, ink color, jitter)
    ink_colors = [
        (130, 20, 15),   # blue ink 1
        (150, 40, 20),   # blue-black
        (120, 30, 10),   # deep royal blue
        (30, 30, 30),    # dark grey / black
    ]
    ink = ink_colors[writer_style % len(ink_colors)]
    font_hw = cv2.FONT_HERSHEY_SCRIPT_SIMPLEX if (writer_style % 2 == 1) else cv2.FONT_HERSHEY_SIMPLEX
    scale = 0.55
    thickness = 2 if (writer_style % 3 == 0) else 1
    
    cv2.putText(img, str(exp_num), (18, 75), font_hw, 0.6, ink, thickness)
    cv2.putText(img, date_str, (55, 75), font_hw, 0.48, ink, thickness)
    cv2.putText(img, exp_title[:28], (155, 75), font_hw, 0.48, ink, thickness)
    cv2.putText(img, page_range, (415, 75), font_hw, 0.48, ink, thickness)
    
    # Faculty handwritten mark & signature (different ink: red/green)
    faculty_ink = (20, 20, 180) # red pen
    cv2.putText(img, str(mark_val), (495, 75), cv2.FONT_HERSHEY_SIMPLEX, 0.55, faculty_ink, 2)
    # Faculty signature stroke
    cv2.ellipse(img, (570, 75), (16, 8), 20, 0, 360, faculty_ink, 2)
    cv2.line(img, (558, 85), (582, 65), faculty_ink, 2)
    
    # Add subtle paper texture noise
    noise = np.random.normal(0, 3, img.shape).astype(np.int16)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    return img

def create_endbox_image(student_pseudo, exp_num, mark_breakdown, total_mark, writer_style=0):
    # Canvas for End-of-Experiment page evaluation box (600w x 400h)
    img = np.full((400, 600, 3), 255, dtype=np.uint8)
    
    # Top section: Student handwritten observation summary & result
    ink_colors = [
        (130, 20, 15),
        (150, 40, 20),
        (120, 30, 10),
        (30, 30, 30),
    ]
    ink = ink_colors[writer_style % len(ink_colors)]
    font_hw = cv2.FONT_HERSHEY_SCRIPT_SIMPLEX if (writer_style % 2 == 1) else cv2.FONT_HERSHEY_SIMPLEX
    
    cv2.putText(img, "Observations & Tabular Summary:", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (50, 50, 50), 1)
    cv2.putText(img, "V_in = 230V, I_0 = 1.42A, W_0 = 78W (Core Loss)", (30, 60), font_hw, 0.45, ink, 1)
    cv2.putText(img, "R_0 = 678.4 Ohms, X_0 = 172.6 Ohms", (30, 90), font_hw, 0.45, ink, 1)
    cv2.putText(img, "Result: Equivalent circuit parameters determined successfully.", (20, 125), font_hw, 0.45, ink, 1)
    
    # Bottom section: Official Continuous Evaluation Scheme Box
    cv2.rectangle(img, (20, 150), (580, 380), (40, 40, 40), 2)
    cv2.line(img, (20, 185), (580, 185), (80, 80, 80), 1)
    cv2.putText(img, "CONTINUOUS EVALUATION SCHEME", (140, 172), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (20, 20, 20), 2)
    
    # Rubric rows
    rubrics = [
        ("1. Pre-Lab / Circuit Design", "3.0", str(mark_breakdown["prelab"]), 215),
        ("2. Conduction & Observations", "4.0", str(mark_breakdown["conduction"]), 245),
        ("3. Calculations & Results", "2.0", str(mark_breakdown["calculation"]), 275),
        ("4. Viva Voce & Record", "1.0", str(mark_breakdown["viva"]), 305),
    ]
    
    faculty_ink = (20, 20, 180) # red ink
    for desc, max_m, awd_m, y in rubrics:
        cv2.putText(img, desc, (30, y), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (60, 60, 60), 1)
        cv2.putText(img, f"Max: {max_m}", (320, y), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (80, 80, 80), 1)
        cv2.putText(img, awd_m, (420, y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, faculty_ink, 2)
        cv2.line(img, (20, y + 8), (580, y + 8), (200, 200, 200), 1)
        
    # Total row
    cv2.rectangle(img, (20, 320), (580, 375), (240, 240, 240), -1)
    cv2.rectangle(img, (20, 320), (580, 375), (40, 40, 40), 2)
    cv2.putText(img, "TOTAL AWARDED MARK:", (30, 350), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (10, 10, 10), 2)
    cv2.putText(img, f"{total_mark} / 10.0", (320, 355), cv2.FONT_HERSHEY_SIMPLEX, 0.7, faculty_ink, 2)
    
    # Faculty signature block
    cv2.ellipse(img, (510, 345), (25, 12), -25, 0, 360, faculty_ink, 2)
    cv2.line(img, (490, 360), (540, 335), faculty_ink, 2)
    cv2.putText(img, "Staff Sign", (485, 370), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (80, 80, 80), 1)
    
    # Add subtle paper texture noise
    noise = np.random.normal(0, 3, img.shape).astype(np.int16)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    return img

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dataset_dir = os.path.join(base_dir, "dataset")
    
    # Ensure directory tree
    for d in ["raw", "processed/index", "processed/endbox", "train", "validation", "test"]:
        os.makedirs(os.path.join(dataset_dir, d), exist_ok=True)
        
    students = [
        ("anon_student_01", 0),
        ("anon_student_02", 1),
        ("anon_student_03", 2),
        ("anon_student_04", 3),
        ("anon_student_05", 0),
        ("anon_student_06", 1),
        ("anon_student_07", 2),
        ("anon_student_08", 3),
    ]
    
    experiments = [
        (1, "Transformer OC/SC Test", "2026-08-10", "1-6"),
        (2, "DC Shunt Motor Load Test", "2026-08-24", "7-13"),
        (3, "Three Phase Induction Motor", "2026-09-07", "14-20"),
        (4, "RLC Resonance Circuit", "2026-09-28", "21-27"),
        (5, "SCR Phase Control Inverter", "2026-10-12", "28-34"),
    ]
    
    manifest_entries = []
    
    # Generate canonical Genuine Pairs
    for s_idx, (stud_id, style) in enumerate(students):
        split = "train" if s_idx < 3 else ("validation" if s_idx < 5 else "test")
        
        for exp_num, exp_title, dt, pg_range in experiments:
            sample_id = f"PAIR-{stud_id.upper()}-EXP{exp_num:02d}"
            
            # Consistent marks
            rubric = {"prelab": 2.5, "conduction": 3.5, "calculation": 2.0, "viva": 1.0}
            total = 9.0
            
            idx_img = create_index_image(stud_id, exp_num, exp_title, dt, pg_range, total, writer_style=style)
            end_img = create_endbox_image(stud_id, exp_num, rubric, total, writer_style=style)
            
            idx_rel = f"processed/index/{sample_id}_index.png"
            end_rel = f"processed/endbox/{sample_id}_endbox.png"
            
            cv2.imwrite(os.path.join(dataset_dir, idx_rel), idx_img)
            cv2.imwrite(os.path.join(dataset_dir, end_rel), end_img)
            
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
                    "device": "smartphone_camera_12mp",
                    "quality_condition": "NORMAL",
                },
                "ground_truth": {
                    "total_mark": total,
                    "marks_breakdown": rubric,
                    "date": dt,
                    "page_range": pg_range,
                    "ownership_decision": "PASS",
                },
                "split": split,
            })
            
    # Generate Adversarial Attacks A through N on test split (using anon_student_06, 07, 08 and target 01)
    base_kavin_idx = cv2.imread(os.path.join(dataset_dir, "processed/index/PAIR-ANON_STUDENT_01-EXP04_index.png"))
    base_kavin_end = cv2.imread(os.path.join(dataset_dir, "processed/endbox/PAIR-ANON_STUDENT_01-EXP04_endbox.png"))
    
    attacks = [
        ("ATTACK_A_EXACT_DUPLICATE", lambda i: i.copy(), lambda e: e.copy(), "REJECT"),
        ("ATTACK_B_RESIZE", lambda i: cv2.resize(i, (450, 90)), lambda e: cv2.resize(e, (450, 300)), "MANUAL_REVIEW"),
        ("ATTACK_C_RECOMPRESSION", lambda i: cv2.imdecode(cv2.imencode(".jpg", i, [int(cv2.IMWRITE_JPEG_QUALITY), 30])[1], 1),
                                   lambda e: cv2.imdecode(cv2.imencode(".jpg", e, [int(cv2.IMWRITE_JPEG_QUALITY), 30])[1], 1), "MANUAL_REVIEW"),
        ("ATTACK_D_BRIGHTNESS", lambda i: np.clip(i.astype(np.int16) + 45, 0, 255).astype(np.uint8),
                                 lambda e: np.clip(e.astype(np.int16) - 45, 0, 255).astype(np.uint8), "MANUAL_REVIEW"),
        ("ATTACK_E_MILD_ROTATION", lambda i: cv2.warpAffine(i, cv2.getRotationMatrix2D((300, 60), 3.5, 1.0), (600, 120), borderValue=(255, 255, 255)),
                                   lambda e: cv2.warpAffine(e, cv2.getRotationMatrix2D((300, 200), -3.5, 1.0), (600, 400), borderValue=(255, 255, 255)), "MANUAL_REVIEW"),
        ("ATTACK_F_MILD_CROP", lambda i: cv2.resize(i[10:110, 30:570], (600, 120)),
                               lambda e: cv2.resize(e[20:380, 30:570], (600, 400)), "MANUAL_REVIEW"),
        ("ATTACK_G_SCREENSHOT", lambda i: cv2.copyMakeBorder(i, 25, 25, 25, 25, cv2.BORDER_CONSTANT, value=[35, 30, 25]),
                                lambda e: cv2.copyMakeBorder(e, 25, 25, 25, 25, cv2.BORDER_CONSTANT, value=[35, 30, 25]), "MANUAL_REVIEW"),
        ("ATTACK_H_REPHOTOGRAPHED", lambda i: cv2.addWeighted(i, 0.9, np.random.normal(0, 8, i.shape).astype(np.uint8), 0.1, 0),
                                    lambda e: cv2.addWeighted(e, 0.9, np.random.normal(0, 8, e.shape).astype(np.uint8), 0.1, 0), "MANUAL_REVIEW"),
    ]
    
    for atk_name, fn_idx, fn_end, exp_decision in attacks:
        sample_id = f"PAIR-TEST-{atk_name}"
        t_idx = fn_idx(base_kavin_idx)
        t_end = fn_end(base_kavin_end)
        
        idx_rel = f"test/{sample_id}_index.png"
        end_rel = f"test/{sample_id}_endbox.png"
        
        cv2.imwrite(os.path.join(dataset_dir, idx_rel), t_idx)
        cv2.imwrite(os.path.join(dataset_dir, end_rel), t_end)
        
        manifest_entries.append({
            "sample_id": sample_id,
            "student_pseudonym": "anon_student_07", # attacker attempting submission
            "victim_pseudonym": "anon_student_01",
            "experiment_id": "exp-4",
            "experiment_title": "RLC Resonance Circuit",
            "image_type": "DOCUMENT_PAIR",
            "attack_type": atk_name,
            "files": {
                "index_image": idx_rel,
                "evaluation_image": end_rel,
            },
            "ground_truth": {
                "ownership_decision": exp_decision,
                "reuse_detected": True,
            },
            "split": "test",
        })
        
    # Attack I: Different student handwritten page submitted
    # Attack J: Different experiment from same student
    # Attack K: Copied index + different evaluation page
    # Attack L: Different index + copied evaluation page
    # Attack M: Kavin's images submitted by Arjun
    # Attack N: Arjun's genuine images submitted by Arjun
    composite_attacks = [
        ("ATTACK_I_DIFF_WRITER_PAGE", "anon_student_08", "exp-4", "processed/index/PAIR-ANON_STUDENT_08-EXP04_index.png", "processed/endbox/PAIR-ANON_STUDENT_01-EXP04_endbox.png", "MANUAL_REVIEW"),
        ("ATTACK_J_DIFF_EXPERIMENT", "anon_student_06", "exp-4", "processed/index/PAIR-ANON_STUDENT_06-EXP01_index.png", "processed/endbox/PAIR-ANON_STUDENT_06-EXP04_endbox.png", "MANUAL_REVIEW"),
        ("ATTACK_K_COPIED_INDEX_DIFF_ENDBOX", "anon_student_07", "exp-4", "processed/index/PAIR-ANON_STUDENT_01-EXP04_index.png", "processed/endbox/PAIR-ANON_STUDENT_07-EXP04_endbox.png", "MANUAL_REVIEW"),
        ("ATTACK_L_DIFF_INDEX_COPIED_ENDBOX", "anon_student_07", "exp-4", "processed/index/PAIR-ANON_STUDENT_07-EXP04_index.png", "processed/endbox/PAIR-ANON_STUDENT_01-EXP04_endbox.png", "MANUAL_REVIEW"),
        ("ATTACK_M_CROSS_STUDENT_REUSE", "anon_student_07", "exp-4", "processed/index/PAIR-ANON_STUDENT_01-EXP04_index.png", "processed/endbox/PAIR-ANON_STUDENT_01-EXP04_endbox.png", "REJECT"),
        ("ATTACK_N_GENUINE_SELF", "anon_student_07", "exp-4", "processed/index/PAIR-ANON_STUDENT_07-EXP04_index.png", "processed/endbox/PAIR-ANON_STUDENT_07-EXP04_endbox.png", "PASS"),
    ]
    
    for atk_name, stud_submitting, exp_id, idx_src, end_src, exp_decision in composite_attacks:
        sample_id = f"PAIR-TEST-{atk_name}"
        manifest_entries.append({
            "sample_id": sample_id,
            "student_pseudonym": stud_submitting,
            "experiment_id": exp_id,
            "image_type": "DOCUMENT_PAIR",
            "attack_type": atk_name,
            "files": {
                "index_image": idx_src,
                "evaluation_image": end_src,
            },
            "ground_truth": {
                "ownership_decision": exp_decision,
            },
            "split": "test",
        })
        
    manifest_path = os.path.join(dataset_dir, "dataset_manifest.json")
    with open(manifest_path, "w") as f:
        json.dump({
            "dataset_version": "1.0-phase8",
            "total_samples": len(manifest_entries),
            "splits": {
                "train": len([e for e in manifest_entries if e["split"] == "train"]),
                "validation": len([e for e in manifest_entries if e["split"] == "validation"]),
                "test": len([e for e in manifest_entries if e["split"] == "test"]),
            },
            "samples": manifest_entries,
        }, f, indent=2)
        
    print(f"Phase 8 dataset successfully created! {len(manifest_entries)} total samples indexed in dataset/dataset_manifest.json")

if __name__ == "__main__":
    main()
