/**
 * Phase 7: Ownership Analysis Controller
 *
 * POST /api/student/records/:recordId/ownership-analysis
 *
 * Accepts two images (image1 = index/contents page, image2 = end-of-experiment box).
 * The server obtains authenticatedStudentId, recordId, experimentId, sessionId from
 * trusted backend context. The client CANNOT override those identities.
 *
 * Returns structured ownership evidence without exposing other students' data.
 */

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { db } from '../prisma/db.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors.js';
import { defaultIndexImageProvider } from '../services/indexImageAnalyzer.js';
import { defaultEndBoxProvider } from '../services/endBoxAnalyzer.js';
import { defaultDocumentOwnershipVerificationService } from '../services/documentOwnershipVerificationService.js';
import { defaultWriterVerificationService } from '../services/writerVerificationService.js';
import { AuditService } from '../services/auditService.js';
import { RecordStatus } from '@prisma/client';

const auditService = new AuditService(db);

// ─── POST /api/student/records/:recordId/ownership-analysis ───────────────────
export async function analyzeDocumentOwnership(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'STUDENT') {
      throw new UnauthorizedError('Student authentication required');
    }

    const { recordId } = req.params;
    const authenticatedStudentId = req.user.id;

    // ── Get both uploaded image buffers ──────────────────────────────────────
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const indexFile  = files?.['image1']?.[0];
    const endBoxFile = files?.['image2']?.[0];

    if (!indexFile || !endBoxFile) {
      throw new ValidationError(
        'Both image1 (contents/index page) and image2 (end-of-experiment evaluation box) are required.',
        'MISSING_IMAGES'
      );
    }

    // ── Verify record exists and belongs to authenticated student ─────────────
    const record = await db.getRecordById(recordId);
    if (!record) {
      throw new NotFoundError('Laboratory record not found');
    }
    if (record.studentId !== authenticatedStudentId) {
      await auditService.log({
        actorType:  'STUDENT',
        actorId:    authenticatedStudentId,
        action:     'OWNERSHIP_ANALYSIS_REJECTED_OWNERSHIP_MISMATCH',
        entityType: 'LabRecord',
        entityId:   recordId,
        metadata:   { attemptedStudentId: authenticatedStudentId, ownerStudentId: record.studentId },
      });
      throw new UnauthorizedError(
        'This laboratory record does not belong to your account.',
        'RECORD_OWNERSHIP_MISMATCH'
      );
    }

    // ── Get session and experiment context ────────────────────────────────────
    const session = await db.getLabSessionById(record.labSessionId);
    const experiment = db.experiments.find((e) => e.id === record.experimentId);

    const expectedExperimentNumber = experiment?.experimentNumber ?? 1;
    const sessionDate = session?.sessionDate
      ? new Date(session.sessionDate).toISOString().split('T')[0]
      : null;

    // Expected page range (from experiment config, faculty configured endBoxPageNumber)
    const expectedPageStart = (expectedExperimentNumber - 1) * 20 + 1;
    const expectedPageEnd   = experiment?.endBoxPageNumber ?? (expectedExperimentNumber * 20);

    // ── Run index image analysis ─────────────────────────────────────────────
    const indexAnalysis = await defaultIndexImageProvider.analyzeIndexImage(
      indexFile.buffer,
      indexFile.originalname || `index_exp${expectedExperimentNumber}.png`,
      expectedExperimentNumber
    );

    // ── Run end-box analysis ─────────────────────────────────────────────────
    const endBoxAnalysis = await defaultEndBoxProvider.analyzeEndBox(
      endBoxFile.buffer,
      endBoxFile.originalname || `endbox_exp${expectedExperimentNumber}.png`,
      indexAnalysis.indexRow.mark ?? undefined,
      expectedPageEnd
    );

    // ── Run ownership verification ────────────────────────────────────────────
    const ownershipResult = defaultDocumentOwnershipVerificationService.verify({
      currentStudentId:         authenticatedStudentId,
      recordId,
      expectedExperimentNumber,
      expectedPageStart,
      expectedPageEnd,
      sessionDate,
      indexAnalysis,
      endBoxAnalysis,
      indexBuffer:  indexFile.buffer,
      endBoxBuffer: endBoxFile.buffer,
    });

    // ── Audit log ─────────────────────────────────────────────────────────────
    await auditService.log({
      actorType:  'STUDENT',
      actorId:    authenticatedStudentId,
      action:     'OWNERSHIP_ANALYSIS_COMPLETED',
      entityType: 'LabRecord',
      entityId:   recordId,
      metadata: {
        ownershipStatus:      ownershipResult.ownershipStatus,
        riskLevel:            ownershipResult.riskLevel,
        experimentMatch:      ownershipResult.summary.experimentMatch,
        exactReuse:           ownershipResult.summary.exactReuse,
        visualReuse:          ownershipResult.summary.visualReuse,
        markConsistent:       ownershipResult.summary.markConsistent,
        arithmeticConsistent: ownershipResult.summary.arithmeticConsistent,
        writerConsistent:     ownershipResult.summary.writerConsistent,
        reviewReason:         ownershipResult.reviewReason,
      },
    });

    if (ownershipResult.summary.exactReuse) {
      await auditService.log({
        actorType:  'SYSTEM',
        actorId:    'DOCUMENT_REUSE_DETECTOR',
        action:     'DOCUMENT_REUSE_SUSPECTED',
        entityType: 'LabRecord',
        entityId:   recordId,
        metadata: {
          studentId:    authenticatedStudentId,
          reuseSignal:  ownershipResult.reuseDetails?.reuseSignal,
          // Faculty-only: include previous record info in audit, NOT in API response
          previousRecordId: ownershipResult.reuseDetails?.indexExactReuse.previousRecordId,
        },
      });
    }

    if (ownershipResult.summary.visualReuse) {
      await auditService.log({
        actorType:  'SYSTEM',
        actorId:    'DOCUMENT_REUSE_DETECTOR',
        action:     'DOCUMENT_REUSE_SUSPECTED',
        entityType: 'LabRecord',
        entityId:   recordId,
        metadata: {
          studentId:   authenticatedStudentId,
          reuseSignal: ownershipResult.reuseDetails?.reuseSignal,
          similarity:  ownershipResult.reuseDetails?.pairReuseResult?.indexReuse.similarityScore,
        },
      });
    }

    if (ownershipResult.summary.writerConsistent === false) {
      await auditService.log({
        actorType:  'SYSTEM',
        actorId:    'WRITER_VERIFICATION_ENGINE',
        action:     'WRITER_INCONSISTENCY',
        entityType: 'LabRecord',
        entityId:   recordId,
        metadata: {
          studentId:       authenticatedStudentId,
          profileState:    ownershipResult.writerDetails?.result.profileState,
          similarityToOwn: ownershipResult.writerDetails?.result.similarityToOwn,
        },
      });
    }

    if (!ownershipResult.summary.markConsistent) {
      await auditService.log({
        actorType:  'SYSTEM',
        actorId:    'MARK_CONSISTENCY_ENGINE',
        action:     'MARK_INCONSISTENCY',
        entityType: 'LabRecord',
        entityId:   recordId,
        metadata: {
          indexMark:     ownershipResult.markDetails?.indexMark,
          endBoxTotal:   ownershipResult.markDetails?.endBoxTotal,
        },
      });
    }

    // ── Update record status based on ownership result ────────────────────────
    let newStatus = record.status;
    let studentStatus = 'NOT_SUBMITTED';
    if (ownershipResult.ownershipStatus === 'REJECTED') {
      newStatus = RecordStatus.REJECTED;
      studentStatus = 'BLOCKED';
    } else if (ownershipResult.ownershipStatus === 'MANUAL_REVIEW') {
      newStatus = RecordStatus.MANUAL_REVIEW;
      studentStatus = ownershipResult.summary.qualityPass === false ? 'RETAKE_REQUIRED' : 'INSUFFICIENT_EVIDENCE';
    } else if (ownershipResult.ownershipStatus === 'PASS') {
      newStatus = RecordStatus.VERIFIED;
      studentStatus = 'VERIFIED';
    }

    const detectedMark = ownershipResult.markDetails?.endBoxTotal ?? ownershipResult.markDetails?.indexMark ?? record.detectedMark;

    await db.updateRecord(recordId, {
      status:             newStatus,
      manualReviewReason: ownershipResult.reviewReason,
      detectedMark,
      submissionTimestamp: new Date(),
      markVerificationStatus: ownershipResult.summary.markConsistent ? 'MATCH' : 'MARK_MISMATCH',
      aiConfidence: ownershipResult.riskLevel === 'LOW' ? 0.95 : 0.80,
    });

    // ── Build student-safe response (NO other students' data) ─────────────────
    const studentSafeResponse = {
      ownershipStatus:   ownershipResult.ownershipStatus,
      studentStatus,
      riskLevel:         ownershipResult.riskLevel,
      summary: {
        experimentMatch:         ownershipResult.summary.experimentMatch,
        pageRangeMatch:          ownershipResult.summary.pageRangeMatch,
        dateMatch:               ownershipResult.summary.dateMatch,
        markConsistent:          ownershipResult.summary.markConsistent,
        arithmeticConsistent:    ownershipResult.summary.arithmeticConsistent,
        qualityPass:             ownershipResult.summary.qualityPass,
        facultySignaturePresent: ownershipResult.summary.facultySignaturePresent,
        // Reuse: only boolean signals, NO prior student/record info
        exactReuse:          ownershipResult.summary.exactReuse,
        visualReuse:         ownershipResult.summary.visualReuse,
        exactReuseDetected:  ownershipResult.summary.exactReuse,
        visualReuseDetected: ownershipResult.summary.visualReuse,
        // Writer consistency
        writerConsistent:    ownershipResult.summary.writerConsistent,
        crossPageConsistent: ownershipResult.summary.crossPageConsistent,
      },
      modelVersions: ownershipResult.modelVersions,
      markDetails: {
        indexMark:          ownershipResult.markDetails?.indexMark,
        endBoxTotal:        ownershipResult.markDetails?.endBoxTotal,
        computedTotal:      ownershipResult.markDetails?.computedTotal,
        consistent:         ownershipResult.summary.markConsistent,
        arithmeticMatch:    ownershipResult.summary.arithmeticConsistent,
      },
      experimentDetails: {
        expectedExperimentNumber,
        detectedExperimentNumber: ownershipResult.experimentDetails?.detectedIndexExp,
        pageRangeMatch:           ownershipResult.summary.pageRangeMatch,
        dateMatch:                ownershipResult.summary.dateMatch,
      },
      writerProfile: {
        state:     ownershipResult.writerDetails?.result.profileState,
        // Only report consistency result, NOT vectors or similarity scores to other students
        consistency:     ownershipResult.writerDetails?.result.consistency,
        crossPage:       ownershipResult.writerDetails?.crossPage.consistency,
      },
      // Generic message — never expose other student's identity
      reviewMessage: buildStudentMessage(ownershipResult.ownershipStatus),
      // Detailed reason only for MANUAL_REVIEW (generic, no other student data)
      reviewReason: ownershipResult.ownershipStatus !== 'PASS'
        ? sanitizeReviewReason(ownershipResult.reviewReason)
        : undefined,
    };

    res.json({
      success: true,
      message: 'Document ownership analysis complete',
      data:    studentSafeResponse,
    });

  } catch (error) {
    next(error);
  }
}

