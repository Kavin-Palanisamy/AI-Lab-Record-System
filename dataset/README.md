# SecureLab Phase 8: Document Ownership & Writer Verification Dataset

## 1. Overview & Ethical Governance

This dataset architecture provides authorized and pseudonymized benchmarking samples for evaluating:
1. **Document-Level Visual Reuse Detection** (exact hash, perceptual hash, spatial document embeddings)
2. **Two-Image Document Pair Ownership** (`indexImage` + `evaluationImage`)
3. **Writing Region Isolation & Metric-Learning Writer Verification**
4. **Adversarial Reuse Transformations (Attacks A–N)**

### Ethical & Privacy Principles:
- **Zero Real PII:** All student identifiers are strictly pseudonymous (`anon_student_01`, `anon_student_02`, etc.). Real names and registration numbers are never stored in research datasets.
- **Authorized / Consented Samples:** Samples represent laboratory demonstration records created under institutional ethical guidelines for educational security research.
- **Writer-Disjoint Partitioning:** To guarantee strict scientific integrity and avoid data leakage, students appearing in the training split do not appear in the test set.

---

## 2. Dataset Hierarchy

```
dataset/
├── raw/                     # Original uncompressed captures with sensor EXIF metadata
│   ├── anon_student_01/
│   ├── anon_student_02/
│   └── ...
├── processed/               # Normalized (CLAHE contrast-adjusted, perspective-corrected)
│   ├── index/               # Isolated Index/Contents rows
│   └── endbox/              # Isolated End-of-experiment evaluation pages
├── train/                   # Writer baseline training split (pseudonyms 01–03)
├── validation/              # Threshold calibration & confusion tuning (pseudonyms 04–05)
├── test/                    # Blind evaluation & adversarial attacks A–N (pseudonyms 06–08)
├── dataset_manifest.json    # Complete sample metadata index
└── README.md                # This specification file
```

---

## 3. Metadata Schema (`dataset_manifest.json`)

Each sample entry in the dataset is annotated as follows:

```json
{
  "sample_id": "PAIR-ANON01-EXP04-SESS2026-01",
  "student_pseudonym": "anon_student_01",
  "experiment_id": "exp-4",
  "experiment_title": "Series and Parallel RLC Resonance Circuit",
  "session_pseudonym": "sess_eee_2026_fall_01",
  "image_type": "DOCUMENT_PAIR",
  "files": {
    "index_image": "processed/index/anon01_exp04_index.png",
    "evaluation_image": "processed/endbox/anon01_exp04_endbox.png"
  },
  "capture_metadata": {
    "device": "smartphone_camera_12mp",
    "resolution": "3024x4032",
    "focal_length": "4.2mm",
    "iso": 100,
    "quality_condition": "NORMAL"
  },
  "ground_truth": {
    "marks": {
      "prelab": 2.5,
      "conduction": 3.5,
      "calculation": 2.0,
      "viva": 1.0,
      "total": 9.0
    },
    "index_mark": 9.0,
    "faculty_signature_present": true,
    "conduction_date": "2026-09-28",
    "page_range": "24-29"
  },
  "split": "train"
}
```
