import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { db } from '../prisma/db.js';
import { RecordStatus } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const app = createApp();

describe('Phase 4: Realistic EEE Laboratory Workflow & Server-Side Faculty Mark Authority', () => {
  let kavinToken: string;
  let arunToken: string;
  let facultyToken: string;
  const docsDir = path.resolve(process.cwd(), '../docs/demo-docs');

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

    // Authenticate Faculty (Dr. Raman)
    const facultyRes = await request(app)
      .post('/api/auth/faculty/login')
      .send({ email: 'faculty@college.edu', password: 'Password123!' });
    facultyToken = facultyRes.body.data.token;
  });

  // 1. Faculty creates session
  it('1. Faculty can create an EEE laboratory session in DRAFT state', async () => {
    const res = await request(app)
      .post('/api/faculty/sessions')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        experimentId: 'exp-1',
        sessionDate: '2026-10-01',
        sessionCode: 'SESSION-EEE-TRANS-01',
        subject: 'Electrical Machines Laboratory',
        className: 'III EEE',
        section: 'A',
        maxMark: 10,
        startTime: '09:00 AM',
        endTime: '12:00 PM',
        status: 'DRAFT',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sessionCode).toBe('SESSION-EEE-TRANS-01');
    expect(res.body.data.subject).toBe('Electrical Machines Laboratory');
    expect(res.body.data.status).toBe('DRAFT');
  });

  // 2. Faculty activates session
  it('2. Faculty can activate a DRAFT session before the lab starts', async () => {
    const createRes = await request(app)
      .post('/api/faculty/sessions')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        experimentId: 'exp-1',
        sessionDate: '2026-10-01',
        sessionCode: 'SESSION-EEE-ACT-01',
        subject: 'Electrical Machines Laboratory',
        className: 'III EEE',
        section: 'A',
        status: 'DRAFT',
      });

    const sessionId = createRes.body.data.id;

    const patchRes = await request(app)
      .patch(`/api/faculty/sessions/${sessionId}/status`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ status: 'ACTIVE' });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.success).toBe(true);
    expect(patchRes.body.data.status).toBe('ACTIVE');
  });

  // 3. Student record generated
  it('3. Faculty generates records for enrolled students in the session', async () => {
    const sessionRes = await request(app)
      .post('/api/faculty/sessions')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        experimentId: 'exp-1',
        sessionDate: '2026-10-01',
        sessionCode: 'SESSION-EEE-GEN-01',
        subject: 'Electrical Machines Laboratory',
        className: 'III EEE',
        section: 'A',
        status: 'ACTIVE',
      });

    const sessionId = sessionRes.body.data.id;

    const genRes = await request(app)
      .post(`/api/faculty/sessions/${sessionId}/generate-records`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        studentIds: ['student-kavin-048', 'student-arun-052'],
      });

    expect(genRes.status).toBe(200);
    expect(genRes.body.success).toBe(true);
    expect(genRes.body.data.length).toBe(2);
  });

  // 4. Unique QR generated
  it('4. Generated records receive distinct unique codes and secure QR tokens', async () => {
    const sessionRes = await request(app)
      .post('/api/faculty/sessions')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        experimentId: 'exp-1',
        sessionDate: '2026-10-01',
        sessionCode: 'SESSION-EEE-QR-01',
        subject: 'Electrical Machines Laboratory',
        className: 'III EEE',
        section: 'A',
        status: 'ACTIVE',
      });

    const sessionId = sessionRes.body.data.id;

    const genRes = await request(app)
      .post(`/api/faculty/sessions/${sessionId}/generate-records`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        studentIds: ['student-kavin-048', 'student-arun-052'],
      });

    const [rec1, rec2] = genRes.body.data;
    expect(rec1.uniqueRecordCode).toBeDefined();
    expect(rec2.uniqueRecordCode).toBeDefined();
    expect(rec1.uniqueRecordCode).not.toBe(rec2.uniqueRecordCode);
    expect(rec1.qrToken).toBeDefined();
    expect(rec2.qrToken).toBeDefined();
    expect(rec1.qrToken).not.toBe(rec2.qrToken);
    expect(rec1.qrToken.length).toBeGreaterThanOrEqual(32);
  });

  // 5. Duplicate record prevented
  it('5. System prevents duplicate records for the same student, experiment, and session', async () => {
    const sessionRes = await request(app)
      .post('/api/faculty/sessions')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        experimentId: 'exp-1',
        sessionDate: '2026-10-01',
        sessionCode: 'SESSION-EEE-NODUP-01',
        subject: 'Electrical Machines Laboratory',
        className: 'III EEE',
        section: 'A',
        status: 'ACTIVE',
      });

    const sessionId = sessionRes.body.data.id;

    // First generation
    await request(app)
      .post(`/api/faculty/sessions/${sessionId}/generate-records`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ studentIds: ['student-kavin-048'] });

    // Second generation attempt with identical parameters
    const repeatRes = await request(app)
      .post(`/api/faculty/sessions/${sessionId}/generate-records`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ studentIds: ['student-kavin-048'] });

    expect(repeatRes.status).toBe(200);

    // Verify database only contains 1 record for this student + session
    const sessionRecords = await db.getRecordsBySession(sessionId);
    const kavinRecords = sessionRecords.filter((r) => r.studentId === 'student-kavin-048');
    expect(kavinRecords.length).toBe(1);
  });

  // 6. Student retrieves only own record
  it('6. Authenticated student can only view their own assigned records', async () => {
    const res = await request(app)
      .get('/api/student/records')
      .set('Authorization', `Bearer ${kavinToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    for (const record of res.body.data) {
      expect(record.studentId).toBe('student-kavin-048');
      expect(record.studentId).not.toBe('student-arun-052');
    }
  });

  // 7. Valid student submission
  it('7. Student submits genuine photographed document for active record', async () => {
    const filePath = path.join(docsDir, 'kavin_exp3_document.png');
    const imageBuffer = fs.readFileSync(filePath);

    const res = await request(app)
      .post('/api/student/records/record-kavin-exp3/submit')
      .set('Authorization', `Bearer ${kavinToken}`)
      .attach('image', imageBuffer, 'kavin_exp3_document.png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(RecordStatus.PENDING);
    expect(res.body.data.detectedStudentRegisterNumber).toBe('048');
  });

  // 8. Another student's record rejected (Attack scenario Case 1)
  it("8. Kavin uploading Arun's document is rejected with HTTP 403 RECORD_OWNERSHIP_MISMATCH", async () => {
    const filePath = path.join(docsDir, 'arun_exp3_document.png');
    const imageBuffer = fs.readFileSync(filePath);

    const res = await request(app)
      .post('/api/student/records/record-kavin-exp3/submit')
      .set('Authorization', `Bearer ${kavinToken}`)
      .attach('image', imageBuffer, 'arun_exp3_document.png');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('RECORD_OWNERSHIP_MISMATCH');
  });

  // 9. Wrong experiment rejected
  it('9. Submitting a record with mismatched experiment flags submission for MANUAL_REVIEW', async () => {
    const filePath = path.join(docsDir, 'wrong_exp_document.png');
    const imageBuffer = fs.readFileSync(filePath);

    const res = await request(app)
      .post('/api/student/records/record-kavin-exp3/submit')
      .set('Authorization', `Bearer ${kavinToken}`)
      .attach('image', imageBuffer, 'wrong_exp_document.png');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(RecordStatus.MANUAL_REVIEW);
    expect(res.body.data.manualReviewReason).toMatch(/Experiment/i);
  });

  // 10. Wrong session rejected
  it('10. Submitting a QR token assigned to a different session is rejected', async () => {
    // Submit with token belonging to session 10 on a session 12 target record
    const res = await request(app)
      .post('/api/student/records/record-kavin-exp3/submit')
      .set('Authorization', `Bearer ${kavinToken}`)
      .send({ qrToken: 'kavin-qr-token-exp02-pending' });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/different experiment|session/i);
  });

  // 11. Expired session rejected
  it('11. Submission to an ENDED session is rejected by the server', async () => {
    const sessionRes = await request(app)
      .post('/api/faculty/sessions')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        experimentId: 'exp-1',
        sessionDate: '2026-10-01',
        sessionCode: 'SESSION-EEE-END-01',
        subject: 'Electrical Machines Laboratory',
        className: 'III EEE',
        section: 'A',
        status: 'ACTIVE',
      });

    const sessionId = sessionRes.body.data.id;

    // Generate Kavin's record
    const genRes = await request(app)
      .post(`/api/faculty/sessions/${sessionId}/generate-records`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ studentIds: ['student-kavin-048'] });

    const newRecId = genRes.body.data[0].id;
    const newQrToken = genRes.body.data[0].qrToken;

    // Faculty ends the session
    await request(app)
      .patch(`/api/faculty/sessions/${sessionId}/status`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ status: 'ENDED' });

    // Student attempts to submit
    const filePath = path.join(docsDir, 'kavin_exp3_document.png');
    const imageBuffer = fs.readFileSync(filePath);

    const submitRes = await request(app)
      .post(`/api/student/records/${newRecId}/submit`)
      .set('Authorization', `Bearer ${kavinToken}`)
      .field('qrToken', newQrToken)
      .attach('image', imageBuffer, 'kavin_exp3_document.png');

    expect(submitRes.status).toBe(422);
    expect(submitRes.body.message).toMatch(/session.*ended|closed/i);
  });

  // 12. OCR mark matching faculty mark
  it('12. When photographed OCR mark matches server faculty mark (9.5), MATCH is verified', async () => {
    // Pre-award mark 9.5 to record-kavin-exp3
    await request(app)
      .post('/api/faculty/records/record-kavin-exp3/award-mark')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ mark: 9.5 });

    const filePath = path.join(docsDir, 'kavin_exp3_document.png');
    const imageBuffer = fs.readFileSync(filePath);

    const res = await request(app)
      .post('/api/student/records/record-kavin-exp3/submit')
      .set('Authorization', `Bearer ${kavinToken}`)
      .field('qrToken', 'kavin-qr-token-secure-exp03-2026')
      .attach('image', imageBuffer, 'kavin_exp3_document.png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.markVerificationStatus).toBe('MATCH');
    expect(res.body.data.facultyAwardedMark).toBe(9.5);
  });

  // 13. OCR mark mismatch causes manual review (Attack scenario Case 2)
  it('13. When OCR mark (9.5) disagrees with faculty mark (8.5), MARK_MISMATCH triggers MANUAL_REVIEW', async () => {
    // Faculty awarded mark = 8.5
    await request(app)
      .post('/api/faculty/records/record-kavin-exp3/award-mark')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ mark: 8.5 });

    // Photographed document displays mark = 9.5
    const filePath = path.join(docsDir, 'kavin_exp3_document.png');
    const imageBuffer = fs.readFileSync(filePath);

    const res = await request(app)
      .post('/api/student/records/record-kavin-exp3/submit')
      .set('Authorization', `Bearer ${kavinToken}`)
      .field('qrToken', 'kavin-qr-token-secure-exp03-2026')
      .attach('image', imageBuffer, 'kavin_exp3_document.png');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(RecordStatus.MANUAL_REVIEW);
    expect(res.body.data.markVerificationStatus).toBe('MARK_MISMATCH');
    // Crucial: The authoritative faculty mark remains 8.5, NOT changed to 9.5!
    expect(res.body.data.facultyAwardedMark).toBe(8.5);
    expect(res.body.data.manualReviewReason).toMatch(/Mark mismatch|Mark discrepancy/i);
  });

  // 14. Faculty mark cannot be changed by student
  it('14. Student submission cannot overwrite or alter the server faculty-awarded mark', async () => {
    // Faculty sets mark to 8.5
    await request(app)
      .post('/api/faculty/records/record-kavin-exp3/award-mark')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ mark: 8.5 });

    const filePath = path.join(docsDir, 'kavin_exp3_document.png');
    const imageBuffer = fs.readFileSync(filePath);

    // Student sends payload attempting to specify their own mark of 10
    const res = await request(app)
      .post('/api/student/records/record-kavin-exp3/submit')
      .set('Authorization', `Bearer ${kavinToken}`)
      .field('mark', 10.0)
      .field('facultyAwardedMark', 10.0)
      .attach('image', imageBuffer, 'kavin_exp3_document.png');

    // Retrieve authoritative record from DB
    const stored = await db.getRecordById('record-kavin-exp3');
    expect(stored?.facultyAwardedMark).toBe(8.5);
    expect(stored?.facultyAwardedMark).not.toBe(10.0);
  });

  // 15. Faculty correction requires justification
  it('15. Faculty correction of a mark requires justification and logs history', async () => {
    const res = await request(app)
      .post('/api/faculty/records/record-kavin-exp3/correct')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        correctedMark: 9.0,
        reason: 'Handwritten stroke clarification verified with student physical paper',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.detectedMark).toBe(9.0);
    expect(res.body.data.status).toBe(RecordStatus.VERIFIED);

    const history = JSON.parse(res.body.data.facultyCorrectionHistory);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].reason).toContain('Handwritten stroke clarification');
  });

  // 16. Audit event created
  it('16. Critical laboratory workflow and security actions produce immutable audit log entries', async () => {
    const logsRes = await request(app)
      .get('/api/faculty/audit-logs')
      .set('Authorization', `Bearer ${facultyToken}`);

    expect(logsRes.status).toBe(200);
    const logs = logsRes.body.data;
    expect(Array.isArray(logs)).toBe(true);

    const actions = logs.map((l: any) => l.action);
    // Verify key audit events are recorded
    expect(actions.some((a: string) => a.includes('DOCUMENT_ANALYSIS') || a.includes('SUBMISSION') || a.includes('LOGIN'))).toBe(true);
  });

  // 17. Excel export generated
  it('17. Faculty can export continuous evaluation marks as an official Excel workbook', async () => {
    const res = await request(app)
      .get('/api/faculty/sessions/session-12/export-excel')
      .set('Authorization', `Bearer ${facultyToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('attachment; filename="EEE_Lab_Marks_');
    expect(res.body).toBeDefined();
  });

  // 18. Locked record cannot be altered by student
  it('18. Submission to a LOCKED session or locked record is blocked', async () => {
    const sessionRes = await request(app)
      .post('/api/faculty/sessions')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        experimentId: 'exp-1',
        sessionDate: '2026-10-01',
        sessionCode: 'SESSION-EEE-LOCK-01',
        subject: 'Electrical Machines Laboratory',
        className: 'III EEE',
        section: 'A',
        status: 'ACTIVE',
      });

    const sessionId = sessionRes.body.data.id;

    // Generate Kavin's record
    const genRes = await request(app)
      .post(`/api/faculty/sessions/${sessionId}/generate-records`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ studentIds: ['student-kavin-048'] });

    const newRecId = genRes.body.data[0].id;
    const newQrToken = genRes.body.data[0].qrToken;

    // Faculty locks the session
    await request(app)
      .patch(`/api/faculty/sessions/${sessionId}/status`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ status: 'LOCKED' });

    // Student attempts to submit
    const filePath = path.join(docsDir, 'kavin_exp3_document.png');
    const imageBuffer = fs.readFileSync(filePath);

    const submitRes = await request(app)
      .post(`/api/student/records/${newRecId}/submit`)
      .set('Authorization', `Bearer ${kavinToken}`)
      .field('qrToken', newQrToken)
      .attach('image', imageBuffer, 'kavin_exp3_document.png');

    expect(submitRes.status).toBeGreaterThanOrEqual(400);
    expect(submitRes.body.message).toMatch(/locked/i);
  });
});
