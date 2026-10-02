# SecureLab: AI-Powered Secure Laboratory Record Assessment & Student Document Ownership Verification System

[![Production Release](https://img.shields.io/badge/Release-Phase%209%20Production%20%26%20Real%20EEE%20Pilot-emerald.svg)](README.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict%20Mode-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B%20LTS-green.svg)](https://nodejs.org/)
[![Vitest](https://img.shields.io/badge/Automated%20Tests-159%2F159%20Passing-brightgreen.svg)](README.md)
[![Pilot Mode](https://img.shields.io/badge/Pilot%20Mode-Active%20(PILOT__MODE=true)-blueviolet.svg)](README.md)
[![License](https://img.shields.io/badge/License-MIT-lightgrey.svg)](LICENSE)

---

## 1. Problem Statement

In university engineering laboratory continuous assessment (e.g., Electrical & Electronics Engineering laboratories), student laboratory records face significant security and academic integrity challenges:
1. **Physical Notebook Reality**: Standard laboratory notebooks **do not** feature synthetic QR codes or student register numbers printed on every page. Redesigning university physical notebooks is impractical and prohibited.
2. **Document Reuse Fraud**: Students borrow and photograph a classmate's completed experiment or re-photograph physical pages using different smartphone cameras to bypass exact hash checks.
3. **Mark Tampering**: Handwritten marks in contents rows or evaluation boxes are vulnerable to numerical alteration.
4. **Administrative Delays**: Manual page-by-page verification of hundreds of students creates substantial faculty overhead.

---

## 2. The Real Notebook Workflow (Two-Image Protocol)

SecureLab solves this by operating directly on standard physical laboratory notebooks without altering notebook layouts. Each student submission consists of exactly two images:

```
+------------------------------------+------------------------------------+
|         IMAGE 1: INDEX ROW         |     IMAGE 2: EVALUATION BOX        |
|  - Experiment Number               |  - Student Handwritten Summary     |
|  - Date of Conduction              |  - Equivalent Circuit Parameters   |
|  - Experiment Title                |  - Official 4-Part Rubric Box      |
|  - Page Number Range               |  - Continuous Evaluation Total     |
|  - Index Mark & Faculty Signature  |  - Faculty Signature & Date        |
+------------------------------------+------------------------------------+
```

---

## 3. System Architecture & AI Pipeline

```
STUDENT SUBMITS TWO-IMAGE DocumentPair (Index + Evaluation Box)
  │
  ▼
STRICT 10-STEP OWNERSHIP DECISION HIERARCHY
  ├─ 1. Authenticated Student Account Check
  ├─ 2. Assigned Session & Record Binding Check
  ├─ 3. Experiment Title & Page Range Verification (vs Faculty Syllabus)
  ├─ 4. Exact Cryptographic Hash Check (SHA-256)
  │     └─ Identical bytes collision -> REJECTED
  ├─ 5. Perceptual Reuse Analysis (aHash / dHash)
  │     └─ High visual similarity -> MANUAL_REVIEW
  ├─ 6. Multi-Scale Spatial Pyramid Document Embedding (doc-v1.4)
  │     └─ Detects re-photographed physical pages (sim > 0.93) -> MANUAL_REVIEW
  ├─ 7. Writing Region Isolation & Writer Consistency (writer-v1.4)
  │     ├─ Suppresses faculty red ink marks, signatures, and printed borders
  │     └─ Evaluates student handwriting against confirmed profile centroid
  ├─ 8. Cross-Page Writer Consistency (Index vs End-Box student writing)
  ├─ 9. Mark & Arithmetic Consistency (Index Mark == End-Box Total; parts sum to total)
  └─ 10. Image Quality & Faculty Signature Verification
  │
  ▼
OUTCOME ROUTING:
  ├─ PASS -> READY_FOR_FACULTY_CONFIRMATION
  ├─ DISCREPANCY / SUSPICION -> MANUAL_REVIEW (High Priority Review Screen)
  └─ DETERMINISTIC VIOLATION -> REJECTED
```

---

## 4. Threat Model & Security Controls

| Threat Scenario | Attack Transformation | SecureLab Countermeasure | System Decision |
| :--- | :--- | :--- | :---: |
| **Exact File Replay** | Re-uploading victim's image file | SHA-256 exact hash collision | **REJECTED** |
| **Digital Transformations** | Resize, recompression, brightness, crop | Perceptual hash + Spatial Pyramid layout embedding | **MANUAL_REVIEW** |
| **Re-photographed Notebook** | Photographing victim's physical notebook | Scanline spatial pyramid embedding (similarity: 0.996) | **MANUAL_REVIEW** |
| **Profile Poisoning** | Submitting copied writing early | **Anti-Profile-Poisoning**: Flagged submissions never update profile | **BLOCKED** |
| **Mark Alteration** | Forging higher score on index row | Cross-page mark match + component arithmetic check | **MANUAL_REVIEW** |
| **Privacy Snooping** | Querying classmates' submissions | Strict student account scoping; zero ID/vector leakage | **HTTP 403** |

---

## 5. Real Pilot Evaluation Results

Evaluated across the 44-pair authorized pilot dataset (`dataset/pilot/`) under realistic laboratory lighting, shadow gradients, smartphone tilt, ruled notebooks, and pen inks:

- **Total Automated Test Suites:** **10 passed, 10 total**
- **Total Automated Tests:** **159 passed, 159 total** (100% passing across Phases 1–9)
- **Exact Duplicate Detection Rate:** **100.0%**
- **Perceptual Document Reuse Recall:** **100.0%** across Attacks B–J
- **Re-photographed Physical Page Recall (Attack E):** **100.0%** (Spatial embedding: 0.996)
- **Unauthorized Acceptance Rate:** **0.00%** (Zero unauthorized attacks accepted)
- **Genuine Submission Pass Rate:** **97.0%** (Zero false rejections)
- **Writer Verification EER (Estimate):** **7.5%**
- **Insufficient Evidence Rate:** **4.5%** (Ambiguous samples correctly routed without forced errors)

---

## 6. Real-World Acceptance Test Scenarios (Cases A through G)

- **Case A (Genuine Submission):** Kavin submits Exp 4 $\rightarrow$ **`PASS`** (`READY_FOR_FACULTY_CONFIRMATION`).
- **Case B (Wrong Student):** Arjun uploads Kavin's images $\rightarrow$ **`REJECTED`** (`EXACT_REUSE_DETECTED`).
- **Case C (Re-photographed Copy):** Arjun photographs Kavin's physical notebook $\rightarrow$ **`MANUAL_REVIEW`** (`PERCEPTUAL_REUSE_DETECTED`).
- **Case D (Own Genuine Record):** Arjun submits his own authentic records $\rightarrow$ **`PASS`** (Zero false positives).
- **Case E (Wrong Experiment):** Student submits Exp 3 pages for Exp 4 slot $\rightarrow$ **`EXPERIMENT_MISMATCH`** $\rightarrow$ **`MANUAL_REVIEW`**.
- **Case F (Altered Mark):** Index shows 10.0, End-Box shows 8.5 $\rightarrow$ **`MARK_INCONSISTENCY`** $\rightarrow$ **`MANUAL_REVIEW`**.
- **Case G (Low Quality):** Blurry capture ($< 35.0$ variance) $\rightarrow$ **`RETAKE_REQUIRED`**.

---

## 7. Known Limitations & Operational Boundaries

1. **Non-Biometric Identity Mechanism**: Writer consistency is evidence, **not** definitive proof of identity. SecureLab provides multi-signal decision support; faculty members make all final academic decisions.
2. **Extreme Camera Angles ($> 35^\circ$)**: Extreme oblique perspective distortion may reduce document embedding similarity. The Image Quality module catches this and requests a retake.
3. **Sparse Handwriting Samples**: Students with very short observation text or new enrollments receive `INSUFFICIENT_EVIDENCE` for writer verification until 2–5 faculty-confirmed submissions are established.

---

## 8. Deployment & Quick Start

### Prerequisites
- Node.js 20+ LTS
- PostgreSQL 15+ (or standalone in-memory mode)
- Python 3.11+ (optional edge OCR service)

### Quick Run
```bash
# 1. Install & Build Server
cd server
npm install
npm run build

# 2. Run Test Suite
npm test

# 3. Start Production Server
node dist/server.js
```

### Enable Pilot Mode
Set `PILOT_MODE="true"` in `server/.env`.

---

## 9. Comprehensive Documentation Links

- [Final System Architecture Specification](docs/FINAL_SYSTEM_ARCHITECTURE.md)
- [Real EEE Pilot Benchmark & Evaluation Report](docs/REAL_PILOT_REPORT.md)
- [Security Model, Threat Specification & Privacy Controls](docs/SECURITY_MODEL.md)
- [Production Deployment & Disaster Recovery Guide](docs/DEPLOYMENT.md)
- [Phase 8 Validation Report](docs/phase8_validation_report.md)