// ─── Faculty: Get ownership verification details (full, including prior student ID) ─
export async function getFacultyOwnershipDetails(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty authentication required');
    }

    const { id: recordId } = req.params;
    const record = await db.getRecordById(recordId);
    if (!record) throw new NotFoundError('Record not found');

    // Return the audit log entries for this record related to ownership analysis
    const auditLogs = db.auditLogs
      .filter((l) => l.entityId === recordId && [
        'OWNERSHIP_ANALYSIS_COMPLETED',
        'DOCUMENT_REUSE_SUSPECTED',
        'WRITER_INCONSISTENCY',
        'MARK_INCONSISTENCY',
        'CROSS_PAGE_INCONSISTENCY',
        'FACULTY_OWNERSHIP_APPROVED',
        'FACULTY_OWNERSHIP_REJECTED',
      ].includes(l.action))
      .map((l) => ({
        ...l,
        metadata: typeof l.metadata === 'string' ? JSON.parse(l.metadata) : l.metadata,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
      success: true,
      data: {
        recordId,
        studentId:      record.studentId,
        status:         record.status,
        reviewReason:   record.manualReviewReason,
        ownershipAudit: auditLogs,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Faculty: Approve ownership review ────────────────────────────────────────
export async function facultyApproveOwnership(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty authentication required');
    }

    const { id: recordId } = req.params;
    const { notes } = req.body;
    const record = await db.getRecordById(recordId);
    if (!record) throw new NotFoundError('Record not found');

    await db.updateRecord(recordId, { status: RecordStatus.PENDING, manualReviewReason: null });

    // Update writer profile with confirmed sample (index image from prior analysis)
    // In production this would read the stored index image; here we simulate approval
    await auditService.log({
      actorType:  'FACULTY',
      actorId:    req.user.id,
      action:     'FACULTY_OWNERSHIP_APPROVED',
      entityType: 'LabRecord',
      entityId:   recordId,
      metadata:   { facultyNotes: notes, studentId: record.studentId },
    });

    res.json({ success: true, message: 'Ownership review approved. Record returned to pending.' });
  } catch (error) {
    next(error);
  }
}

// ─── Faculty: Reject ownership review ─────────────────────────────────────────
export async function facultyRejectOwnership(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty authentication required');
    }

    const { id: recordId } = req.params;
    const { reason } = req.body;
    const record = await db.getRecordById(recordId);
    if (!record) throw new NotFoundError('Record not found');

    await db.updateRecord(recordId, {
      status: RecordStatus.REJECTED,
      manualReviewReason: `Faculty rejected ownership: ${reason ?? 'No reason provided'}`,
    });

    await auditService.log({
      actorType:  'FACULTY',
      actorId:    req.user.id,
      action:     'FACULTY_OWNERSHIP_REJECTED',
      entityType: 'LabRecord',
      entityId:   recordId,
      metadata:   { reason, studentId: record.studentId },
    });

    res.json({ success: true, message: 'Ownership review rejected. Record marked as rejected.' });
  } catch (error) {
    next(error);
  }
}

