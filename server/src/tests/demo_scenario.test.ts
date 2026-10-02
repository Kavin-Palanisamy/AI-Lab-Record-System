import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { db } from '../prisma/db.js';

const app = createApp();

describe('Demonstration Workflow: Secure Laboratory Record System', () => {
  it('Executes the full 10-step demonstration flow reliably', async () => {
    // Reset database to initial state
    db.resetMemoryStore();

    // STEP 1: Login as Kavin (Register No: 048)
    const kavinLoginRes = await request(app)
      .post('/api/auth/student/login')
      .send({ registerNumber: '048', password: 'Password123!' });

    expect(kavinLoginRes.status).toBe(200);
    expect(kavinLoginRes.body.success).toBe(true);
    const kavinToken = kavinLoginRes.body.data.token;
    expect(kavinLoginRes.body.data.user.name).toBe('Kavin');
    expect(kavinLoginRes.body.data.user.registerNumber).toBe('048');

    // STEP 2: Open student dashboard and select Experiment 3
    const recordsRes = await request(app)
      .get('/api/student/records')
      .set('Authorization', `Bearer ${kavinToken}`);

    expect(recordsRes.status).toBe(200);
    const kavinExp3Record = recordsRes.body.data.find((r: any) => r.experiment?.experimentNumber === 3);
    expect(kavinExp3Record).toBeDefined();
    expect(kavinExp3Record.id).toBe('record-kavin-exp3');
    expect(kavinExp3Record.uniqueRecordCode).toContain('LAB-048-EXP03');

    // STEP 3 & 4: Capture/submit Kavin's genuine record QR
    const submitKavinRes = await request(app)
      .post(`/api/student/records/${kavinExp3Record.id}/submit`)
      .set('Authorization', `Bearer ${kavinToken}`)
      .send({ qrToken: 'kavin-qr-token-secure-exp03-2026' });

    // STEP 5: QR validates and submission succeeds
    expect(submitKavinRes.status).toBe(200);
    expect(submitKavinRes.body.success).toBe(true);
    expect(submitKavinRes.body.data.status).toBe('PENDING');

    // STEP 6: Student logs in again or stays authenticated
    const kavinLoginAgain = await request(app)
      .post('/api/auth/student/login')
      .send({ registerNumber: '048', password: 'Password123!' });
    expect(kavinLoginAgain.status).toBe(200);
    const refreshedToken = kavinLoginAgain.body.data.token;

    // STEP 7 & 8: Attempt to submit Arun's record QR (Arun Reg No: 052)
    // The system MUST detect that the QR belongs to Arun (student-arun-052) while Kavin (student-kavin-048) is authenticated
    const misuseRes = await request(app)
      .post(`/api/student/records/${kavinExp3Record.id}/submit`)
      .set('Authorization', `Bearer ${refreshedToken}`)
      .send({ qrToken: 'arun-qr-token-secure-exp03-2026' });

    // Rejection MUST be HTTP 403 RECORD_OWNERSHIP_MISMATCH
    expect(misuseRes.status).toBe(403);
    expect(misuseRes.body).toEqual({
      success: false,
      code: 'RECORD_OWNERSHIP_MISMATCH',
      message: 'This laboratory record does not belong to the authenticated student.',
    });

    // STEP 9: Login as Faculty and view Faculty Dashboard
    const facultyLoginRes = await request(app)
      .post('/api/auth/faculty/login')
      .send({ email: 'faculty@college.edu', password: 'Password123!' });

    expect(facultyLoginRes.status).toBe(200);
    const facultyToken = facultyLoginRes.body.data.token;

    const facultyDashRes = await request(app)
      .get('/api/faculty/dashboard')
      .set('Authorization', `Bearer ${facultyToken}`);

    expect(facultyDashRes.status).toBe(200);
    expect(facultyDashRes.body.data.records.length).toBeGreaterThan(0);

    // STEP 10: Verify the Security Incident in the Audit Log
    const auditLogsRes = await request(app)
      .get('/api/faculty/audit-logs')
      .set('Authorization', `Bearer ${facultyToken}`);

    expect(auditLogsRes.status).toBe(200);
    const securityIncident = auditLogsRes.body.data.find(
      (l: any) => l.action === 'SUBMISSION_REJECTED_OWNERSHIP_MISMATCH'
    );
    expect(securityIncident).toBeDefined();
    expect(securityIncident.actorId).toBe('student-kavin-048');
    expect(securityIncident.actorType).toBe('STUDENT');

    // Faculty approves Kavin's legitimate submission
    const approveRes = await request(app)
      .post(`/api/faculty/records/${kavinExp3Record.id}/approve`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ mark: 9.5 });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('VERIFIED');
    expect(approveRes.body.data.detectedMark).toBe(9.5);
  });
});
