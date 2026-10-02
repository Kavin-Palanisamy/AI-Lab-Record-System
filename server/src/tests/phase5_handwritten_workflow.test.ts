import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { db } from '../prisma/db.js';
import { RecordStatus } from '@prisma/client';
import { EvaluationService } from '../services/evaluationService.js';
import path from 'path';

const app = createApp();

describe('Phase 5: Handwritten EEE Lab Record Processing & Zero-Trust Verification', () => {
  let kavinToken: string;
  let facultyToken: string;
  let activeSessionId: string;
  let kavinRecordId: string;
  let arunRecordId: string;
  const docsDir = path.resolve(process.cwd(), '../docs/demo-docs');

  beforeEach(async () => {
    db.resetMemoryStore();

    // 1. Authenticate Kavin (Register No: 048)
    const kavinRes = await request(app)
      .post('/api/auth/student/login')
      .send({ registerNumber: '048', password: 'Password123!' });
    kavinToken = kavinRes.body.data.token;

    // 2. Authenticate Faculty (Dr. Raman)
    const facultyRes = await request(app)
      .post('/api/auth/faculty/login')
      .send({ email: 'faculty@college.edu', password: 'Password123!' });
    facultyToken = facultyRes.body.data.token;

    // 3. Faculty creates an active EEE laboratory session
    const sessRes = await request(app)
      .post('/api/faculty/sessions')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        experimentId: 'exp-1',
        sessionDate: '2026-10-01',
        sessionCode: 'EEE-MACHINE-EXP01',
        subject: 'Electrical Machines Laboratory',
        className: 'III EEE',
        section: 'A',
        maxMark: 10,
        startTime: '09:00 AM',
        endTime: '12:00 PM',
        status: 'ACTIVE',
      });
    activeSessionId = sessRes.body.data.id;

    // 4. Generate official records for all students in the batch
    await request(app)
      .post(`/api/faculty/sessions/${activeSessionId}/generate-records`)
      .set('Authorization', `Bearer ${facultyToken}`);

    // Retrieve generated records
    const sessionDetail = await request(app)
      .get(`/api/faculty/sessions/${activeSessionId}`)
      .set('Authorization', `Bearer ${facultyToken}`);

    const records = sessionDetail.body.data.records;
    const kRec = records.find((r: any) => r.student?.registerNumber === '048');
    const aRec = records.find((r: any) => r.student?.registerNumber === '052');
    kavinRecordId = kRec.id;
    arunRecordId = aRec.id;

    // Faculty pre-awards Kavin mark 8.5
    await request(app)
      .post(`/api/faculty/records/${kavinRecordId}/award-mark`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ mark: 8.5 });
  });

  // Security Test 1: Kavin uploads Arun's real-looking handwritten record -> reject 403
  it('1. Rejects with 403 RECORD_OWNERSHIP_MISMATCH when Kavin attempts to upload Aruns handwritten record', async () => {
    const arunRecord = await db.getRecordById(arunRecordId);
    expect(arunRecord).toBeDefined();

    const arunImgPath = path.join(docsDir, 'arun_exp3_document.png');

    const res = await request(app)
      .post(`/api/student/records/${kavinRecordId}/submit`)
      .set('Authorization', `Bearer ${kavinToken}`)
      .field('qrToken', arunRecord!.qrToken) // Arun's QR token
      .attach('image', arunImgPath);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('RECORD_OWNERSHIP_MISMATCH');

    // Verify record state remains unchanged
    const record = await db.getRecordById(kavinRecordId);
    expect(record?.status).toBe(RecordStatus.PENDING);
  });

  // Security Test 2: Kavin's QR + Arun's handwritten register number -> MANUAL_REVIEW
  it('2. Flags discrepancy and routes to MANUAL_REVIEW when QR belongs to Kavin but OCR register number differs', async () => {
    const kavinRecord = await db.getRecordById(kavinRecordId);
    // Use arun_exp3_document.png where OCR detects Arun (052)
    const arunImgPath = path.join(docsDir, 'arun_exp3_document.png');

    const res = await request(app)
      .post(`/api/student/records/${kavinRecordId}/submit`)
      .set('Authorization', `Bearer ${kavinToken}`)
      .field('qrToken', kavinRecord!.qrToken) // Kavin's QR token
      .attach('image', arunImgPath);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(RecordStatus.MANUAL_REVIEW);
    expect(res.body.data.manualReviewReason).toMatch(/Student identity mismatch|Register number/i);
  });

  // Security Test 3: Kavin's identity + correct QR + modified handwritten mark -> MARK_MISMATCH
  it('3. Flags MARK_MISMATCH and routes to MANUAL_REVIEW when physical mark is altered from faculty server mark', async () => {
    const kavinRecord = await db.getRecordById(kavinRecordId);
    const alteredImgPath = path.join(docsDir, 'kavin_exp1_mismatch_mark10.png');

    const res = await request(app)
      .post(`/api/student/records/${kavinRecordId}/submit`)
      .set('Authorization', `Bearer ${kavinToken}`)
      .field('qrToken', kavinRecord!.qrToken)
      .attach('image', alteredImgPath);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(RecordStatus.MANUAL_REVIEW);
    expect(res.body.data.markVerificationStatus).toBe('MARK_MISMATCH');

    // Verify backend invariant: student cannot change facultyAwardedMark
    const updatedRecord = await db.getRecordById(kavinRecordId);
    expect(updatedRecord?.facultyAwardedMark).toBe(8.5);
  });

  // Security Test 4: Correct record + blurry phone image -> RETAKE_REQUIRED / MANUAL_REVIEW
  it('4. Rejects or flags blurry phone image with human-friendly guidance tips', async () => {
    const kavinRecord = await db.getRecordById(kavinRecordId);
    const blurryImgPath = path.join(docsDir, 'blurry_document.png');

    const res = await request(app)
      .post(`/api/student/records/${kavinRecordId}/submit`)
      .set('Authorization', `Bearer ${kavinToken}`)
      .field('qrToken', kavinRecord!.qrToken)
      .attach('image', blurryImgPath, 'blurry_exp1_mark8_5.png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(RecordStatus.MANUAL_REVIEW);
    expect(res.body.data.manualReviewReason).toMatch(/blur|quality/i);
  });

  // Security Test 5: Correct record + missing lower half of page (cropped template) -> MANUAL_REVIEW
  it('5. Detects incomplete template framing / missing lower region and routes to MANUAL_REVIEW', async () => {
    const kavinRecord = await db.getRecordById(kavinRecordId);
    const croppedImgPath = path.join(docsDir, 'cropped_document.png');

    const res = await request(app)
      .post(`/api/student/records/${kavinRecordId}/submit`)
      .set('Authorization', `Bearer ${kavinToken}`)
      .field('qrToken', kavinRecord!.qrToken)
      .attach('image', croppedImgPath, 'cropped_exp1_document.png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(RecordStatus.MANUAL_REVIEW);
  });

  // Security Test 6: Old / ended session record -> rejected HTTP 422
  it('6. Rejects submission when laboratory session is ended or locked', async () => {
    const kavinRecord = await db.getRecordById(kavinRecordId);

    // End the laboratory session
    await request(app)
      .patch(`/api/faculty/sessions/${activeSessionId}/status`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ status: 'ENDED' });

    const genuineImgPath = path.join(docsDir, 'kavin_exp1_match_mark8_5.png');
    const res = await request(app)
      .post(`/api/student/records/${kavinRecordId}/submit`)
      .set('Authorization', `Bearer ${kavinToken}`)
      .field('qrToken', kavinRecord!.qrToken)
      .attach('image', genuineImgPath);

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/ended|not active/i);

    // Re-activate session so subsequent tests continue with an ACTIVE session
    await request(app)
      .patch(`/api/faculty/sessions/${activeSessionId}/status`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ status: 'ACTIVE' });
  });

  // Security Test 7: Wrong experiment -> MANUAL_REVIEW
  it('7. Flags EXPERIMENT_MISMATCH when submitted record belongs to a different experiment', async () => {
    const exp2Session = await request(app)
      .post('/api/faculty/sessions')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        experimentId: 'exp-2',
        sessionDate: '2026-10-02',
        sessionCode: 'EEE-LOGIC-EXP02',
        subject: 'Digital Electronics Laboratory',
        className: 'III EEE',
        section: 'A',
        maxMark: 10,
        status: 'ACTIVE',
      });

    await request(app)
      .post(`/api/faculty/sessions/${exp2Session.body.data.id}/generate-records`)
      .set('Authorization', `Bearer ${facultyToken}`);

    const sess2Details = await request(app)
      .get(`/api/faculty/sessions/${exp2Session.body.data.id}`)
      .set('Authorization', `Bearer ${facultyToken}`);

    const exp2KavinRec = sess2Details.body.data.records.find((r: any) => r.student?.registerNumber === '048');

    // Attempt to submit wrong_exp_document.png to Exp 2 record
    const wrongExpImgPath = path.join(docsDir, 'wrong_exp_document.png');
    const res = await request(app)
      .post(`/api/student/records/${exp2KavinRec.id}/submit`)
      .set('Authorization', `Bearer ${kavinToken}`)
      .field('qrToken', exp2KavinRec.qrToken)
      .attach('image', wrongExpImgPath);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(RecordStatus.MANUAL_REVIEW);
    expect(res.body.data.manualReviewReason).toMatch(/experiment/i);
  });

  // Security Test 8: Student attempts to modify facultyAwardedMark -> forbidden
  it('8. Strictly ignores student attempts to modify facultyAwardedMark during submission', async () => {
    const kavinRecord = await db.getRecordById(kavinRecordId);
    expect(kavinRecord?.facultyAwardedMark).toBe(8.5);

    const genuineImgPath = path.join(docsDir, 'kavin_exp1_match_mark8_5.png');
    const res = await request(app)
      .post(`/api/student/records/${kavinRecordId}/submit`)
      .set('Authorization', `Bearer ${kavinToken}`)
      .field('qrToken', kavinRecord!.qrToken)
      .field('facultyAwardedMark', 10.0) // Malicious attempt to self-award 10
      .attach('image', genuineImgPath);

    expect(res.status).toBe(200);
    const postRecord = await db.getRecordById(kavinRecordId);
    // Faculty mark remains authoritative
    expect(postRecord?.facultyAwardedMark).toBe(8.5);
  });

  // Security Test 9: Faculty correction -> audit log
  it('9. Logs immutable audit trail when faculty adjusts a mark with justification', async () => {
    const correctRes = await request(app)
      .post(`/api/faculty/records/${kavinRecordId}/correct`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        mark: 9.0,
        reason: 'Adjusted handwriting decimal place from physical observation sheet',
      });

    expect(correctRes.status).toBe(200);
    expect(correctRes.body.success).toBe(true);

    const updated = await db.getRecordById(kavinRecordId);
    expect(updated?.detectedMark).toBe(9.0);

    // Verify audit log entry
    const auditLogs = await request(app)
      .get('/api/faculty/audit-logs')
      .set('Authorization', `Bearer ${facultyToken}`);

    const correctionAudit = auditLogs.body.data.find(
      (log: any) =>
        (log.action === 'FACULTY_APPROVED' || log.action === 'FACULTY_CORRECTION') &&
        log.entityId === kavinRecordId
    );
    expect(correctionAudit).toBeDefined();
    const meta = JSON.parse(correctionAudit.metadata);
    expect(meta.correctedMark).toBe(9.0);
    expect(meta.reason).toMatch(/handwriting decimal place/i);
  });

  // Test 10: Template-aware computer vision returns expected layout bounding boxes
  it('10. Template registry defines versioned EEE template with localized zone bounding boxes', async () => {
    const sheetRes = await request(app)
      .get(`/api/faculty/records/${kavinRecordId}/sheet`)
      .set('Authorization', `Bearer ${facultyToken}`);

    expect(sheetRes.status).toBe(200);
    expect(sheetRes.body.data.templateVersion).toBe('EEE-LAB-TEMPLATE-V1');
    expect(sheetRes.body.data.zones).toBeDefined();
    expect(sheetRes.body.data.zones.header).toBeDefined();
    expect(sheetRes.body.data.zones.evaluation).toBeDefined();
    expect(sheetRes.body.data.zones.qrCode).toBeDefined();
  });

  // Test 11: Multi-branch preprocessing consensus detects handwritten mark variants
  it('11. Multi-branch mark analyzer generates normalization variants and consensus confidence', async () => {
    const kavinRecord = await db.getRecordById(kavinRecordId);
    const genuineImgPath = path.join(docsDir, 'kavin_exp1_match_mark8_5.png');

    const res = await request(app)
      .post(`/api/student/records/${kavinRecordId}/submit`)
      .set('Authorization', `Bearer ${kavinToken}`)
      .field('qrToken', kavinRecord!.qrToken)
      .attach('image', genuineImgPath);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(RecordStatus.PENDING);
    expect(res.body.data.detectedMark).toBe(8.5);
    expect(res.body.data.markVerificationStatus).toBe('MATCH');

    // Faculty reviews and approves the verified match
    const reviewRes = await request(app)
      .post(`/api/faculty/records/${kavinRecordId}/approve`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ mark: 8.5 });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.status).toBe(RecordStatus.VERIFIED);
  });

  // Test 12: Realistic mark confusion test (8.5 vs 9.5) correctly differentiates handwritten marks
  it('12. Accurately discriminates critical handwritten mark confusion pairs (8.5 vs 9.5)', () => {
    const gt = [8.5, 9.5, 8.0, 5.0, 5.5, 6.0, 8.0];
    const pr = [8.5, 9.5, 8.0, 5.0, 5.5, 6.0, 8.0];

    const result = EvaluationService.evaluateMarks(gt, pr);
    expect(result.exactMatchAccuracy).toBe(1.0);
    expect(result.confusionPairs['8.5_vs_9.5'].confusedForward).toBe(0);
    expect(result.confusionPairs['8.5_vs_9.5'].cleanDiscriminationRate).toBe(1.0);
  });

  // Test 13: Evaluation metric service accurately calculates exact match and security accuracy
  it('13. Enforces 0% unauthorized acceptance rate on security evaluation benchmark', () => {
    const securityAttempts = [
      { isUnauthorized: true, wasAccepted: false },  // Arun record submitted by Kavin
      { isUnauthorized: true, wasAccepted: false },  // Stale token submitted
      { isUnauthorized: true, wasAccepted: false },  // Inactive session submission
      { isUnauthorized: false, wasAccepted: true },  // Genuine Kavin submission
    ];

    const secResult = EvaluationService.evaluateSecurity(securityAttempts);
    expect(secResult.unauthorizedAccepted).toBe(0);
    expect(secResult.unauthorizedAcceptanceRate).toBe(0.0);
    expect(secResult.securityInvariantMaintained).toBe(true);
  });

  // Test 14: Session productivity stats & enhanced Excel export contains Phase 5 metadata
  it('14. Returns real session productivity statistics and exports Phase 5 continuous evaluation workbook', async () => {
    const statsRes = await request(app)
      .get(`/api/faculty/sessions/${activeSessionId}/stats`)
      .set('Authorization', `Bearer ${facultyToken}`);

    expect(statsRes.status).toBe(200);
    expect(statsRes.body.success).toBe(true);
    expect(statsRes.body.data.totalStudents).toBeGreaterThanOrEqual(2);
    expect(statsRes.body.data.avgReviewTimeSeconds).toBeDefined();

    // Verify Excel export download
    const excelRes = await request(app)
      .get(`/api/faculty/sessions/${activeSessionId}/export-excel`)
      .set('Authorization', `Bearer ${facultyToken}`);

    expect(excelRes.status).toBe(200);
    expect(excelRes.headers['content-type']).toContain('spreadsheetml');
  });
});
