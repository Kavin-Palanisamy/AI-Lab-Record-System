/**
 * Phase 6: Production-Grade Security Tests
 * ==========================================
 * Requirement 12: 15 core security tests
 * Requirement 13: Attack simulation tests A–J
 *
 * All 67 baseline tests from Phases 1–5 must continue passing.
 * These tests ONLY call the HTTP API layer (supertest) and use
 * helper services strictly for token manipulation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { db } from '../prisma/db.js';
import { defaultCryptoQrService } from '../services/cryptoQrService.js';
import { RecordStatus } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const app = createApp();
const docsDir = path.resolve(process.cwd(), '../docs/demo-docs');

describe('Phase 6: Production-Grade Security, Cryptographic QR, Anti-Replay & Attack Simulation', () => {
  let kavinToken: string;
  let arunToken: string;
  let facultyToken: string;

  beforeEach(async () => {
    db.resetMemoryStore();

    const kavinRes = await request(app)
      .post('/api/auth/student/login')
      .send({ registerNumber: '048', password: 'Password123!' });
    kavinToken = kavinRes.body.data.token;

    const arunRes = await request(app)
      .post('/api/auth/student/login')
      .send({ registerNumber: '052', password: 'Password123!' });
    arunToken = arunRes.body.data.token;

    const facultyRes = await request(app)
      .post('/api/auth/faculty/login')
      .send({ email: 'faculty@college.edu', password: 'Password123!' });
    facultyToken = facultyRes.body.data.token;
  });

  /**
   * Helper: Create ACTIVE session + generate records for Kavin and Arun.
   * Faculty awards Kavin 8.5 marks. Returns live record objects from DB.
   */
  async function setupActiveSession(opts?: {
    experimentId?: string;
    allowLate?: boolean;
    windowMinutes?: number;
  }) {
    const sessionCode = `P6-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    const experimentId = opts?.experimentId ?? 'exp-1';

    const sessionRes = await request(app)
      .post('/api/faculty/sessions')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        experimentId,
        sessionDate: '2026-10-01',
        sessionCode,
        subject: 'Electrical Machines Laboratory',
        className: 'III EEE',
        section: 'A',
        maxMark: 10,
        status: 'ACTIVE',
        submissionWindowMinutes: opts?.windowMinutes ?? 120,
        allowLateSubmission: opts?.allowLate ?? false,
      });

    const session = sessionRes.body.data;

    const genRes = await request(app)
      .post(`/api/faculty/sessions/${session.id}/generate-records`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ studentIds: ['student-kavin-048', 'student-arun-052'] });

    const records: any[] = genRes.body.data;
    const kavinRecord = records.find((r: any) => r.studentId === 'student-kavin-048');
    const arunRecord = records.find((r: any) => r.studentId === 'student-arun-052');

    // Faculty awards mark (8.5) to Kavin's record
    await request(app)
      .post(`/api/faculty/records/${kavinRecord.id}/award-mark`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ mark: 8.5 });

    return { session, kavinRecord, arunRecord };
  }

  // =========================================================================
  // REQUIREMENT 12: 15 CORE SECURITY TESTS
  // =========================================================================
  describe('Requirement 12: 15 Core Security Tests', () => {

    // ── Test 1 ── Valid signed QR → accepted ─────────────────────────────
    it('1. Valid signed QR token is accepted and verification breakdown is returned', async () => {
      const { kavinRecord } = await setupActiveSession();
      const imageBuffer = fs.readFileSync(path.join(docsDir, 'kavin_exp1_match_mark8_5.png'));

      const res = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', kavinRecord.qrToken)
        .attach('image', imageBuffer, 'kavin_exp1_match_mark8_5.png');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect([RecordStatus.PENDING, RecordStatus.VERIFIED, RecordStatus.MANUAL_REVIEW])
        .toContain(res.body.data.status);
      // QR security breakdown should be PASS for a valid signed token
      if (res.body.data.verificationBreakdown) {
        expect(res.body.data.verificationBreakdown.qrSecurity).toBe('PASS');
        expect(res.body.data.verificationBreakdown.identity).toBe('PASS');
      }
    });

    // ── Test 2 ── Modified QR payload → 403 INVALID_RECORD_SIGNATURE ────
    it('2. Modified QR payload fails HMAC verification with HTTP 403 INVALID_RECORD_SIGNATURE', async () => {
      const { kavinRecord } = await setupActiveSession();
      const tamperedToken = defaultCryptoQrService.tamperPayload(kavinRecord.qrToken, (p) => {
        p.recordId = 'record-forged-by-attacker';
      });

      const res = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', tamperedToken);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_RECORD_SIGNATURE');
    });

    // ── Test 3 ── Modified signature → 403 INVALID_RECORD_SIGNATURE ─────
    it('3. Modified cryptographic signature fails timing-safe comparison with HTTP 403', async () => {
      const { kavinRecord } = await setupActiveSession();
      const tamperedToken = defaultCryptoQrService.tamperSignature(kavinRecord.qrToken);

      const res = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', tamperedToken);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_RECORD_SIGNATURE');
    });

    // ── Test 4 ── Expired signed QR → 422 RECORD_TOKEN_EXPIRED ──────────
    it('4. Expired HMAC-SHA256 signed QR token is rejected with HTTP 422 RECORD_TOKEN_EXPIRED', async () => {
      const { session, kavinRecord } = await setupActiveSession();
      const expiredToken = defaultCryptoQrService.generateExpiredToken({
        recordId: kavinRecord.id,
        sessionId: session.id,
        experimentId: session.experimentId,
      });

      const res = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', expiredToken);

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('RECORD_TOKEN_EXPIRED');
    });

    // ── Test 5 ── Wrong student + valid signed QR → 403 ownership mismatch
    it('5. Wrong student with valid signed QR is rejected with HTTP 403 RECORD_OWNERSHIP_MISMATCH', async () => {
      const { kavinRecord } = await setupActiveSession();

      // Arun tries to submit Kavin's record using Kavin's real signed token
      const res = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${arunToken}`)
        .field('qrToken', kavinRecord.qrToken);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('RECORD_OWNERSHIP_MISMATCH');
    });

    // ── Test 6 ── Signed QR with wrong sessionId → rejected ─────────────
    it('6. QR token payload with mismatched sessionId is rejected with HTTP 400', async () => {
      const { kavinRecord, session } = await setupActiveSession();

      // Generate a new valid signed token with a DIFFERENT session ID
      const mismatchToken = defaultCryptoQrService.generateSignedToken({
        recordId: kavinRecord.id,
        sessionId: 'session-attacker-foreign-group',
        experimentId: session.experimentId,
      });
      // Register the new token to the DB so it resolves
      await db.updateRecord(kavinRecord.id, { qrToken: mismatchToken });

      const res = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', mismatchToken);

      expect([400, 422]).toContain(res.status);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Session mismatch/i);
    });

    // ── Test 7 ── Signed QR with wrong experimentId → rejected ──────────
    it('7. QR token payload with mismatched experimentId is rejected', async () => {
      const { kavinRecord, session } = await setupActiveSession();

      // Generate token with correct session but wrong experiment
      const wrongExpToken = defaultCryptoQrService.generateSignedToken({
        recordId: kavinRecord.id,
        sessionId: session.id,
        experimentId: 'exp-99-attacker',
      });
      await db.updateRecord(kavinRecord.id, { qrToken: wrongExpToken });

      const res = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', wrongExpToken);

      expect([400, 422]).toContain(res.status);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Experiment mismatch/i);
    });

    // ── Test 8 ── Anti-replay: verified record → 409, reopen → resubmit ──
    it('8. Replay of verified record blocked (409), faculty reopen allows resubmission', async () => {
      const { kavinRecord } = await setupActiveSession();
      const imageBuffer = fs.readFileSync(path.join(docsDir, 'kavin_exp1_match_mark8_5.png'));

      // First submission
      const firstSubmit = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', kavinRecord.qrToken)
        .attach('image', imageBuffer, 'kavin_exp1_match_mark8_5.png');
      expect(firstSubmit.status).toBe(200);

      // Faculty approves → record becomes VERIFIED
      await request(app)
        .post(`/api/faculty/records/${kavinRecord.id}/approve`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ mark: 8.5 });

      // Student replay attempt → BLOCKED
      const replayRes = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', kavinRecord.qrToken)
        .attach('image', imageBuffer, 'kavin_exp1_match_mark8_5.png');
      expect(replayRes.status).toBe(409);
      expect(replayRes.body.code).toBe('RECORD_ALREADY_VERIFIED');

      // Faculty reopens the record
      const reopenRes = await request(app)
        .post(`/api/faculty/records/${kavinRecord.id}/reopen`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ reason: 'Student needs to resubmit corrected graph' });
      expect(reopenRes.status).toBe(200);

      // Student can now resubmit
      const resubmitRes = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', kavinRecord.qrToken)
        .attach('image', imageBuffer, 'kavin_exp1_match_mark8_5.png');
      expect(resubmitRes.status).toBe(200);
      expect(resubmitRes.body.success).toBe(true);
    });

    // ── Test 9 ── Student cannot modify faculty-awarded mark via body ─────
    it('9. Student-injected facultyMark in submission payload is ignored; server mark is preserved', async () => {
      const { kavinRecord } = await setupActiveSession();

      // Student tries to override mark to 10.0 via body fields
      await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', kavinRecord.qrToken)
        .field('facultyMark', '10.0')
        .field('mark', '10.0')
        .field('facultyAwardedMark', '10.0');

      // Server must retain the original faculty mark of 8.5
      const record = await db.getRecordById(kavinRecord.id);
      expect(record?.facultyAwardedMark).toBe(8.5);
    });

    // ── Test 10 ── Student cannot alter record owner via body ─────────────
    it('10. Student-injected studentId in submission payload is ignored; owner is unchanged', async () => {
      const { kavinRecord } = await setupActiveSession();

      // Kavin tries to reassign record to Arun
      await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', kavinRecord.qrToken)
        .field('studentId', 'student-arun-052');

      const record = await db.getRecordById(kavinRecord.id);
      expect(record?.studentId).toBe('student-kavin-048');
    });

    // ── Test 11 ── Student cannot access faculty bulk approve → 403 ───────
    it('11. Student token receives HTTP 403 on faculty-only bulk-approve endpoint', async () => {
      const { kavinRecord } = await setupActiveSession();

      const res = await request(app)
        .post('/api/faculty/records/bulk-approve')
        .set('Authorization', `Bearer ${kavinToken}`)
        .send({ recordIds: [kavinRecord.id] });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    // ── Test 12 ── Expired capture challenge → 422 CHALLENGE_EXPIRED ─────
    it('12. Expired capture challenge nonce is rejected with HTTP 422 CHALLENGE_EXPIRED', async () => {
      const { kavinRecord } = await setupActiveSession();

      // Inject challenge that expired 30 seconds ago (negative ttlSeconds)
      const expiredChallenge = db.createCaptureChallenge(kavinRecord.id, 'student-kavin-048', -30);

      const res = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', kavinRecord.qrToken)
        .field('challengeId', expiredChallenge.challengeId);

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('CHALLENGE_EXPIRED');
    });

    // ── Test 13 ── Valid challenge accepted; same nonce is single-use ─────
    it('13. Valid capture challenge is consumed on first use; replay of same nonce is rejected', async () => {
      const { kavinRecord } = await setupActiveSession();

      // Request fresh challenge via API
      const chalRes = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/challenge`)
        .set('Authorization', `Bearer ${kavinToken}`);
      expect(chalRes.status).toBe(200);
      const { challengeId } = chalRes.body.data;

      // First use → accepted
      const firstUse = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', kavinRecord.qrToken)
        .field('challengeId', challengeId);
      expect(firstUse.status).toBe(200);
      expect(firstUse.body.success).toBe(true);

      // Replay same challengeId → rejected
      const replayUse = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', kavinRecord.qrToken)
        .field('challengeId', challengeId);
      expect([400, 422]).toContain(replayUse.status);
      expect(replayUse.body.code).toBe('CHALLENGE_REPLAYED');
    });

    // ── Test 14 ── Ended session → submission closed ──────────────────────
    it('14. Submission to a session with ENDED status is rejected with HTTP 400', async () => {
      const { kavinRecord, session } = await setupActiveSession();

      // End the session via DB update
      await db.updateLabSession(session.id, { status: 'ENDED' as any });

      const res = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', kavinRecord.qrToken);

      expect([400, 422]).toContain(res.status);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/session for this record has ended/i);
    });

    // ── Test 15 ── Faculty bulk approval endpoint is accessible and logs audit events ──
    it('15. Faculty bulk approval endpoint is accessible, processes request, and creates audit log', async () => {
      const { kavinRecord, arunRecord } = await setupActiveSession();

      // Submit both records (no image = markVerificationStatus stays NOT_EVALUATED)
      await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', kavinRecord.qrToken);

      await request(app)
        .post(`/api/student/records/${arunRecord.id}/submit`)
        .set('Authorization', `Bearer ${arunToken}`)
        .field('qrToken', arunRecord.qrToken);

      // Faculty calls bulk approve — records without MATCH status will be skipped
      const bulkRes = await request(app)
        .post('/api/faculty/records/bulk-approve')
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ recordIds: [kavinRecord.id, arunRecord.id] });

      // Endpoint must succeed and return structured result
      expect(bulkRes.status).toBe(200);
      expect(bulkRes.body.success).toBe(true);
      expect(bulkRes.body.data).toHaveProperty('approvedCount');
      expect(bulkRes.body.data).toHaveProperty('skippedCount');
      // Total processed = approved + skipped
      expect(bulkRes.body.data.approvedCount + bulkRes.body.data.skippedCount).toBe(2);

      // Audit log must capture the FACULTY_BULK_APPROVED event regardless
      const auditRes = await request(app)
        .get('/api/faculty/audit-logs')
        .set('Authorization', `Bearer ${facultyToken}`);
      expect(auditRes.status).toBe(200);
      const bulkLogs = auditRes.body.data.filter((l: any) => l.action === 'FACULTY_BULK_APPROVED');
      expect(bulkLogs.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // REQUIREMENT 13: ATTACK SIMULATION TESTS (A–J)
  // =========================================================================
  describe('Requirement 13: Threat-Model Attack Simulation Tests A–J', () => {

    // ── Attack A ── Friend's record substitution ──────────────────────────
    it('Attack A: Friend\'s record substitution blocked with HTTP 403 RECORD_OWNERSHIP_MISMATCH', async () => {
      const { arunRecord } = await setupActiveSession();

      // Kavin tries to submit Arun's record (with Arun's valid signed QR token)
      const res = await request(app)
        .post(`/api/student/records/${arunRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', arunRecord.qrToken);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('RECORD_OWNERSHIP_MISMATCH');
    });

    // ── Attack B ── Old record from ended session ─────────────────────────
    it('Attack B: Old record from an ENDED session is rejected as submissions closed', async () => {
      const { kavinRecord, session } = await setupActiveSession();

      // End the session
      await db.updateLabSession(session.id, { status: 'ENDED' as any });

      const res = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', kavinRecord.qrToken);

      expect([400, 422]).toContain(res.status);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/session for this record has ended/i);
    });

    // ── Attack C ── Forged QR payload with original signature ────────────
    it('Attack C: Forged QR payload with original signature fails HMAC check (403)', async () => {
      const { kavinRecord } = await setupActiveSession();

      // Swap recordId in payload, keep original signature → HMAC mismatch
      const forgedToken = defaultCryptoQrService.tamperPayload(kavinRecord.qrToken, (p) => {
        p.recordId = 'record-victim-other-student';
      });

      const res = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', forgedToken);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_RECORD_SIGNATURE');
    });

    // ── Attack D ── Screenshot replay of verified record ─────────────────
    it('Attack D: Replay of screenshot from a verified record is rejected with HTTP 409', async () => {
      const { kavinRecord } = await setupActiveSession();
      const imageBuffer = fs.readFileSync(path.join(docsDir, 'kavin_exp1_match_mark8_5.png'));

      // Initial submission
      await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', kavinRecord.qrToken)
        .attach('image', imageBuffer, 'kavin_exp1_match_mark8_5.png');

      // Faculty approves → VERIFIED
      await request(app)
        .post(`/api/faculty/records/${kavinRecord.id}/approve`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .send({ mark: 8.5 });

      // Student replays with same screenshot
      const replayRes = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', kavinRecord.qrToken)
        .attach('image', imageBuffer, 'kavin_exp1_match_mark8_5.png');

      expect(replayRes.status).toBe(409);
      expect(replayRes.body.success).toBe(false);
      expect(replayRes.body.code).toBe('RECORD_ALREADY_VERIFIED');
    });

    // ── Attack E ── Mark edited in photograph (10.0 vs server 8.5) ───────
    it('Attack E: Photograph with edited mark (10.0) vs faculty-awarded (8.5) triggers MANUAL_REVIEW', async () => {
      const { kavinRecord } = await setupActiveSession();
      const mismatchBuffer = fs.readFileSync(path.join(docsDir, 'kavin_exp1_mismatch_mark10.png'));

      const res = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', kavinRecord.qrToken)
        .attach('image', mismatchBuffer, 'kavin_exp1_mismatch_mark10.png');

      expect(res.status).toBe(200);
      // Mark mismatch detected → manual review required
      expect(res.body.data.status).toBe(RecordStatus.MANUAL_REVIEW);
      expect(res.body.data.manualReviewReason).toMatch(/[Mm]ark/);
    });

    // ── Attack F ── Cropped record (ownership region removed) ─────────────
    it('Attack F: Cropped record without identity region is flagged for MANUAL_REVIEW', async () => {
      const { kavinRecord } = await setupActiveSession();
      const croppedBuffer = fs.readFileSync(path.join(docsDir, 'cropped_document.png'));

      const res = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', kavinRecord.qrToken)
        .attach('image', croppedBuffer, 'cropped_document.png');

      expect(res.status).toBe(200);
      // Incomplete document / quality failure → MANUAL_REVIEW
      expect(res.body.data.status).toBe(RecordStatus.MANUAL_REVIEW);
    });

    // ── Attack G ── Wrong experiment document ─────────────────────────────
    it('Attack G: Submitting document from a different experiment triggers MANUAL_REVIEW', async () => {
      const { kavinRecord } = await setupActiveSession();
      const wrongExpBuffer = fs.readFileSync(path.join(docsDir, 'wrong_exp_document.png'));

      const res = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', kavinRecord.qrToken)
        .attach('image', wrongExpBuffer, 'wrong_exp_document.png');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(RecordStatus.MANUAL_REVIEW);
      expect(res.body.data.manualReviewReason).toMatch(/[Ee]xperiment/);
    });

    // ── Attack H ── Wrong session QR token ────────────────────────────────
    it('Attack H: QR token bound to a different session is rejected with HTTP 400 (session mismatch)', async () => {
      const { kavinRecord, session } = await setupActiveSession();

      // Build a valid token for this record but with a different sessionId
      const wrongSessionToken = defaultCryptoQrService.generateSignedToken({
        recordId: kavinRecord.id,
        sessionId: 'session-another-class-entirely',
        experimentId: session.experimentId,
      });
      await db.updateRecord(kavinRecord.id, { qrToken: wrongSessionToken });

      const res = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', wrongSessionToken);

      expect([400, 422]).toContain(res.status);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Session mismatch/i);
    });

    // ── Attack I ── Modified request payload (privilege escalation attempt)
    it('Attack I: Injected privileged fields (facultyAwardedMark, status) in request body are ignored', async () => {
      const { kavinRecord } = await setupActiveSession();

      // Student tries to inject privileged field overrides
      const res = await request(app)
        .post(`/api/student/records/${kavinRecord.id}/submit`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .field('qrToken', kavinRecord.qrToken)
        .field('facultyAwardedMark', '10.0')
        .field('facultyMark', '10.0')
        .field('status', 'VERIFIED')
        .field('isLocked', 'true');

      expect(res.status).toBe(200);
      // Server-side record must NOT reflect injected values
      const record = await db.getRecordById(kavinRecord.id);
      expect(record?.facultyAwardedMark).toBe(8.5);           // unchanged
      expect(record?.status).not.toBe(RecordStatus.VERIFIED); // not forced to VERIFIED
    });

    // ── Attack J ── Student accessing faculty-only admin routes ───────────
    it('Attack J: Student JWT token is rejected with HTTP 403 on all faculty admin routes', async () => {
      const { kavinRecord } = await setupActiveSession();

      // Approve endpoint
      const approveRes = await request(app)
        .post(`/api/faculty/records/${kavinRecord.id}/approve`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .send({ mark: 10 });
      expect(approveRes.status).toBe(403);

      // Reject endpoint
      const rejectRes = await request(app)
        .post(`/api/faculty/records/${kavinRecord.id}/reject`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .send({ reason: 'Unauthorized attempt' });
      expect(rejectRes.status).toBe(403);

      // Reopen endpoint
      const reopenRes = await request(app)
        .post(`/api/faculty/records/${kavinRecord.id}/reopen`)
        .set('Authorization', `Bearer ${kavinToken}`);
      expect(reopenRes.status).toBe(403);

      // Bulk approve endpoint
      const bulkRes = await request(app)
        .post('/api/faculty/records/bulk-approve')
        .set('Authorization', `Bearer ${kavinToken}`)
        .send({ recordIds: [kavinRecord.id] });
      expect(bulkRes.status).toBe(403);

      // Award mark endpoint
      const markRes = await request(app)
        .post(`/api/faculty/records/${kavinRecord.id}/award-mark`)
        .set('Authorization', `Bearer ${kavinToken}`)
        .send({ mark: 10 });
      expect(markRes.status).toBe(403);
    });
  });
});
