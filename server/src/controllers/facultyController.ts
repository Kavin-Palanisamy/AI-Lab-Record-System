import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { db } from '../prisma/db.js';
import { defaultRecordService } from '../services/recordService.js';
import { AuditService } from '../services/auditService.js';
import { EvaluationService } from '../services/evaluationService.js';
import { NotFoundError, ValidationError, UnauthorizedError } from '../utils/errors.js';
import { defaultExcelExportService } from '../services/excelService.js';

const auditService = new AuditService(db);

export async function getFacultyDashboard(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty access required');
    }

    const records = await db.getAllRecords();
    const auditLogs = await auditService.getRecentLogs(20);
    const experiments = await db.getExperiments();

    // Summary statistics
    const totalSubmissions = records.filter((r) => r.imagePath !== null || r.status !== 'PENDING').length;
    const verifiedCount = records.filter((r) => r.status === 'VERIFIED').length;
    const pendingReviewCount = records.filter((r) => r.status === 'PENDING').length;
    const rejectedCount = records.filter((r) => r.status === 'REJECTED').length;

    res.json({
      success: true,
      data: {
        stats: {
          totalSubmissions,
          verifiedCount,
          pendingReviewCount,
          rejectedCount,
          totalRecords: records.length,
        },
        records,
        recentAudits: auditLogs,
        experiments,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getAllRecords(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const records = await db.getAllRecords();
    res.json({
      success: true,
      data: records,
    });
  } catch (error) {
    next(error);
  }
}

export async function getRecordById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const record = await db.getRecordById(id);
    if (!record) {
      throw new NotFoundError('Record not found');
    }

    const auditTrail = await auditService.getLogsForRecord(id);

    res.json({
      success: true,
      data: {
        record,
        auditTrail,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function approveRecord(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty access required');
    }

    const { id } = req.params;
    const { mark } = req.body;

    if (mark === undefined || mark === null || isNaN(Number(mark))) {
      throw new ValidationError('A valid numerical mark is required for approval');
    }

    const updated = await defaultRecordService.approveRecord(req.user.id, id, Number(mark));

    res.json({
      success: true,
      message: `Record ${updated.uniqueRecordCode} verified with mark ${mark}/${updated.maxMark}`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

export async function rejectRecord(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty access required');
    }

    const { id } = req.params;
    const { reason } = req.body || {};

    const updated = await defaultRecordService.rejectRecord(req.user.id, id, reason);

    res.json({
      success: true,
      message: `Record ${updated.uniqueRecordCode} rejected`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

export async function correctRecord(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty access required');
    }

    const { id } = req.params;
    const { mark, correctedMark, reason } = req.body;
    const finalMark = mark !== undefined ? mark : correctedMark;

    if (finalMark === undefined || finalMark === null || isNaN(Number(finalMark))) {
      throw new ValidationError('A valid numerical mark is required for correction');
    }

    const updated = await defaultRecordService.correctRecord(
      req.user.id,
      id,
      Number(finalMark),
      reason || 'Faculty manual adjustment of OCR extracted mark'
    );

    res.json({
      success: true,
      message: `Record ${updated.uniqueRecordCode} corrected with mark ${mark}/${updated.maxMark}`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAuditLogs(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 200;
    let logs = await auditService.getRecentLogs(limit);

    const studentFilter = req.query.student as string | undefined;
    const sessionFilter = req.query.session as string | undefined;
    const eventFilter = (req.query.event || req.query.action) as string | undefined;
    const dateFilter = req.query.date as string | undefined;

    if (studentFilter) {
      logs = logs.filter(
        (l) =>
          l.actorId.toLowerCase().includes(studentFilter.toLowerCase()) ||
          JSON.stringify(l.metadata).toLowerCase().includes(studentFilter.toLowerCase())
      );
    }
    if (sessionFilter) {
      logs = logs.filter(
        (l) =>
          l.entityId.toLowerCase().includes(sessionFilter.toLowerCase()) ||
          JSON.stringify(l.metadata).toLowerCase().includes(sessionFilter.toLowerCase())
      );
    }
    if (eventFilter) {
      logs = logs.filter((l) => l.action.toLowerCase().includes(eventFilter.toLowerCase()));
    }
    if (dateFilter) {
      logs = logs.filter((l) => new Date(l.createdAt).toISOString().startsWith(dateFilter));
    }

    res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    next(error);
  }
}

export async function createSession(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty access required');
    }

    const { experimentId, sessionDate, sessionCode, subject, className, section, maxMark, startTime, endTime, status } = req.body;
    const session = await defaultRecordService.createLabSession(req.user.id, {
      experimentId,
      sessionDate,
      sessionCode,
      subject,
      className,
      section,
      maxMark: maxMark !== undefined ? Number(maxMark) : 10,
      startTime,
      endTime,
      status,
    });

    res.status(201).json({
      success: true,
      message: `Lab session ${session.sessionCode} created successfully`,
      data: session,
    });
  } catch (error) {
    next(error);
  }
}

export async function getFacultySessions(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty access required');
    }

    const sessions = await db.getLabSessions();
    res.json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    next(error);
  }
}

export async function getFacultySessionById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty access required');
    }

    const { id } = req.params;
    const session = await db.getLabSessionById(id);
    if (!session) {
      throw new NotFoundError('Lab session not found');
    }

    const records = await db.getRecordsBySession(id);
    
    // Calculate average verification time from actual system events
    const reviewedRecords = records.filter(
      (r) => r.status === 'VERIFIED' || r.status === 'REJECTED' || (r.status === 'MANUAL_REVIEW' && r.updatedAt !== r.createdAt)
    );
    let totalReviewSeconds = 0;
    let countedReviews = 0;

    for (const r of reviewedRecords) {
      if (r.reviewDurationSeconds && r.reviewDurationSeconds > 0) {
        totalReviewSeconds += r.reviewDurationSeconds;
        countedReviews++;
      } else if (r.updatedAt && r.createdAt) {
        const diffSec = (new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime()) / 1000;
        if (diffSec > 0 && diffSec < 86400) {
          totalReviewSeconds += diffSec;
          countedReviews++;
        }
      }
    }
    const avgReviewTimeSeconds = countedReviews > 0 ? Math.round(totalReviewSeconds / countedReviews) : 0;

    const stats = {
      totalStudents: records.length,
      submitted: records.filter((r) => r.imagePath !== null || r.status !== 'PENDING').length,
      submittedCount: records.filter((r) => r.imagePath !== null || r.status !== 'PENDING').length,
      pending: records.filter((r) => r.status === 'PENDING').length,
      pendingCount: records.filter((r) => r.status === 'PENDING').length,
      verified: records.filter((r) => r.status === 'VERIFIED').length,
      verifiedCount: records.filter((r) => r.status === 'VERIFIED').length,
      manualReview: records.filter((r) => r.status === 'MANUAL_REVIEW').length,
      manualReviewCount: records.filter((r) => r.status === 'MANUAL_REVIEW').length,
      rejected: records.filter((r) => r.status === 'REJECTED').length,
      rejectedCount: records.filter((r) => r.status === 'REJECTED').length,
      avgReviewTimeSeconds,
    };

    res.json({
      success: true,
      data: {
        session,
        records,
        stats,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getSessionStats(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty access required');
    }

    const { id } = req.params;
    const session = await db.getLabSessionById(id);
    if (!session) {
      throw new NotFoundError('Lab session not found');
    }

    const records = await db.getRecordsBySession(id);
    const reviewedRecords = records.filter(
      (r) => r.status === 'VERIFIED' || r.status === 'REJECTED' || (r.status === 'MANUAL_REVIEW' && r.updatedAt !== r.createdAt)
    );
    let totalReviewSeconds = 0;
    let countedReviews = 0;

    for (const r of reviewedRecords) {
      if (r.reviewDurationSeconds && r.reviewDurationSeconds > 0) {
        totalReviewSeconds += r.reviewDurationSeconds;
        countedReviews++;
      } else if (r.updatedAt && r.createdAt) {
        const diffSec = (new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime()) / 1000;
        if (diffSec > 0 && diffSec < 86400) {
          totalReviewSeconds += diffSec;
          countedReviews++;
        }
      }
    }
    const avgReviewTimeSeconds = countedReviews > 0 ? Math.round(totalReviewSeconds / countedReviews) : 0;

    res.json({
      success: true,
      data: {
        sessionId: id,
        sessionCode: session.sessionCode,
        totalStudents: records.length,
        submitted: records.filter((r) => r.imagePath !== null || r.status !== 'PENDING').length,
        submittedCount: records.filter((r) => r.imagePath !== null || r.status !== 'PENDING').length,
        pending: records.filter((r) => r.status === 'PENDING').length,
        pendingCount: records.filter((r) => r.status === 'PENDING').length,
        verified: records.filter((r) => r.status === 'VERIFIED').length,
        verifiedCount: records.filter((r) => r.status === 'VERIFIED').length,
        manualReview: records.filter((r) => r.status === 'MANUAL_REVIEW').length,
        manualReviewCount: records.filter((r) => r.status === 'MANUAL_REVIEW').length,
        rejected: records.filter((r) => r.status === 'REJECTED').length,
        rejectedCount: records.filter((r) => r.status === 'REJECTED').length,
        avgReviewTimeSeconds,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getEvaluationMetrics(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty access required');
    }

    const report = EvaluationService.generateBenchmarkReport();
    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateSessionStatus(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty access required');
    }

    const { id } = req.params;
    const { status } = req.body;
    if (!status || !['DRAFT', 'ACTIVE', 'ENDED', 'LOCKED'].includes(status)) {
      throw new ValidationError('Valid session status (DRAFT, ACTIVE, ENDED, LOCKED) is required');
    }

    const updated = await defaultRecordService.updateSessionStatus(req.user.id, id, status);
    res.json({
      success: true,
      message: `Session status updated to ${status}`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

export async function generateSessionRecords(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty access required');
    }

    const { id } = req.params;
    const { studentIds } = req.body || {};
    let targetStudentIds: string[] = studentIds;
    if (!Array.isArray(targetStudentIds) || targetStudentIds.length === 0) {
      const allStudents = await db.getAllStudents();
      targetStudentIds = allStudents.map((s) => s.id);
    }

    const records = await defaultRecordService.generateRecordsForSession(req.user.id, id, targetStudentIds);
    res.json({
      success: true,
      message: `Generated ${records.length} student records for session`,
      data: records,
    });
  } catch (error) {
    next(error);
  }
}

export async function awardFacultyMark(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty access required');
    }

    const { id } = req.params;
    const { mark } = req.body;
    if (mark === undefined || mark === null || isNaN(Number(mark))) {
      throw new ValidationError('A valid numerical mark is required');
    }

    const updated = await defaultRecordService.awardFacultyMark(req.user.id, id, Number(mark));
    res.json({
      success: true,
      message: `Awarded mark ${mark}/${updated.maxMark} to record ${updated.uniqueRecordCode}`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

export async function exportSessionExcel(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty access required');
    }

    const { id } = req.params;
    const session = await db.getLabSessionById(id);
    if (!session) {
      throw new NotFoundError('Lab session not found');
    }

    const buffer = await defaultRecordService.exportSessionMarksExcel(id);
    const dateStr = session.sessionDate instanceof Date
      ? session.sessionDate.toISOString().split('T')[0]
      : '2026-10-01';
    const filename = `EEE_Lab_Marks_${dateStr}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
}

export async function getRecordSheet(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const sheet = await defaultRecordService.exportRecordSheet(id);
    if (req.query.format === 'html') {
      res.setHeader('Content-Type', 'text/html');
      res.send(sheet.html);
    } else {
      res.json({
        success: true,
        data: sheet,
      });
    }
  } catch (error) {
    next(error);
  }
}

export async function downloadSessionSheetsZip(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty access required');
    }

    const { id } = req.params;
    const session = await db.getLabSessionById(id);
    if (!session) {
      throw new NotFoundError('Lab session not found');
    }

    const zipBuffer = await defaultRecordService.exportSessionSheetsZip(id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="EEE_Sheets_${session.sessionCode}.zip"`);
    res.send(zipBuffer);
  } catch (error) {
    next(error);
  }
}

export async function getFacultyStudents(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty access required');
    }

    const className = req.query.className as string | undefined;
    const section = req.query.section as string | undefined;
    const students = await db.getAllStudents(className, section);
    res.json({
      success: true,
      data: students.map(({ passwordHash, ...s }) => s),
    });
  } catch (error) {
    next(error);
  }
}

export async function bulkApproveRecords(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty access required');
    }

    const { recordIds } = req.body;
    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      throw new ValidationError('recordIds array must be provided for bulk approval');
    }

    const result = await defaultRecordService.bulkApproveRecords(req.user.id, recordIds);

    res.json({
      success: true,
      message: `Successfully verified and approved ${result.approved.length} records in batch`,
      data: {
        approvedCount: result.approved.length,
        skippedCount: result.skipped.length,
        approved: result.approved,
        skipped: result.skipped,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function reopenRecord(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty access required');
    }

    const { id } = req.params;
    const { reason } = req.body || {};

    const updated = await defaultRecordService.reopenRecord(req.user.id, id, reason);

    res.json({
      success: true,
      message: `Record ${updated.uniqueRecordCode} reopened for student resubmission`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

// ─── Phase 9 Real-World EEE Redesign: Lab Structure & Experiment Master ───────

export async function getFacultyExperiments(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const experiments = await db.getExperiments();
    res.json({
      success: true,
      data: experiments,
    });
  } catch (error) {
    next(error);
  }
}

export async function createExperiment(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty access required');
    }

    const { experimentNumber, title, subject, description, endBoxPageNumber, maxMark, department, academicYear, semester, section } = req.body;

    if (!experimentNumber || !title || endBoxPageNumber === undefined || endBoxPageNumber === null) {
      throw new ValidationError('experimentNumber, title, and endBoxPageNumber are required fields');
    }

    const exp = await db.createExperiment({
      experimentNumber: Number(experimentNumber),
      title: String(title).trim(),
      subject: subject ? String(subject).trim() : 'Electrical Machines Laboratory',
      description: description ? String(description).trim() : '',
      endBoxPageNumber: Number(endBoxPageNumber),
      maxMark: maxMark !== undefined ? Number(maxMark) : 10.0,
      department: department ? String(department).trim() : 'Electrical and Electronics Engineering',
      academicYear: academicYear ? String(academicYear).trim() : '2026-2027',
      semester: semester ? String(semester).trim() : 'Semester VI',
      section: section ? String(section).trim() : 'A',
      isActive: true,
    });

    await auditService.log({
      actorType: 'FACULTY',
      actorId: req.user.id,
      action: 'FACULTY_EXPERIMENT_CREATED',
      entityType: 'Experiment',
      entityId: exp.id,
      metadata: { experimentNumber: exp.experimentNumber, title: exp.title, endBoxPageNumber: exp.endBoxPageNumber },
    });

    res.status(201).json({
      success: true,
      message: `Experiment ${exp.experimentNumber} created successfully`,
      data: exp,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateExperiment(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty access required');
    }

    const { id } = req.params;
    const updated = await db.updateExperiment(id, req.body);

    await auditService.log({
      actorType: 'FACULTY',
      actorId: req.user.id,
      action: 'FACULTY_EXPERIMENT_UPDATED',
      entityType: 'Experiment',
      entityId: id,
      metadata: req.body,
    });

    res.json({
      success: true,
      message: `Experiment ${updated.experimentNumber} updated successfully`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

export async function importStudentsExcel(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'FACULTY') {
      throw new UnauthorizedError('Faculty access required');
    }

    if (!req.file || !req.file.buffer) {
      throw new ValidationError('Excel file (.xlsx) is required for student import');
    }

    const result = await defaultExcelExportService.parseStudentExcel(req.file.buffer);

    await auditService.log({
      actorType: 'FACULTY',
      actorId: req.user.id,
      action: 'FACULTY_STUDENT_ROSTER_IMPORTED',
      entityType: 'StudentRoster',
      entityId: req.user.id,
      metadata: {
        totalRows: result.totalRows,
        imported: result.imported,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errorCount: result.errors.length,
      },
    });

    res.json({
      success: true,
      message: `Roster import complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function downloadStudentTemplateExcel(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const buffer = await defaultExcelExportService.generateStudentTemplateWorkbook();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="SecureLab_Student_Roster_Template.xlsx"');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
}

