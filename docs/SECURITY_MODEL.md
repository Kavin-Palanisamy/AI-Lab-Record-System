# SecureLab: Production Security Model & Threat Specification

**Document Version:** 1.0.0 (Production Release / Phase 9)  
**Security Classification:** Institutional Engineering / Continuous Assessment Security  

---

## 1. Threat Model & Adversarial Assumptions

SecureLab defends against realistic adversarial vectors encountered in undergraduate laboratory environments:

| Threat Identifier | Adversary Objective | Attack Mechanism | SecureLab Defense |
| :--- | :--- | :--- | :--- |
| **T1: Direct Image Replay** | Submit classmate's image file directly | Exact file re-upload under attacker account | SHA-256 exact collision detection (`REJECTED`) |
| **T2: Digital Image Transformation**| Bypass cryptographic hashes | Resize, JPEG recompression, brightness, mild crop | Perceptual aHash/dHash + Spatial Pyramid Multi-Scale Pooling (`MANUAL_REVIEW`) |
| **T3: Physical Re-Photography** | Bypass digital perceptual hashes | Re-photograph victim's physical notebook with another smartphone | Spatial Pyramid Document Layout Embedding (sim > 0.93) + Writer Verification (`MANUAL_REVIEW`) |
| **T4: Profile Poisoning** | Pollute writer profile with another student's writing | Submit copied pages early to force future copied submissions to pass | **Anti-Profile-Poisoning Invariant**: Suspicious submissions NEVER update profile; only faculty confirmation updates profile |
| **T5: Mark Inflation** | Increase awarded marks | Modify index mark or evaluation table total | Cross-page mark match ($\pm 1$) + Arithmetic Component Sum Check (`MARK_INCONSISTENCY`) |
| **T6: Cross-Student Snooping** | View classmates' grades or submissions | Query student API endpoints | Strict account scoping: students can only access their own records |
| **T7: Biometric Inversion** | Reverse-engineer student handwriting | Query embeddings via student API | **Zero Vector Leakage**: Embedding vectors and other student centroids are never returned to student clients |

---

## 2. Authentication, Authorization & RBAC

1. **Role-Based Access Control (RBAC)**:
   - `STUDENT`: Authorized exclusively for record lookup, own QR details, and two-image submission against assigned records.
   - `FACULTY`: Authorized for session generation, manual review inspection, mark awarding, audit log review, and Excel ledger generation.
2. **JWT Security**:
   - Cryptographically signed using HMAC-SHA256 (`JWT_SECRET`).
   - Contains `id`, `role`, `name`, `email`, `registerNumber` / `department`.
   - Expires in 24 hours (`JWT_EXPIRES_IN`).
3. **CORS & Security Headers**:
   - Strict origin binding (`CLIENT_URL`).
   - Request tracing header (`X-Request-Id`).

---

## 3. Student Privacy Architecture

- **Sanitized Student API Responses**:
  - `exactReuse: boolean`
  - `visualReuse: boolean`
  - `writerConsistent: boolean | null`
  - `reviewMessage: string` (generic message)
- **Zero Identity Exposure**: The API response never contains the name, register number, or record ID of any colliding prior student.
- **Zero Vector Exposure**: Embedding vectors, feature arrays, and profile centroids are never transmitted to student clients.

---

## 4. Immutable Audit Ledger

Every security-sensitive action is recorded in the continuous audit ledger:
- `actorType`: `STUDENT` | `FACULTY` | `SYSTEM`
- `action`: `SUBMISSION_CREATED`, `DOCUMENT_REUSE_SUSPECTED`, `WRITER_INCONSISTENCY`, `FACULTY_APPROVED`, `FACULTY_REJECTED`
- `metadata`: JSON payload containing verification signals, previous record ID (faculty-only view), and review duration.
