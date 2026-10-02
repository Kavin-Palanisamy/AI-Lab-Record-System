import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { db } from '../prisma/db.js';
import { defaultQrService } from '../services/qrService.js';
import { AiVerificationService } from '../services/aiVerificationService.js';
import { RecordStatus } from '@prisma/client';

const app = createApp();

describe('Phase 2: AI Document Intelligence & Multi-Factor Consistency Tests', () => {
  let kavinToken: string;
  let arunToken: string;
  let facultyToken: string;

  beforeEach(async () => {
    db.resetMemoryStore();

    // Authenticate Kavin (Reg No: 048)
    const kavinRes = await request(app)
      .post('/api/auth/student/login')
      .send({ registerNumber: '048', password: 'Password123!' });
    kavinToken = kavinRes.body.data.token;

    // Authenticate Arun (Reg No: 052)
    const arunRes = await request(app)
      .post('/api/auth/student/login')
      .send({ registerNumber: '052', password: 'Password123!' });
    arunToken = arunRes.body.data.token;

    // Authenticate Faculty
    const facultyRes = await request(app)
      .post('/api/auth/faculty/login')
      .send({ email: 'faculty@college.edu', password: 'Password123!' });
    facultyToken = facultyRes.body.data.token;
  });

  // Test 1: Correct student record (JWT=048, QR=048, OCR=048) -> Accepted
  it("1. Correct student record (JWT=048, QR=048, OCR=048) is verified and accepted", async () => {
    const qrBuffer = await defaultQrService.generateRecordQrBuffer('kavin-qr-token-secure-exp03-2026');

    const res = await request(app)
      .post('/api/student/records/record-kavin-exp3/submit')
      .set('Authorization', `Bearer ${kavinToken}`)
      .attach('image', qrBuffer, 'kavin_exp3_record.png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(RecordStatus.PENDING);
    expect(res.body.data.detectedStudentRegisterNumber).toBe('048');
    expect(res.body.data.aiConfidence).toBeGreaterThanOrEqual(0.75);
  });

  // Test 2: Another student's record (JWT=048, QR=052, OCR=052) -> 403 Ownership Mismatch
  it("2. Another student's record (JWT=048, QR=052, OCR=052) returns 403 RECORD_OWNERSHIP_MISMATCH", async () => {
    const qrBuffer = await defaultQrService.generateRecordQrBuffer('arun-qr-token-secure-exp03-2026');

    const res = await request(app)
      .post('/api/student/records/record-kavin-exp3/submit')
      .set('Authorization', `Bearer ${kavinToken}`)
      .attach('image', qrBuffer, 'arun_exp3_record.png');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('RECORD_OWNERSHIP_MISMATCH');
    expect(res.body.message).toBe('This laboratory record does not belong to the authenticated student.');
  });

  // Test 3: QR says Kavin but OCR says Arun (JWT=048, QR=048, OCR=052) -> MANUAL_REVIEW
  it("3. QR says Kavin (048) but document OCR detects Arun (052) flags for MANUAL_REVIEW", async () => {
    const verificationService = new AiVerificationService();
    const kavinStudent = (await db.findStudentByRegisterNumber('048'))!;
    const kavinRecord = (await db.getRecordById('record-kavin-exp3'))!;

    // Simulated inconsistent AI result: QR belongs to Kavin, but OCR text detected Arun 052
    const inconsistentAiResult: any = {
      success: true,
      document: {
        studentName: 'Arun',
        registerNumber: '052', // Mismatch!
        experimentNumber: '3',
        mark: 9.0,
        maxMark: 10.0,
        facultySignaturePresent: true,
      },
      confidence: {
        studentName: 0.95,
        registerNumber: 0.98,
        experimentNumber: 0.95,
        mark: 0.90,
        overall: 0.94,
      },
      quality: {
        imageQuality: 'HIGH',
        suspicionFlags: [],
        requiresReview: false,
      },
    };

    const result = verificationService.verifyDocumentConsistency({
      authenticatedStudent: kavinStudent,
      targetRecord: kavinRecord,
      qrRecord: kavinRecord,
      aiResult: inconsistentAiResult,
    });

    expect(result.status).toBe(RecordStatus.MANUAL_REVIEW);
    expect(result.detectedStudentMatch).toBe(false);
    expect(result.reviewReason).toContain('Student identity mismatch');
    expect(result.inconsistencyFlags.length).toBeGreaterThan(0);
  });

  // Test 4: OCR fails to detect register number -> MANUAL_REVIEW
  it('4. OCR failure to detect student register number sets status to MANUAL_REVIEW', async () => {
    const verificationService = new AiVerificationService();
    const kavinStudent = (await db.findStudentByRegisterNumber('048'))!;
    const kavinRecord = (await db.getRecordById('record-kavin-exp3'))!;

    const missingRegAiResult: any = {
      success: true,
      document: {
        studentName: 'Kavin',
        registerNumber: null, // Missing!
        experimentNumber: '3',
        mark: 9.0,
        maxMark: 10.0,
        facultySignaturePresent: true,
      },
      confidence: {
        studentName: 0.90,
        registerNumber: 0.0,
        experimentNumber: 0.90,
        mark: 0.85,
        overall: 0.66,
      },
    };

    const result = verificationService.verifyDocumentConsistency({
      authenticatedStudent: kavinStudent,
      targetRecord: kavinRecord,
      qrRecord: kavinRecord,
      aiResult: missingRegAiResult,
    });

    expect(result.status).toBe(RecordStatus.MANUAL_REVIEW);
    expect(result.reviewReason).toContain('Register number could not be extracted');
  });

  // Test 5: OCR confidently extracts correct mark -> available for faculty review
  it('5. OCR confidently extracts correct mark making it available for faculty confirmation', async () => {
    const qrBuffer = await defaultQrService.generateRecordQrBuffer('kavin-qr-token-secure-exp03-2026');

    const res = await request(app)
      .post('/api/student/records/record-kavin-exp3/submit')
      .set('Authorization', `Bearer ${kavinToken}`)
      .attach('image', qrBuffer, 'kavin_record.png');

    expect(res.status).toBe(200);
    expect(res.body.data.detectedMark).toBe(9.5);
    expect(res.body.data.facultySignaturePresent).toBe(true);

    // Verify Faculty can see the detected mark
    const facultyDash = await request(app)
      .get('/api/faculty/dashboard')
      .set('Authorization', `Bearer ${facultyToken}`);

    const record = facultyDash.body.data.records.find((r: any) => r.id === 'record-kavin-exp3');
    expect(record.detectedMark).toBe(9.5);
  });

  // Test 6: OCR produces low-confidence mark -> MANUAL_REVIEW
  it('6. OCR with low mark confidence (<0.65) flags submission for MANUAL_REVIEW', async () => {
    const verificationService = new AiVerificationService();
    const kavinStudent = (await db.findStudentByRegisterNumber('048'))!;
    const kavinRecord = (await db.getRecordById('record-kavin-exp3'))!;

    const lowConfidenceAiResult: any = {
      success: true,
      document: {
        studentName: 'Kavin',
        registerNumber: '048',
        experimentNumber: '3',
        mark: null, // Mark unreadable
        maxMark: 10.0,
        facultySignaturePresent: false,
      },
      confidence: {
        studentName: 0.70,
        registerNumber: 0.80,
        experimentNumber: 0.70,
        mark: 0.20,
        overall: 0.60, // Below 0.65 threshold
      },
    };

    const result = verificationService.verifyDocumentConsistency({
      authenticatedStudent: kavinStudent,
      targetRecord: kavinRecord,
      qrRecord: kavinRecord,
      aiResult: lowConfidenceAiResult,
    });

    expect(result.status).toBe(RecordStatus.MANUAL_REVIEW);
  });

  // Test 7: Invalid image buffer -> validation error (422)
  it('7. Submitting corrupted / non-image buffer fails with validation error', async () => {
    const corruptedBuffer = Buffer.from('This is completely not an image');

    const res = await request(app)
      .post('/api/ai/analyze-record')
      .set('Authorization', `Bearer ${kavinToken}`)
      .attach('image', corruptedBuffer, 'corrupted.txt');

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  // Test 8: Unsupported file type -> rejected by upload middleware
  it('8. Uploading unsupported file format is blocked', async () => {
    const textBuffer = Buffer.from('Some text');

    const res = await request(app)
      .post('/api/student/records/record-kavin-exp3/submit')
      .set('Authorization', `Bearer ${kavinToken}`)
      .attach('image', textBuffer, 'report.pdf');

    expect([400, 422, 500]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  // Test 9: Student attempts faculty endpoint -> 403 Forbidden
  it('9. Student cannot invoke faculty endpoints such as record correction', async () => {
    const res = await request(app)
      .post('/api/faculty/records/record-kavin-exp3/correct')
      .set('Authorization', `Bearer ${kavinToken}`)
      .send({ mark: 10, reason: 'Attempted student self-grant' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  // Test 10: Audit log is created for mismatches
  it('10. Audit log entries are generated for document ownership mismatches and faculty corrections', async () => {
    const qrBuffer = await defaultQrService.generateRecordQrBuffer('arun-qr-token-secure-exp03-2026');

    // Trigger mismatch
    await request(app)
      .post('/api/student/records/record-kavin-exp3/submit')
      .set('Authorization', `Bearer ${kavinToken}`)
      .attach('image', qrBuffer, 'arun_record.png');

    const logs = await db.getAuditLogs(10);
    const mismatchLog = logs.find(
      (l) => l.action === 'SUBMISSION_REJECTED_OWNERSHIP_MISMATCH' && l.actorId === 'student-kavin-048'
    );
    expect(mismatchLog).toBeDefined();

    // Faculty correction test
    const correctRes = await request(app)
      .post('/api/faculty/records/record-kavin-exp3/correct')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ mark: 9.8, reason: 'Corrected rounded decimal mark from physical observation sheet' });

    expect(correctRes.status).toBe(200);
    expect(correctRes.body.data.detectedMark).toBe(9.8);

    const facultyLog = (await db.getAuditLogs(5)).find((l) => l.action === 'FACULTY_APPROVED');
    expect(facultyLog).toBeDefined();
  });
});
