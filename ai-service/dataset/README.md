# Handwritten EEE Laboratory Record Dataset Architecture

## 1. Overview & Purpose
This dataset repository provides structured sample partitions for training, benchmarking, and evaluating the **Handwritten Document Intelligence Pipeline** in the AI-Powered Secure Laboratory Record & Mark Management System (`SecureLab`).

It evaluates:
- Handwritten numerical mark recognition (e.g. `8.5`, `9.0`, `10.0`, `8 1/2`)
- Multi-variant OCR consistency & confusion analysis (e.g. `5.0` vs `5.5`, `8.0` vs `8.5`, `8.5` vs `9.5`)
- Handwritten student register numbers (e.g. `048`, `052`)
- Handwritten faculty signatures vs un-evaluated blanks
- Image quality conditions: sharp, blurry, glare, perspective-distorted, cropped

---

## 2. Directory Structure

```
ai-service/dataset/
├── train/                      # Training samples & synthetic handwriting augmentations
│   ├── transformer_ocsc/       # EEE-TRANS-OCSC-V1 samples
│   ├── digital_logic/          # EEE-DIGITAL-LOGIC-V1 samples
│   ├── rlc_resonance/          # EEE-RLC-RESONANCE-V1 samples
│   ├── scr_rectifier/          # EEE-SCR-RECTIFIER-V1 samples
│   └── mcu_8051/               # EEE-MCU-8051-V1 samples
│
├── validation/                 # Hyperparameter tuning & confidence threshold calibration
│   ├── quality_conditions/     # Normal, blur, shadow, glare variations
│   └── confusion_pairs/        # 8.0_vs_8.5, 8.5_vs_9.5, 9.0_vs_10.0
│
├── test/                       # Blind evaluation test set (Benchmark Ground Truth)
│   ├── marks/                  # 100 benchmark mark regions with ground truth JSON
│   ├── register_numbers/       # 50 student register number crops
│   ├── tampering/              # Altered / overwritten mark samples
│   └── annotations.json        # Ground truth metadata & bounding boxes
│
└── README.md                   # This documentation & governance file
```

---

## 3. Annotation Schema (`annotations.json`)

Each sample is annotated with Normalized Bounding Boxes [0.0 - 1.0] and ground truth values:

```json
{
  "sample_id": "EEE-EXP01-KAVIN-048-001",
  "template_id": "EEE-TRANS-OCSC-V1",
  "image_path": "test/marks/sample_001.png",
  "ground_truth": {
    "student_name": "Kavin",
    "register_number": "048",
    "experiment_number": 1,
    "faculty_awarded_mark": 8.5,
    "faculty_signature_present": true,
    "quality_status": "GOOD",
    "tamper_status": "PASS"
  },
  "regions": {
    "student_name_box": { "x": 0.08, "y": 0.16, "w": 0.50, "h": 0.05 },
    "register_number_box": { "x": 0.08, "y": 0.22, "w": 0.40, "h": 0.05 },
    "mark_box": { "x": 0.12, "y": 0.76, "w": 0.35, "h": 0.10 },
    "signature_box": { "x": 0.55, "y": 0.76, "w": 0.38, "h": 0.10 }
  }
}
```

---

## 4. Privacy, Authorization & Ethical Governance

> [!CAUTION]
> **Strict Privacy Policy:**
> 1. **No Unauthorized Student Records:** Real student academic records, personal identifiable information (PII), or unauthorized student submissions are strictly prohibited from this repository.
> 2. **No Real Faculty Signature Datasets:** Real faculty biometric signatures must never be stored in public or unencrypted datasets. All test fixtures employ synthetic or explicitly consented pseudonymous representations.
> 3. **Synthetic Educational Samples:** Development and unit tests utilize synthesized laboratory record sheets generated via official templates (`EEE-LAB-TEMPLATE-V1`, etc.).
> 4. **Controlled Retention:** Uploaded student images in production are stored in secured directories accessible only via authenticated role-based endpoints (`/api/student`, `/api/faculty`).
