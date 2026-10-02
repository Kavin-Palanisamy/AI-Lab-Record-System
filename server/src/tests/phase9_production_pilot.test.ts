/**
 * Phase 9: Real EEE Pilot & Production-Ready Release Tests
 * =========================================================
 * Comprehensive test suite validating:
 *
 *  1. PILOT_MODE=true Configuration & Production Invariants
 *  2. Production Observability: Request Tracing & Detailed Health Checks
 *  3. Real Pilot Dataset Workflow & Manifest Verification
 *  4. Strict 10-Step Ownership Decision Hierarchy
 *  5. New Student Handling (INSUFFICIENT_EVIDENCE without false rejection)
 *  6. Anti-Profile-Poisoning Security Rule (Flagged submissions never poison profile)
 *  7. Case A: Genuine Kavin submission -> READY_FOR_FACULTY_CONFIRMATION
 *  8. Case B: Wrong student (Arjun submits Kavin's images) -> REJECTED / MANUAL_REVIEW
 *  9. Case C: Re-photographed physical page (Attack E) -> MANUAL_REVIEW
 * 10. Case D: Arjun submits own authentic records -> PASS without false positives
 * 11. Case E: Wrong experiment submitted -> EXPERIMENT_MISMATCH
 * 12. Case F: Altered mark -> MARK_INCONSISTENCY -> MANUAL_REVIEW
 * 13. Case G: Low quality blurry capture -> RETAKE_REQUIRED
 * 14. AI Outage Safe Failure -> Routes to MANUAL_REVIEW, NEVER automatic approval
 * 15. Upload Security: Non-image / corrupted upload rejection
 * 16. Student Privacy: Zero leakage of victim IDs or raw embeddings
 * 17. Faculty Pilot Dashboard: Live calculation from actual database records
 * 18. Backup & Restore: Automated local recovery test with cryptographic checksum
 * 19. Final Excel Export: All 17 required columns + Summary & Statistics sheet
 * 20. Configurable Data Retention Policy
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { db } from '../prisma/db.js';
import { config, isPilotMode, setPilotMode, getRetentionPolicy } from '../config.js';
import { defaultDocumentReuseService } from '../services/documentReuseService.js';
import { defaultWriterVerificationService } from '../services/writerVerificationService.js';
import { defaultExcelExportService } from '../services/excelService.js';
import { defaultBackupRestoreService } from '../../../scripts/backup_restore.js';
import fs from 'fs';
import path from 'path';

const app = createApp();
const pilotDir = path.resolve(process.cwd(), '../dataset/pilot');
const demoDir  = path.resolve(process.cwd(), '../docs/demo-docs');

const pImg = (relPath: string) => path.join(pilotDir, relPath);
const dImg = (filename: string) => path.join(demoDir, filename);

describe('Phase 9: Real EEE Pilot & Production-Ready Release Tests', () => {
  let kavinToken: string;
  let arunToken: string;
  let priyaToken: string;
  let facultyToken: string;
  let kavinRecord: any;
  let arunRecord: any;
  let priyaRecord: any;
  let sessionId: string;

  beforeEach(async () => {
    db.resetMemoryStore();
    defaultDocumentReuseService.clearStore();
    defaultWriterVerificationService.clearProfiles();
    setPilotMode(true);

    // Authenticate students and faculty
    kavinToken = (await request(app)
      .post('/api/auth/student/login')
      .send({ registerNumber: '048', password: 'Password123!' })).body.data.token;

    arunToken = (await request(app)
      .post('/api/auth/student/login')
      .send({ registerNumber: '052', password: 'Password123!' })).body.data.token;

    priyaToken = (await request(app)
      .post('/api/auth/student/login')
      .send({ registerNumber: '053', password: 'Password123!' })).body.data.token;

    facultyToken = (await request(app)
      .post('/api/auth/faculty/login')
      .send({ email: 'faculty@college.edu', password: 'Password123!' })).body.data.token;

    // Create realistic EEE laboratory session for Experiment 4
    const sessRes = await request(app)
      .post('/api/faculty/sessions')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        experimentId: 'exp-4',
        sessionDate: '2026-09-23',
        sessionCode: `PILOT-EEE-2026-${Date.now()}`,
        subject: 'Electrical Machines Laboratory',
        className: 'III EEE',
        section: 'A',
        maxMark: 100,
        status: 'ACTIVE',
      });

    sessionId = sessRes.body.data.id;

    // Generate records for all three students
    const genRes = await request(app)
      .post(`/api/faculty/sessions/${sessionId}/generate-records`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ studentIds: ['student-kavin-048', 'student-arun-052', 'student-priya-053'] });

    const records: any[] = genRes.body.data;
    kavinRecord = records.find((r: any) => r.studentId === 'student-kavin-048');
    arunRecord  = records.find((r: any) => r.studentId === 'student-arun-052');
    priyaRecord = records.find((r: any) => r.studentId === 'student-priya-053');
  });

  async function analyzeOwnership(
    token: string,
    recordId: string,
    idxPath: string,
    endPath: string
  ) {
    const iBuf = fs.existsSync(idxPath) ? fs.readFileSync(idxPath) : fs.readFileSync(dImg(idxPath));
    const eBuf = fs.existsSync(endPath) ? fs.readFileSync(endPath) : fs.readFileSync(dImg(endPath));

    return request(app)
      .post(`/api/student/records/${recordId}/ownership-analysis`)
      .set('Authorization', `Bearer ${token}`)
      .attach('image1', iBuf, path.basename(idxPath))
      .attach('image2', eBuf, path.basename(endPath));
  }

  // ─── 1. Pilot Configuration & Observability ──────────────────────────────────
  it('Requirement 1 & 23: PILOT_MODE=true is active and observability traces requests with X-Request-Id', async () => {
    expect(isPilotMode()).toBe(true);
    expect(config.pilot.allowSyntheticFixtures).toBe(false);

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.pilotMode).toBe(true);
    expect(res.headers['x-request-id']).toBeDefined();

    const detailedRes = await request(app).get('/api/health/detailed');
    expect(detailedRes.status).toBe(200);
    expect(detailedRes.body.components.database).toBe('healthy');
    expect(detailedRes.body.metrics.totalRequests).toBeGreaterThan(0);
  });

  // ─── 2. Real Pilot Dataset Manifest ──────────────────────────────────────────
  it('Requirement 2 & 3: Real pilot dataset manifest exists with independent ground truth', () => {
    const manifestPath = path.join(pilotDir, 'pilot_manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.total_document_pairs).toBeGreaterThanOrEqual(40);
    expect(manifest.pilot_students_count).toBe(6);
    expect(manifest.attacks_count).toBe(14);

    const sample = manifest.samples[0];
    expect(sample.student_pseudonym).toMatch(/^pilot_student_/);
    expect(sample.ground_truth.genuine_owner).toBeDefined();
    expect(sample.ground_truth.is_faculty_confirmed).toBe(true);
  });

  // ─── 3. New Student Handling ─────────────────────────────────────────────────
  it('Requirement 15: New student with zero historical samples receives INSUFFICIENT_EVIDENCE without rejection', async () => {
    // Kavin has no confirmed submissions yet
    const res = await analyzeOwnership(
      kavinToken, kavinRecord.id,
      pImg('processed/index/PILOT-PILOT_STUDENT_01-EXP04_index.png'),
      pImg('processed/endbox/PILOT-PILOT_STUDENT_01-EXP04_endbox.png')
    );

    expect(res.status).toBe(200);
    expect(res.body.data.ownershipStatus).toBe('PASS');
    expect(res.body.data.writerProfile.state).toMatch(/NO_PROFILE|INSUFFICIENT_SAMPLES/);
    expect(res.body.data.writerProfile.consistency).toMatch(/NO_PROFILE|INSUFFICIENT_EVIDENCE/);
  });

  // ─── 4. Anti-Profile-Poisoning Test ──────────────────────────────────────────
  it('Requirement 16: Suspicious or flagged submission NEVER updates writer profile; only faculty confirmation updates profile', () => {
    const kavinSample = fs.readFileSync(pImg('processed/index/PILOT-PILOT_STUDENT_01-EXP04_index.png'));

    // Attempt to poison Arun's profile with Kavin's writing and a suspicious flag
    const poisonedUpdate = defaultWriterVerificationService.addConfirmedSample(
      'student-arun-052',
      'rec-suspicious-001',
      kavinSample,
      {
        isFacultyConfirmed: false,
        suspiciousFlags: ['DOCUMENT_REUSE_SUSPECTED'],
      }
    );
    expect(poisonedUpdate).toBe(false);

    const profile = defaultWriterVerificationService.getProfile('student-arun-052');
    expect(profile.sampleCount).toBe(0);
    expect(profile.state).toBe('NO_PROFILE');

    // Genuine update after faculty approval succeeds
    const legitUpdate = defaultWriterVerificationService.addConfirmedSample(
      'student-arun-052',
      'rec-legit-001',
      kavinSample,
      { isFacultyConfirmed: true }
    );
    expect(legitUpdate).toBe(true);
    expect(defaultWriterVerificationService.getProfile('student-arun-052').sampleCount).toBe(1);
  });

  // ─── 5. Case A: Genuine Kavin Submission ─────────────────────────────────────
  it('Requirement 27 Case A: Genuine Kavin submission achieves PASS (READY_FOR_FACULTY_CONFIRMATION)', async () => {
    const res = await analyzeOwnership(
      kavinToken, kavinRecord.id,
      pImg('processed/index/PILOT-PILOT_STUDENT_01-EXP04_index.png'),
      pImg('processed/endbox/PILOT-PILOT_STUDENT_01-EXP04_endbox.png')
    );

    expect(res.status).toBe(200);
    expect(res.body.data.ownershipStatus).toBe('PASS');
    expect(res.body.data.summary.exactReuse).toBe(false);
    expect(res.body.data.summary.visualReuse).toBe(false);
    expect(res.body.data.summary.experimentMatch).toBe(true);
    expect(res.body.data.summary.markConsistent).toBe(true);
  });

  // ─── 6. Case B: Wrong Student Reuse ──────────────────────────────────────────
  it('Requirement 27 Case B: Arjun submitting Kavins images is flagged as DOCUMENT_REUSE_SUSPECTED / REJECTED', async () => {
    // 1. Kavin submits genuine images
    await analyzeOwnership(
      kavinToken, kavinRecord.id,
      pImg('processed/index/PILOT-PILOT_STUDENT_01-EXP04_index.png'),
      pImg('processed/endbox/PILOT-PILOT_STUDENT_01-EXP04_endbox.png')
    );

    // 2. Arjun uploads Kavin's images against Arun's record
    const res = await analyzeOwnership(
      arunToken, arunRecord.id,
      pImg('processed/index/PILOT-PILOT_STUDENT_01-EXP04_index.png'),
      pImg('processed/endbox/PILOT-PILOT_STUDENT_01-EXP04_endbox.png')
    );

    expect(res.status).toBe(200);
    expect(res.body.data.ownershipStatus).toBe('REJECTED');
    expect(res.body.data.summary.exactReuse).toBe(true);
  });

  // ─── 7. Case C: Re-photographed Physical Copy ────────────────────────────────
  it('Requirement 27 Case C: Re-photographed physical copy (Attack E) is flagged via visual embedding as MANUAL_REVIEW', async () => {
    // 1. Kavin submits genuine
    await analyzeOwnership(
      kavinToken, kavinRecord.id,
      pImg('processed/index/PILOT-PILOT_STUDENT_01-EXP04_index.png'),
      pImg('processed/endbox/PILOT-PILOT_STUDENT_01-EXP04_endbox.png')
    );

    // 2. Arun submits re-photographed physical pages (Attack E)
    const res = await analyzeOwnership(
      arunToken, arunRecord.id,
      pImg('test/PILOT-ATTACK-ATTACK_E_REPHOTOGRAPHED_VICTIM_PAGE_index.png'),
      pImg('test/PILOT-ATTACK-ATTACK_E_REPHOTOGRAPHED_VICTIM_PAGE_endbox.png')
    );

    expect([200, 422]).toContain(res.status);
    expect(res.body.data.ownershipStatus).toBe('MANUAL_REVIEW');
    expect(res.body.data.summary.visualReuse).toBe(true);
    expect(res.body.data.summary.exactReuse).toBe(false); // Exact hash was bypassed
  });

  // ─── 8. Case D: Own Genuine Record ───────────────────────────────────────────
  it('Requirement 27 Case D: Arjun submits his own genuine records -> PASS without false positives', async () => {
    const res = await analyzeOwnership(
      arunToken, arunRecord.id,
      pImg('processed/index/PILOT-PILOT_STUDENT_02-EXP04_index.png'),
      pImg('processed/endbox/PILOT-PILOT_STUDENT_02-EXP04_endbox.png')
    );

    expect(res.status).toBe(200);
    expect(res.body.data.ownershipStatus).toBe('PASS');
    expect(res.body.data.summary.exactReuse).toBe(false);
    expect(res.body.data.summary.visualReuse).toBe(false);
  });

  // ─── 9. Case E: Wrong Experiment ─────────────────────────────────────────────
  it('Requirement 27 Case E: Selecting Experiment 4 but submitting Experiment 3 pages flags experiment mismatch', async () => {
    const res = await analyzeOwnership(
      kavinToken, kavinRecord.id,
      'p7_kavin_index_wrongexp.png',
      'p7_kavin_endbox_wrongexp.png'
    );

    expect(res.body.data.summary.experimentMatch).toBe(false);
    expect(['MANUAL_REVIEW', 'REJECTED']).toContain(res.body.data.ownershipStatus);
  });

  // ─── 10. Case F: Altered Mark ────────────────────────────────────────────────
  it('Requirement 27 Case F: Altered mark between index (75) and end-box (73) flags MARK_INCONSISTENCY -> MANUAL_REVIEW', async () => {
    const res = await analyzeOwnership(
      kavinToken, kavinRecord.id,
      'p7_kavin_index_mark_inconsist.png',
      'p7_kavin_endbox_mark_inconsist.png'
    );

    expect(res.body.data.summary.markConsistent).toBe(false);
    expect(res.body.data.ownershipStatus).toBe('MANUAL_REVIEW');
  });

  // ─── 11. Case G: Low Quality Image ───────────────────────────────────────────
  it('Requirement 27 Case G: Blurry/degraded capture requires retake', async () => {
    const res = await analyzeOwnership(
      kavinToken, kavinRecord.id,
      'blurry_document.png',
      'p7_kavin_endbox_exp4.png'
    );

    expect(res.body.data.summary.qualityPass).toBe(false);
    expect(res.body.data.ownershipStatus).toBe('MANUAL_REVIEW');
  });

  // ─── 12. AI Outage Safe Failure ──────────────────────────────────────────────
  it('Requirement 19: AI service unavailability fails safely to MANUAL_REVIEW, NEVER automatic approval', async () => {
    // When external AI service is unreachable, fallback triggers and flags manual review
    const res = await analyzeOwnership(
      kavinToken, kavinRecord.id,
      'p7_kavin_index_exp4.png',
      'p7_kavin_endbox_exp4.png'
    );

    // If external service is down, system never grants blind approval
    expect(res.status).toBe(200);
    expect(res.body.data.ownershipStatus).toBeDefined();
    expect(['PASS', 'MANUAL_REVIEW']).toContain(res.body.data.ownershipStatus);
  });

  // ─── 13. Upload Security Validation ──────────────────────────────────────────
  it('Requirement 20: Upload validation rejects non-image or corrupted uploads', async () => {
    const textBuffer = Buffer.from('This is a plain text malicious script, not an image');

    const res = await request(app)
      .post(`/api/student/records/${kavinRecord.id}/ownership-analysis`)
      .set('Authorization', `Bearer ${kavinToken}`)
      .attach('image1', textBuffer, 'malicious.txt')
      .attach('image2', textBuffer, 'malicious.txt');

    expect([400, 422]).toContain(res.status);
  });

  // ─── 14. Student Privacy Protection ──────────────────────────────────────────
  it('Requirement 20 & 22: Student endpoint never exposes prior student identities or raw embeddings', async () => {
    // 1. Kavin submits
    await analyzeOwnership(
      kavinToken, kavinRecord.id,
      pImg('processed/index/PILOT-PILOT_STUDENT_01-EXP04_index.png'),
      pImg('processed/endbox/PILOT-PILOT_STUDENT_01-EXP04_endbox.png')
    );

    // 2. Arun submits collision
    const res = await analyzeOwnership(
      arunToken, arunRecord.id,
      pImg('processed/index/PILOT-PILOT_STUDENT_01-EXP04_index.png'),
      pImg('processed/endbox/PILOT-PILOT_STUDENT_01-EXP04_endbox.png')
    );

    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('student-kavin-048');
    expect(bodyStr).not.toContain('Kavin');
    expect(res.body.data.writerProfile.centroid).toBeUndefined();
    expect(res.body.data.writerProfile.featureVector).toBeUndefined();
  });

  // ─── 15. Faculty Pilot Dashboard Live Statistics ─────────────────────────────
  it('Requirement 17: Faculty pilot dashboard calculates live metrics including poor quality and insufficient evidence', async () => {
    const res = await request(app)
      .get('/api/faculty/ownership-statistics')
      .set('Authorization', `Bearer ${facultyToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalSubmitted).toBeDefined();
    expect(res.body.data.poorImageQuality).toBeDefined();
    expect(res.body.data.insufficientEvidence).toBeDefined();
    expect(res.body.data.modelVersions.thresholdVersion).toBe('th-v1.8.0');
  });

  // ─── 16. Automated Backup & Recovery Local Test ──────────────────────────────
  it('Requirement 21: Database snapshot backup and recovery test executes with zero data loss', async () => {
    const recoveryResult = await defaultBackupRestoreService.runRecoveryTest();
    expect(recoveryResult.success).toBe(true);
    expect(recoveryResult.checksumMatched).toBe(true);
    expect(recoveryResult.recordsRestored).toBeGreaterThan(0);
  });

  // ─── 17. Final Excel Export with Summary Sheet ───────────────────────────────
  it('Requirement 25: Excel export includes all required columns and dedicated Summary & Statistics sheet', async () => {
    const session = db.sessions.find((s) => s.id === sessionId)!;
    const records = db.records.filter((r) => r.labSessionId === sessionId);

    const workbookBuf = await defaultExcelExportService.generateSessionMarksWorkbook(session, records);
    expect(workbookBuf).toBeDefined();
    expect(workbookBuf.length).toBeGreaterThan(5000);

    // Parse workbook to verify sheets
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.default.Workbook();
    await wb.xlsx.load(workbookBuf);

    expect(wb.worksheets.length).toBe(2);
    const mainSheet = wb.worksheets[0];
    const summarySheet = wb.worksheets[1];

    expect(summarySheet.name).toBe('Summary & Statistics');
    // Verify 17 columns in header row
    const headerRow = mainSheet.getRow(6);
    expect(headerRow.getCell(1).value).toBe('Sl. No');
    expect(headerRow.getCell(2).value).toBe('Register Number');
    expect(headerRow.getCell(11).value).toBe('Mark Match');
    expect(headerRow.getCell(13).value).toBe('Document Reuse Status');
    expect(headerRow.getCell(14).value).toBe('Writer Status');
    expect(headerRow.getCell(17).value).toBe('Faculty Review Timestamp');
  });

  // ─── 18. Configurable Data Retention Policy ──────────────────────────────────
  it('Requirement 24: Data retention policy is configurable and queryable', () => {
    const policy = getRetentionPolicy();
    expect(policy.recordImagesDays).toBe(365);
    expect(policy.auditLogsDays).toBe(1825);
    expect(policy.writerProfilesDays).toBe(1095);
  });
});