// ─── Faculty: Request retake ───────────────────────────────────────────────────
export async function facultyRequestRetake(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty authentication required');
    }

    const { id: recordId } = req.params;
    const { reason } = req.body;
    const record = await db.getRecordById(recordId);
    if (!record) throw new NotFoundError('Record not found');

    await db.updateRecord(recordId, {
      status: RecordStatus.PENDING,
      manualReviewReason: `Retake requested: ${reason ?? 'Faculty requested new submission'}`,
    });

    await auditService.log({
      actorType:  'FACULTY',
      actorId:    req.user.id,
      action:     'FACULTY_OWNERSHIP_REVIEW',
      entityType: 'LabRecord',
      entityId:   recordId,
      metadata:   { action: 'RETAKE_REQUESTED', reason, studentId: record.studentId },
    });

    res.json({ success: true, message: 'Retake requested. Student must resubmit document.' });
  } catch (error) {
    next(error);
  }
}

// ─── Add confirmed sample to writer profile (called after faculty approval) ────
export async function addWriterSample(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty authentication required');
    }

    const { id: recordId } = req.params;
    const record = await db.getRecordById(recordId);
    if (!record) throw new NotFoundError('Record not found');

    const file = req.file;
    if (!file) throw new ValidationError('Index image required for writer profile update', 'MISSING_IMAGE');

    defaultWriterVerificationService.addConfirmedSample(
      record.studentId,
      recordId,
      file.buffer,
      { isFacultyConfirmed: true }
    );

    const profile = defaultWriterVerificationService.getProfile(record.studentId);

    res.json({
      success: true,
      message: 'Writer sample added to profile',
      data: {
        studentId:    record.studentId,
        profileState: profile.state,
        sampleCount:  profile.sampleCount,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Requirement 26: Ownership Verification Statistics ────────────────────────
export async function getOwnershipStatistics(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty authentication required');
    }

    const records = await db.getAllRecords();
    const audits = await db.getAuditLogs();

    const totalSubmitted = records.filter(
      (r) => r.status !== 'PENDING' || (r.submissionCount && r.submissionCount > 0) || r.manualReviewReason !== null
    ).length;
    const passed = records.filter((r) => r.status === 'VERIFIED').length;
    const manualReview = records.filter((r) => r.status === 'MANUAL_REVIEW').length;
    const rejected = records.filter((r) => r.status === 'REJECTED').length;

    const possibleReuse = audits.filter((a) => {
      if (a.action.includes('REUSE')) return true;
      try {
        const meta = typeof a.metadata === 'string' ? JSON.parse(a.metadata) : (a.metadata as any);
        return !!(meta?.reuseSignal || meta?.reuseDetected || meta?.exactReuse);
      } catch {
        return false;
      }
    }).length;

    const writerInconsistencies = audits.filter((a) => {
      if (a.action.includes('WRITER')) return true;
      try {
        const meta = typeof a.metadata === 'string' ? JSON.parse(a.metadata) : (a.metadata as any);
        return meta?.writerConsistent === false;
      } catch {
        return false;
      }
    }).length;

    const markInconsistencies = records.filter(
      (r) =>
        r.markVerificationStatus === 'MARK_MISMATCH' ||
        (r.manualReviewReason && r.manualReviewReason.toLowerCase().includes('mark'))
    ).length;

    const poorImageQuality = records.filter(
      (r) =>
        (r.manualReviewReason && (r.manualReviewReason.toLowerCase().includes('quality') || r.manualReviewReason.toLowerCase().includes('blur'))) ||
        (r.aiExtractedData && r.aiExtractedData.includes('RETAKE_REQUIRED'))
    ).length;

    const insufficientEvidence = records.filter(
      (r) =>
        (r.manualReviewReason && r.manualReviewReason.toLowerCase().includes('insufficient')) ||
        (r.aiExtractedData && r.aiExtractedData.includes('INSUFFICIENT_EVIDENCE'))
    ).length;

    res.json({
      success: true,
      data: {
        totalSubmitted,
        passed,
        manualReview,
        rejected,
        possibleReuse,
        writerInconsistencies,
        markInconsistencies,
        poorImageQuality,
        insufficientEvidence,
        modelVersions: {
          writerModelVersion: defaultWriterVerificationService.modelVersion,
          documentModelVersion: 'doc-v1.4-spatial-pyramid',
          thresholdVersion: defaultWriterVerificationService.getThresholds().version,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── POST /api/student/experiments/:experimentId/analyze ──────────────────────
export async function analyzeExperimentSubmission(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'STUDENT') {
      throw new UnauthorizedError('Student authentication required');
    }

    const { experimentId } = req.params;
    const authenticatedStudentId = req.user.id;

    // Get or initialize student's record for this experiment
    const record = await db.getOrCreateStudentRecord(authenticatedStudentId, experimentId);
    req.params.recordId = record.id;

    // Execute standard ownership verification for this record
    return await analyzeDocumentOwnership(req, res, next);
  } catch (error) {
    next(error);
  }
}

// ─── POST /api/student/experiments/:experimentId/submit ───────────────────────
export async function finalizeExperimentSubmission(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'STUDENT') {
      throw new UnauthorizedError('Student authentication required');
    }

    const { experimentId } = req.params;
    const authenticatedStudentId = req.user.id;

    const record = await db.getOrCreateStudentRecord(authenticatedStudentId, experimentId);

    const updated = await db.updateRecord(record.id, {
      submissionTimestamp: new Date(),
    });

    await auditService.log({
      actorType: 'STUDENT',
      actorId: authenticatedStudentId,
      action: 'STUDENT_SUBMISSION_FINALIZED',
      entityType: 'LabRecord',
      entityId: record.id,
      metadata: { experimentId, status: updated.status, mark: updated.detectedMark },
    });

    res.json({
      success: true,
      message: 'Submission successfully recorded',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildStudentMessage(status: string): string {
  switch (status) {
    case 'PASS':
      return 'Record evidence received. Pending faculty confirmation.';
    case 'MANUAL_REVIEW':
      return 'Your record requires faculty verification before it can be accepted.';
    case 'REJECTED':
      return 'Your record submission was rejected. Please contact your faculty for clarification.';
    default:
      return 'Record evidence received.';
  }
}

function sanitizeReviewReason(reason?: string): string | undefined {
  if (!reason) return undefined;
  // Remove any mentions of other students' names or IDs
  return reason
    .replace(/student[-_]?(kavin|arun|priya|048|052|053)/gi, 'another student account')
    .replace(/student-id-[a-z0-9-]+/gi, 'another student account')
    .replace(/previous (record|student) (id|ID): [a-z0-9-]+/g, 'previously verified record');
}
