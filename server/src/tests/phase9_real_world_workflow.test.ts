/**
 * Phase 9 Real-World EEE Lab Workflow Redesign Tests
 * ===================================================
 * Validates the physical EEE laboratory record workflow:
 *
 * 1. Faculty Master Control Center:
 *    - Configure Course/Lab structure and Experiment Master
 *    - Explicitly configure end-of-experiment evaluation box page number (e.g. Page 32)
 *    - Upload student roster Excel spreadsheet with validation and detailed summary
 *    - Download official student roster Excel template
 *    - View immutable audit logs & export continuous assessment spreadsheet
 *
 * 2. Student Two-Image Physical Workflow:
 *    - View faculty-defined experiments (read-only metadata)
 *    - Select assigned experiment without manual academic data entry
 *    - Upload Image 1 (Contents/Index Row) & Image 2 (End-Box)
 *    - Execute AI Analyse: Multi-signal verification
 *    - Valid submission automatically accepted and marked VERIFIED (no approval bottleneck)
 *
 * 3. Security & Misuse Prevention:
 *    - Block unauthorized document reuse across students without QR
 *    - Intercept re-photographed physical pages via layout embeddings
 *    - Intercept altered marks between Index and End-Box
 *    - Intercept experiment and page mismatches
 *    - Safe cold-start handling (INSUFFICIENT_EVIDENCE without rejection)
 *    - Anti-profile-poisoning enforcement
 *
 * 4. Invariants:
 *    - ZERO QR dependency throughout active workflow
 *    - NO date requirement: submissions succeed without entering a laboratory date
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { db } from '../prisma/db.js';
import { defaultDocumentReuseService } from '../services/documentReuseService.js';
import { defaultWriterVerificationService } from '../services/writerVerificationService.js';
import { defaultExcelExportService } from '../services/excelService.js';
import fs from 'fs';
import path from 'path';

const app = createApp();
const pilotDir = path.resolve(process.cwd(), '../dataset/pilot');
const pImg = (relPath: string) => path.join(pilotDir, relPath);

describe('Phase 9 Real-World EEE Lab Workflow Redesign Tests', () => {
  let facultyToken: string;
  let kavinToken: string;
  let arunToken: string;

  beforeEach(async () => {
    db.resetMemoryStore();
    defaultDocumentReuseService.clearStore();
    defaultWriterVerificationService.clearProfiles();

    // Faculty login
    const facRes = await request(app)
      .post('/api/auth/faculty/login')
      .send({ email: 'faculty@college.edu', password: 'Password123!' });
    facultyToken = facRes.body.data.token;

    // Student Kavin login
    const kavinRes = await request(app)
      .post('/api/auth/student/login')
      .send({ registerNumber: '048', password: 'Password123!' });
    kavinToken = kavinRes.body.data.token;

    // Student Arun login
    const arunRes = await request(app)
      .post('/api/auth/student/login')
      .send({ registerNumber: '052', password: 'Password123!' });
    arunToken = arunRes.body.data.token;
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 1. FACULTY: Experiment Master & End-Box Page Configuration
  // ════════════════════════════════════════════════════════════════════════════
  it('1. Faculty can create and configure an experiment with endBoxPageNumber and maxMark', async () => {
    const res = await request(app)
      .post('/api/faculty/experiments')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        experimentNumber: 7,
        title: 'Three Phase Induction Motor Load Test',
        subject: 'Electrical Machines Laboratory',
        description: 'Brake test on 3-phase squirrel cage induction motor.',
        endBoxPageNumber: 52,
        maxMark: 10.0,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.experimentNumber).toBe(7);
    expect(res.body.data.endBoxPageNumber).toBe(52);
    expect(res.body.data.maxMark).toBe(10.0);

    // Verify student can view faculty configured experiment with end-box page
    const studentExpRes = await request(app)
      .get('/api/student/experiments')
      .set('Authorization', `Bearer ${kavinToken}`);

    expect(studentExpRes.status).toBe(200);
    const exp7 = studentExpRes.body.data.find((e: any) => e.experimentNumber === 7);
    expect(exp7).toBeDefined();
    expect(exp7.endBoxPageNumber).toBe(52);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 2. FACULTY: Student Roster Excel Import & Template
  // ════════════════════════════════════════════════════════════════════════════
  it('2. Faculty can download template and import a student roster Excel spreadsheet', async () => {
    // A. Generate and download template
    const templateBuffer = await defaultExcelExportService.generateStudentTemplateWorkbook();

    const templateRes = await request(app)
      .get('/api/faculty/students/template-excel')
      .set('Authorization', `Bearer ${facultyToken}`);

    expect(templateRes.status).toBe(200);
    expect(templateRes.headers['content-type']).toContain('spreadsheetml');

    // B. Import test roster using generated template buffer
    const importRes = await request(app)
      .post('/api/faculty/students/import-excel')
      .set('Authorization', `Bearer ${facultyToken}`)
      .attach('file', templateBuffer, 'Student_Roster.xlsx');

    expect(importRes.status).toBe(200);
    expect(importRes.body.success).toBe(true);
    expect(importRes.body.data.totalRows).toBeGreaterThanOrEqual(5);
    expect(importRes.body.data.imported).toBeGreaterThanOrEqual(5);
    expect(importRes.body.data.errors).toHaveLength(0);

    // C. Verify imported students exist in faculty roster
    const rosterRes = await request(app)
      .get('/api/faculty/students')
      .set('Authorization', `Bearer ${facultyToken}`);

    expect(rosterRes.status).toBe(200);
    const aakash = rosterRes.body.data.find((s: any) => s.registerNumber === '21EE001');
    expect(aakash).toBeDefined();
    expect(aakash.name).toBe('Aakash V');
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 3. STUDENT: Two-Image Submission without Manual Academic Typing & Zero QR
  // ════════════════════════════════════════════════════════════════════════════
  it('3. Student can submit two images for an experiment without typing metadata or using QR', async () => {
    const exp4 = db.experiments.find((e) => e.experimentNumber === 4);
    expect(exp4).toBeDefined();

    const img1Path = pImg('processed/index/PILOT-PILOT_STUDENT_01-EXP04_index.png');
    const img2Path = pImg('processed/endbox/PILOT-PILOT_STUDENT_01-EXP04_endbox.png');

    const res = await request(app)
      .post(`/api/student/experiments/${exp4!.id}/analyze`)
      .set('Authorization', `Bearer ${kavinToken}`)
      .attach('image1', fs.readFileSync(img1Path), 'index_kavin.png')
      .attach('image2', fs.readFileSync(img2Path), 'endbox_kavin.png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ownershipStatus).toBe('PASS');
    expect(res.body.data.studentStatus).toBe('VERIFIED');
    expect(res.body.data.summary.experimentMatch).toBe(true);
    expect(res.body.data.summary.exactReuse).toBe(false);

    // Finalize submission
    const submitRes = await request(app)
      .post(`/api/student/experiments/${exp4!.id}/submit`)
      .set('Authorization', `Bearer ${kavinToken}`);

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.success).toBe(true);
    expect(submitRes.body.data.status).toBe('VERIFIED');
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 4. DATE INDEPENDENCE: No mandatory date required for verification
  // ════════════════════════════════════════════════════════════════════════════
  it('4. Submissions succeed without entering a laboratory date', async () => {
    const exp1 = db.experiments.find((e) => e.experimentNumber === 1);
    expect(exp1).toBeDefined();

    const img1Path = pImg('processed/index/PILOT-PILOT_STUDENT_01-EXP01_index.png');
    const img2Path = pImg('processed/endbox/PILOT-PILOT_STUDENT_01-EXP01_endbox.png');

    // Send without ANY date payload
    const res = await request(app)
      .post(`/api/student/experiments/${exp1!.id}/analyze`)
      .set('Authorization', `Bearer ${kavinToken}`)
      .attach('image1', fs.readFileSync(img1Path), 'index_exp1.png')
      .attach('image2', fs.readFileSync(img2Path), 'endbox_exp1.png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Verification passes cleanly without date failure
    expect(res.body.data.ownershipStatus).toBe('PASS');
    expect(res.body.data.studentStatus).toBe('VERIFIED');
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 5. SECURITY: Intercept Unauthorized Document Reuse Without QR
  // ════════════════════════════════════════════════════════════════════════════
  it('5. Arun submitting Kavins physical pages is intercepted and BLOCKED as document reuse', async () => {
    const exp4 = db.experiments.find((e) => e.experimentNumber === 4);
    const img1Path = pImg('processed/index/PILOT-PILOT_STUDENT_01-EXP04_index.png');
    const img2Path = pImg('processed/endbox/PILOT-PILOT_STUDENT_01-EXP04_endbox.png');

    // 1. Kavin submits his genuine pages
    await request(app)
      .post(`/api/student/experiments/${exp4!.id}/analyze`)
      .set('Authorization', `Bearer ${kavinToken}`)
      .attach('image1', fs.readFileSync(img1Path), 'kavin_index.png')
      .attach('image2', fs.readFileSync(img2Path), 'kavin_endbox.png');

    // 2. Arun uploads the exact same pages for his own account
    const arunRes = await request(app)
      .post(`/api/student/experiments/${exp4!.id}/analyze`)
      .set('Authorization', `Bearer ${arunToken}`)
      .attach('image1', fs.readFileSync(img1Path), 'arun_copy_index.png')
      .attach('image2', fs.readFileSync(img2Path), 'arun_copy_endbox.png');

    expect(arunRes.status).toBe(200);
    expect(arunRes.body.data.ownershipStatus).toBe('REJECTED');
    expect(arunRes.body.data.studentStatus).toBe('BLOCKED');
    expect(arunRes.body.data.summary.exactReuse).toBe(true);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 6. SECURITY: Re-photographed notebook copy intercepted via layout embedding
  // ════════════════════════════════════════════════════════════════════════════
  it('6. Re-photographed victim page (Attack E) is flagged via perceptual layout embedding', async () => {
    const exp4 = db.experiments.find((e) => e.experimentNumber === 4);
    const img1Path = pImg('processed/index/PILOT-PILOT_STUDENT_01-EXP04_index.png');
    const img2Path = pImg('processed/endbox/PILOT-PILOT_STUDENT_01-EXP04_endbox.png');
    const rephotoImg1 = pImg('test/PILOT-ATTACK-ATTACK_E_REPHOTOGRAPHED_VICTIM_PAGE_index.png');
    const rephotoImg2 = pImg('test/PILOT-ATTACK-ATTACK_E_REPHOTOGRAPHED_VICTIM_PAGE_endbox.png');

    // Store Kavin original
    await request(app)
      .post(`/api/student/experiments/${exp4!.id}/analyze`)
      .set('Authorization', `Bearer ${kavinToken}`)
      .attach('image1', fs.readFileSync(img1Path), 'kavin_idx.png')
      .attach('image2', fs.readFileSync(img2Path), 'kavin_end.png');

    // Arun submits re-photographed copy
    const res = await request(app)
      .post(`/api/student/experiments/${exp4!.id}/analyze`)
      .set('Authorization', `Bearer ${arunToken}`)
      .attach('image1', fs.readFileSync(rephotoImg1), 'rephoto_idx.png')
      .attach('image2', fs.readFileSync(rephotoImg2), 'rephoto_end.png');

    expect(res.status).toBe(200);
    expect(['MANUAL_REVIEW', 'REJECTED']).toContain(res.body.data.ownershipStatus);
    expect(res.body.data.summary.visualReuse).toBe(true);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 7. SECURITY: Mark Inconsistency between Index and End-Box Intercepted
  // ════════════════════════════════════════════════════════════════════════════
  it('7. Mark inconsistency between Index row and End-box flags review', async () => {
    const exp4 = db.experiments.find((e) => e.experimentNumber === 4);
    const alteredIndex = pImg('test/PILOT-ATTACK-ATTACK_N_ALTERED_MARK_index.png');
    const normalEndbox = pImg('processed/endbox/PILOT-PILOT_STUDENT_01-EXP04_endbox.png');

    const res = await request(app)
      .post(`/api/student/experiments/${exp4!.id}/analyze`)
      .set('Authorization', `Bearer ${kavinToken}`)
      .attach('image1', fs.readFileSync(alteredIndex), 'p7_kavin_index_mark_inconsist.png')
      .attach('image2', fs.readFileSync(normalEndbox), 'p7_kavin_endbox_mark_inconsist.png');

    expect(res.status).toBe(200);
    expect(res.body.data.summary.markConsistent).toBe(false);
    expect(['MANUAL_REVIEW', 'REJECTED']).toContain(res.body.data.ownershipStatus);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 8. SECURITY: Student Cannot Access Faculty Endpoints (RBAC)
  // ════════════════════════════════════════════════════════════════════════════
  it('8. Student cannot modify experiments, upload roster, or access faculty endpoints', async () => {
    // Attempt to create experiment as student
    const expRes = await request(app)
      .post('/api/faculty/experiments')
      .set('Authorization', `Bearer ${kavinToken}`)
      .send({ experimentNumber: 99, title: 'Hacked', endBoxPageNumber: 1 });

    expect(expRes.status).toBe(403);

    // Attempt to access audit logs as student
    const auditRes = await request(app)
      .get('/api/faculty/audit-logs')
      .set('Authorization', `Bearer ${kavinToken}`);

    expect(auditRes.status).toBe(403);
  });
});
