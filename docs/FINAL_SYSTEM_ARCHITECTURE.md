# SecureLab: Final System Architecture Documentation

**System Title:** AI-Powered Secure Laboratory Record Assessment & Student Document Ownership Verification System  
**Version:** 1.0.0 (Production Release / Phase 9)  
**Target Environment:** University Electrical & Electronics Engineering (EEE) Continuous Assessment Labs  

---

## 1. High-Level Architectural Overview

SecureLab bridges physical handwritten engineering laboratory notebooks with cryptographic and AI-assisted security. The architecture enforces an asymmetric authority model: **automated systems collect evidence and compute multi-signal confidence metrics, while faculty members retain exclusive confirmation authority.**

```
+---------------------------------------------------------------------------------+
|                               CLIENT LAYER                                      |
|  - React 18 + TypeScript + Vite SPA                                             |
|  - Student Portal: Two-Image Submission Workflow (Index + Evaluation Box)       |
|  - Faculty Console: Live Ledger, Session Management, Ownership Review Screen   |
|  - Responsive Glassmorphic UI / Role-Gated Views                                |
+----------------------------------------+----------------------------------------+
                                         | HTTPS (REST API + JWT Auth)
+----------------------------------------v----------------------------------------+
|                               SERVER LAYER (Node.js / Express)                  |
|  - Core Auth & RBAC (Student / Faculty)                                         |
|  - Request Tracing (X-Request-Id) & Production Observability                   |
|  - 10-Step Student Ownership Decision Engine                                    |
|  - Cryptographic Exact Duplicate Engine (SHA-256)                               |
|  - Perceptual Image Reuse Engine (aHash/dHash + Hamming Distance)               |
|  - Spatial Pyramid Multi-Scale Document Embedding Provider (doc-v1.4)           |
|  - Writing Region Isolator (Student vs Faculty Mark Suppression)                |
|  - Metric-Learning Writer Verification Service (writer-v1.4)                     |
|  - Anti-Profile-Poisoning Invariant Enforcement                                 |
|  - Excel Continuous Evaluation Export Service (Multi-Sheet Official Ledger)     |
+----------------------------------------+----------------------------------------+
                                         |
               +-------------------------+-------------------------+
               |                                                   |
+--------------v---------------+                   +--------------v---------------+
|     DATABASE & STORAGE       |                   |      AI MICROSERVICE         |
|  - PostgreSQL (Prisma ORM)   |                   |  - FastAPI (Python 3.11)     |
|  - In-Memory Fallback Cache  |                   |  - OpenCV & Tesseract OCR    |
|  - Checksummed Backup Engine |                   |  - Handwritten Digits Recog  |
|  - Local Document Storage    |                   |  - Graceful Fallback Mode    |
+------------------------------+                   +------------------------------+
```

---

## 2. The Two-Image Physical Submission Protocol

The physical laboratory notebook does NOT feature printed student names, register numbers, or QR codes on each handwritten page. Redesigning university notebooks was strictly forbidden.

SecureLab resolves this constraint by requiring exactly two photographs per submission:
1. **IMAGE 1 — Contents / Index Row**:
   - Captures: Experiment Number, Date of Conduction, Experiment Name, Page Number Range, Index Mark, Faculty Signature.
2. **IMAGE 2 — End-of-Experiment Evaluation Box**:
   - Captures: Student Handwritten Observations, Equivalent Circuit Parameters/Results, Official 4-Part Rubric Box, Total Mark, Faculty Signature.

---

## 3. Strict 10-Step Ownership Decision Hierarchy

To guarantee zero unauthorized approvals without relying on fragile biometric heuristics, SecureLab processes evidence in strict hierarchical order:

1. **Authenticated Student Account**: Student must present valid JWT credentials; cannot submit against another student's account.
2. **Assigned Session & Record ID**: Record code and token must match the active laboratory session.
3. **Experiment & Page Range Verification**: Index title, detected experiment number, and page ranges must match the faculty-configured syllabus.
4. **Exact Cryptographic Image Reuse (SHA-256)**: Identical byte matches against previously verified records immediately trigger `REJECTED`.
5. **Perceptual Document Reuse (aHash/dHash)**: Luminance hash collisions trigger `MANUAL_REVIEW`.
6. **Multi-Scale Spatial Pyramid Document Embedding**: 64-dimensional scanline descriptors detect re-photographed physical pages (Attack E/H) and cropped copies (Attack J/F) at $> 91–93\%$ similarity.
7. **Writing Region Isolation & Writer Consistency**: Isolates student writing while suppressing faculty marks. Evaluates similarity against the student's established writer profile (`writer-v1.4-siamese-metric`).
8. **Cross-Page Consistency**: Compares writing characteristics between Index Row and End-Box summary.
9. **Mark & Arithmetic Consistency**: Validates that Index Mark equals End-Box Total ($\pm 1$), and that rubric component marks sum accurately to the total.
10. **Faculty Final Review**: Only human faculty members can transition a record to `VERIFIED`.

---

## 4. Anti-Profile-Poisoning Security Invariant

- An attacker cannot poison their writer profile by submitting copied handwriting.
- Any submission flagged for:
  - `DOCUMENT_REUSE_SUSPECTED`
  - `WRITER_INCONSISTENCY`
  - `OWNERSHIP_REVIEW`
  - `MARK_MISMATCH`
  - `IMAGE_QUALITY_FAIL`
  is **strictly blocked** from updating the student's writer profile.
- A profile sample is added **ONLY AFTER** record ownership checks pass cleanly **AND** faculty formally approves the record.

---

## 5. Production Observability & Health

- **Request Tracing**: `X-Request-Id` UUID header attached to every incoming and outgoing request.
- **Detailed Health Check** (`/api/health/detailed`):
  - Database connectivity
  - Upload storage availability
  - Pilot mode status (`PILOT_MODE=true`)
  - Latency metrics: average submission processing time, AI latency, faculty review duration.
