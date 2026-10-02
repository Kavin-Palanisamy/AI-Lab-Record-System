import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { db } from '../prisma/db.js';

const app = createApp();

describe('AI-Powered Secure Laboratory Record System - Security & Access Tests', () => {
  let kavinToken: string;
  let arunToken: string;
  let facultyToken: string;

  beforeEach(async () => {
    // Reset database memory store to default state before each test
    db.resetMemoryStore();

    // 1. Authenticate Kavin (Register No: 048)
    const kavinRes = await request(app)
      .post('/api/auth/student/login')
      .send({ registerNumber: '048', password: 'Password123!' });
    kavinToken = kavinRes.body.data.token;

    // 2. Authenticate Arun (Register No: 052)
    const arunRes = await request(app)
      .post('/api/auth/student/login')
      .send({ registerNumber: '052', password: 'Password123!' });
    arunToken = arunRes.body.data.token;

    // 3. Authenticate Demo Faculty
    const facultyRes = await request(app)
      .post('/api/auth/faculty/login')
      .send({ email: 'faculty@college.edu', password: 'Password123!' });
    facultyToken = facultyRes.body.data.token;
  });

  // Test 1: Student login succeeds
  it('1. Student login succeeds with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/student/login')
      .send({ registerNumber: '048', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.user.registerNumber).toBe('048');
    expect(res.body.data.user.role).toBe('STUDENT');
  });

  // Test 2: Wrong password fails
  it('2. Student login fails with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/student/login')
      .send({ registerNumber: '048', password: 'IncorrectPassword' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('AUTHENTICATION_REQUIRED');
  });

  // Test 3: Student can access own record
  it('3. Student can access their own records and QR details', async () => {
    const res = await request(app)
      .get('/api/student/records')
      .set('Authorization', `Bearer ${kavinToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    // All returned records must belong to Kavin
    for (const record of res.body.data) {
      expect(record.studentId).toBe('student-kavin-048');
    }

    // Access QR details of own record
    const qrRes = await request(app)
      .get('/api/student/records/record-kavin-exp3/qr')
      .set('Authorization', `Bearer ${kavinToken}`);

    expect(qrRes.status).toBe(200);
    expect(qrRes.body.data).toHaveProperty('qrDataUrl');
  });

  // Test 4: Student cannot access another student's record
  it("4. Student cannot access another student's record QR details", async () => {
    const res = await request(app)
      .get('/api/student/records/record-arun-exp3/qr')
      .set('Authorization', `Bearer ${kavinToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('RECORD_OWNERSHIP_MISMATCH');
  });

  // Test 5: Valid QR belonging to authenticated student succeeds
  it('5. Valid QR belonging to authenticated student succeeds', async () => {
    const res = await request(app)
      .post('/api/student/records/record-kavin-exp3/submit')
      .set('Authorization', `Bearer ${kavinToken}`)
      .send({ qrToken: 'kavin-qr-token-secure-exp03-2026' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('record-kavin-exp3');
    expect(res.body.data.status).toBe('PENDING');

    // Verify SUBMISSION_CREATED audit log was recorded
    const logs = await db.getLogsByEntity('LabRecord', 'record-kavin-exp3');
    const createdLog = logs.find((l) => l.action === 'SUBMISSION_CREATED');
    expect(createdLog).toBeDefined();
    expect(createdLog?.actorId).toBe('student-kavin-048');
  });

  // Test 6: QR belonging to another student returns 403
  it("6. Submitting a QR code belonging to another student returns HTTP 403 with RECORD_OWNERSHIP_MISMATCH", async () => {
    // Scenario: Kavin is logged in, but submits Arun's QR token
    const res = await request(app)
      .post('/api/student/records/record-kavin-exp3/submit')
      .set('Authorization', `Bearer ${kavinToken}`)
      .send({ qrToken: 'arun-qr-token-secure-exp03-2026' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      success: false,
      code: 'RECORD_OWNERSHIP_MISMATCH',
      message: 'This laboratory record does not belong to the authenticated student.',
    });
  });

  // Test 7: Invalid QR returns an error
  it('7. Submitting an invalid or non-existent QR token returns an error', async () => {
    const res = await request(app)
      .post('/api/student/records/record-kavin-exp3/submit')
      .set('Authorization', `Bearer ${kavinToken}`)
      .send({ qrToken: 'invalid-random-token-not-in-db' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // Test 8: Duplicate submission is blocked
  it('8. Duplicate submission on an already verified record is blocked with HTTP 409', async () => {
    // record-kavin-exp1 is seeded as already VERIFIED
    const res = await request(app)
      .post('/api/student/records/record-kavin-exp1/submit')
      .set('Authorization', `Bearer ${kavinToken}`)
      .send({ qrToken: 'kavin-qr-token-exp01-verified' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(['CONFLICT', 'RECORD_ALREADY_VERIFIED']).toContain(res.body.code);
  });

  // Test 9: Student cannot call faculty endpoint
  it('9. Student cannot call faculty endpoints (role-based security)', async () => {
    const res = await request(app)
      .get('/api/faculty/dashboard')
      .set('Authorization', `Bearer ${kavinToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  // Test 10: Audit log is created after rejection
  it('10. Audit log is created after ownership mismatch rejection', async () => {
    // Kavin attempts to submit Arun's record
    await request(app)
      .post('/api/student/records/record-kavin-exp3/submit')
      .set('Authorization', `Bearer ${kavinToken}`)
      .send({ qrToken: 'arun-qr-token-secure-exp03-2026' });

    // Check audit logs
    const logs = await db.getAuditLogs(10);
    const rejectionLog = logs.find(
      (l) => l.action === 'SUBMISSION_REJECTED_OWNERSHIP_MISMATCH' && l.actorId === 'student-kavin-048'
    );

    expect(rejectionLog).toBeDefined();
    expect(rejectionLog?.actorType).toBe('STUDENT');
    expect(rejectionLog?.entityType).toBe('LabRecord');
  });

  // Test 11: Faculty can view records
  it('11. Faculty can view all records and dashboard metrics', async () => {
    const res = await request(app)
      .get('/api/faculty/dashboard')
      .set('Authorization', `Bearer ${facultyToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('stats');
    expect(res.body.data).toHaveProperty('records');
    expect(res.body.data.records.length).toBeGreaterThanOrEqual(5);
  });

  // Test 12: Faculty can approve a record
  it('12. Faculty can approve a submitted record and assign marks', async () => {
    const res = await request(app)
      .post('/api/faculty/records/record-kavin-exp3/approve')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ mark: 9.5 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('VERIFIED');
    expect(res.body.data.detectedMark).toBe(9.5);

    // Verify FACULTY_APPROVED audit log
    const logs = await db.getLogsByEntity('LabRecord', 'record-kavin-exp3');
    const approveLog = logs.find((l) => l.action === 'FACULTY_APPROVED');
    expect(approveLog).toBeDefined();
  });

  // Test 13: Image upload with genuine QR code decodes automatically on the server
  it('13. Submitting an uploaded image with valid QR decodes and verifies ownership', async () => {
    const { defaultQrService } = await import('../services/qrService.js');
    // Generate valid PNG QR buffer for Kavin's Exp 3
    const qrBuffer = await defaultQrService.generateRecordQrBuffer('kavin-qr-token-secure-exp03-2026');

    const res = await request(app)
      .post('/api/student/records/record-kavin-exp3/submit')
      .set('Authorization', `Bearer ${kavinToken}`)
      .attach('image', qrBuffer, 'kavin_exp3_record.png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.imagePath).toBeTruthy();
  });
});
