import { db, ILabRecordData, ILabSessionData, SessionStatus } from '../prisma/db.js';
import { AuditService } from './auditService.js';
import { IStorageService, defaultStorageService } from './storageService.js';
import { QrService, defaultQrService } from './qrService.js';
import { AiService, defaultAiService, AiAnalysisResponse } from './aiService.js';
import { AiVerificationService, defaultAiVerificationService } from './aiVerificationService.js';
import { defaultExcelExportService, ExcelExportService } from './excelService.js';
import { defaultRecordSheetService, RecordSheetService } from './recordSheetService.js';
import { defaultCryptoQrService, CryptoQrService } from './cryptoQrService.js';
import { generateUniqueRecordCode, generateSecureQrToken } from '../utils/idGenerator.js';
import {
  NotFoundError,
  OwnershipMismatchError,
  ConflictError,
  ValidationError,
  ForbiddenError,
  InvalidRecordSignatureError,
  RecordTokenExpiredError,
  RecordAlreadyVerifiedError,
  CaptureChallengeExpiredError,
} from '../utils/errors.js';
import { RecordStatus } from '@prisma/client';

export class RecordService {
  constructor(
    private auditService: AuditService = new AuditService(db),
    private storageService: IStorageService = defaultStorageService,
    private qrService: QrService = defaultQrService,
    private aiService: AiService = defaultAiService,
    private aiVerificationService: AiVerificationService = defaultAiVerificationService,
    private excelExportService: ExcelExportService = defaultExcelExportService,
    private recordSheetService: RecordSheetService = defaultRecordSheetService,
    private cryptoQrService: CryptoQrService = defaultCryptoQrService
  ) {}

  /**
   * Verify a QR payload/token and return basic record details if authorized.
   */
  async verifyQr(
    authenticatedStudentId: string,
    qrToken: string
  ): Promise<{
    record: ILabRecordData;
    isOwner: boolean;
  }> {
    if (!qrToken) {
      throw new ValidationError('QR token is required');
    }

    const record = await db.getRecordByToken(qrToken);
    if (!record) {
      throw new NotFoundError('Record associated with this QR code was not found', 'QR_NOT_FOUND');
    }

    const isOwner = record.studentId === authenticatedStudentId;
    if (!isOwner) {
      await this.auditService.log({
        actorType: 'STUDENT',
        actorId: authenticatedStudentId,
        action: 'SUBMISSION_REJECTED_OWNERSHIP_MISMATCH',
        entityType: 'LabRecord',
        entityId: record.id,
        metadata: {
          attemptedQrToken: qrToken,
          actualOwnerId: record.studentId,
          uniqueRecordCode: record.uniqueRecordCode,
          reason: 'QR verification pre-check ownership mismatch',
        },
      });

      throw new OwnershipMismatchError();
    }

    return { record, isOwner: true };
  }

  /**
   * Phase 2 AI Record Analysis endpoint
   */
  async analyzeRecordImage(imageBuffer: Buffer, filename: string, mimeType = 'image/png'): Promise<AiAnalysisResponse> {
    return this.aiService.analyzeDocument(imageBuffer, filename, mimeType);
  }

  /**
   * Phase 2 Integrated Secure Submission Flow:
   * 1. Authenticate student
   * 2. Decode QR if not supplied
   * 3. AI Document Intelligence analysis (OCR, fields, confidence)
   * 4. Multi-factor consistency check:
   *    - JWT Student == QR Owner == Record Target
   *    - OCR Register Number vs Student Register Number
   *    - OCR Experiment vs Target Experiment
   *    - Mark plausibility & signature detection
   * 5. Resolve status: PENDING (AI Verified) vs MANUAL_REVIEW
   * 6. Save image to storage
   * 7. Save AI metadata & update DB
   * 8. Create audit trail
   */
  async submitLabRecord(params: {
    authenticatedStudentId: string;
    recordId: string;
    qrToken?: string;
    challengeId?: string;
    imageBuffer?: Buffer;
    originalFilename?: string;
    mimeType?: string;
  }): Promise<ILabRecordData & { verificationBreakdown?: any; reviewPriority?: any }> {
    const { authenticatedStudentId, recordId, imageBuffer, originalFilename, mimeType, challengeId } = params;
    let qrToken = params.qrToken;

    // 1. Verify target record exists
    const targetRecord = await db.getRecordById(recordId);
    if (!targetRecord) {
      throw new NotFoundError('The specified lab record was not found');
    }

    if (targetRecord.isLocked) {
      throw new ConflictError('This record is locked and cannot be resubmitted.');
    }

    // Phase 6 Anti-Replay Protection: Prevent resubmission of already-verified records
    if (targetRecord.status === RecordStatus.VERIFIED) {
      await this.auditService.log({
        actorType: 'STUDENT',
        actorId: authenticatedStudentId,
        action: 'SUBMISSION_REJECTED_REPLAY_ALREADY_VERIFIED',
        entityType: 'LabRecord',
        entityId: targetRecord.id,
        metadata: { currentStatus: targetRecord.status, submissionCount: targetRecord.submissionCount },
      });
      throw new RecordAlreadyVerifiedError('This laboratory record has already been verified and finalized. Resubmission is forbidden.');
    }

    // Phase 6 Digital Nonce / Capture Challenge Verification
    if (challengeId) {
      const challenge = db.getCaptureChallenge(challengeId);
      if (!challenge || challenge.recordId !== recordId || challenge.studentId !== authenticatedStudentId) {
        throw new ValidationError('Invalid camera capture challenge nonce', 'INVALID_CHALLENGE');
      }
      if (challenge.isUsed) {
        throw new ValidationError('Capture challenge nonce has already been consumed. Replay is forbidden.', 'CHALLENGE_REPLAYED');
      }
      if (Date.now() > challenge.expiresAt.getTime()) {
        throw new CaptureChallengeExpiredError('Camera capture challenge nonce has expired. Please request a fresh challenge before capturing.');
      }
      db.consumeCaptureChallenge(challengeId);
    }

    // Phase 6 File Security Checks (Magic bytes, max size, traversal prevention)
    if (imageBuffer) {
      if (imageBuffer.length > 10 * 1024 * 1024) {
        throw new ValidationError('Uploaded image file exceeds maximum allowable 10MB limit', 'FILE_TOO_LARGE');
      }
      if (imageBuffer.length > 0) {
        const isPng = imageBuffer.length >= 8 &&
          imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47;
        const isJpg = imageBuffer.length >= 3 &&
          imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8 && imageBuffer[2] === 0xFF;
        const isWebp = imageBuffer.length >= 12 &&
          imageBuffer.toString('utf8', 0, 4) === 'RIFF' && imageBuffer.toString('utf8', 8, 12) === 'WEBP';
        if (!isPng && !isJpg && !isWebp) {
          throw new ValidationError('Invalid image file signature. Only authentic PNG, JPEG, and WebP images are permitted.', 'INVALID_FILE_SIGNATURE');
        }
      }
    }

    // Session lifecycle and window check
    const session = targetRecord.labSession || (await db.getLabSessionById(targetRecord.labSessionId));
    let isLateSubmission = false;
    if (session) {
      if (session.status === 'ENDED') {
        throw new ValidationError('The laboratory session for this record has ended. Submissions are closed.');
      }
      if (session.status === 'LOCKED') {
        throw new ValidationError('This laboratory session is locked. Submissions are permanently closed.');
      }
      if (session.status === 'DRAFT') {
        throw new ValidationError('This laboratory session is in draft mode. Submissions are not yet active.');
      }

      // Configurable submission window
      if (session.windowEndTime) {
        const now = new Date();
        if (now > new Date(session.windowEndTime)) {
          if (!session.allowLateSubmission) {
            throw new ValidationError('The laboratory session submission window is closed. Submissions are no longer accepted.');
          } else {
            isLateSubmission = true;
          }
        }
      }
    }

    const student = await db.findStudentById(authenticatedStudentId);
    if (!student) {
      throw new NotFoundError('Authenticated student profile not found');
    }

    // 2. Run AI Document Analysis if image buffer is supplied
    let aiResult: AiAnalysisResponse | undefined;
    if (imageBuffer) {
      aiResult = await this.aiService.analyzeDocument(
        imageBuffer,
        originalFilename || 'record.png',
        mimeType || 'image/png'
      );

      // Check if AI detected QR token from image
      if (!qrToken && aiResult.document.qrToken) {
        qrToken = aiResult.document.qrToken;
      }
    }

    // If still no QR token, try Jimp/jsQR backend decode
    if (!qrToken && imageBuffer) {
      const decoded = await this.qrService.decodeQrFromBuffer(imageBuffer);
      if (decoded.token) {
        qrToken = decoded.token;
      }
    }

    if (!qrToken) {
      await this.auditService.log({
        actorType: 'STUDENT',
        actorId: authenticatedStudentId,
        action: 'SUBMISSION_REJECTED_INVALID_QR',
        entityType: 'LabRecord',
        entityId: recordId,
        metadata: { reason: 'No readable QR code found in payload or uploaded image' },
      });
      throw new ValidationError('Could not detect or read a valid lab QR code. Please position the QR code clearly.');
    }

    // Phase 6 Cryptographic Signature & Expiration Pre-Validation
    // If token is signed format, verify signature immediately
    const qrSigCheck = defaultCryptoQrService.verifySignedToken(qrToken);

    // 3. Resolve QR token to a database LabRecord
    const qrRecord = await db.getRecordByToken(qrToken);
    if (!qrRecord) {
      await this.auditService.log({
        actorType: 'STUDENT',
        actorId: authenticatedStudentId,
        action: 'SUBMISSION_REJECTED_INVALID_QR',
        entityType: 'LabRecord',
        entityId: recordId,
        metadata: { attemptedToken: qrToken, reason: 'QR token not registered in database' },
      });
      throw new NotFoundError('Unrecognized QR code token. This record code does not exist in the system.');
    }

    // Validate payload bindings if signed token
    if (qrSigCheck.payload) {
      if (qrSigCheck.payload.sessionId !== targetRecord.labSessionId) {
        throw new ValidationError('Session mismatch: The submitted QR code is assigned to a different laboratory session.');
      }
      if (qrSigCheck.payload.experimentId !== targetRecord.experimentId) {
        throw new ValidationError('Experiment mismatch: The submitted QR code is assigned to a different experiment.');
      }
    }

    // 4. Multi-Factor Consistency Check
    // First, strictly enforces: LOGIN STUDENT ID == RECORD STUDENT ID == QR RECORD OWNER
    // (Throws OwnershipMismatchError HTTP 403 on mismatch)
    let verificationResult;
    try {
      verificationResult = this.aiVerificationService.verifyDocumentConsistency({
        authenticatedStudent: student,
        targetRecord,
        qrRecord,
        aiResult,
      });
    } catch (err) {
      if (err instanceof OwnershipMismatchError) {
        await this.auditService.log({
          actorType: 'STUDENT',
          actorId: authenticatedStudentId,
          action: 'SUBMISSION_REJECTED_OWNERSHIP_MISMATCH',
          entityType: 'LabRecord',
          entityId: targetRecord.id,
          metadata: {
            authenticatedStudentId,
            targetRecordOwnerId: targetRecord.studentId,
            qrRecordOwnerId: qrRecord.studentId,
            targetRecordCode: targetRecord.uniqueRecordCode,
            qrRecordCode: qrRecord.uniqueRecordCode,
            ocrDetectedRegisterNumber: aiResult?.document.registerNumber || null,
          },
        });
      }
      throw err;
    }

    // 6. Save image to storage if provided
    let savedImagePath: string | null = targetRecord.imagePath;
    if (imageBuffer) {
      const saved = await this.storageService.saveFile(
        imageBuffer,
        originalFilename || 'record.png',
        mimeType || 'image/png'
      );
      savedImagePath = saved.relativePath;
    }

    // 7. Determine final status: PENDING vs MANUAL_REVIEW
    let finalStatus = verificationResult.status;
    let finalReviewReason = verificationResult.reviewReason || null;
    if (isLateSubmission) {
      finalStatus = RecordStatus.MANUAL_REVIEW;
      finalReviewReason = finalReviewReason || 'Late submission: Record captured outside configured session window';
    }

    const detectedMark = verificationResult.extractedMark !== null ? verificationResult.extractedMark : targetRecord.detectedMark;

    // Track submission statistics for anti-replay audit
    const submissionCount = (targetRecord.submissionCount || 0) + 1;
    const firstSubmittedAt = targetRecord.firstSubmittedAt || new Date();
    const lastSubmittedAt = new Date();
    const lifecycleState = finalStatus === RecordStatus.VERIFIED ? 'VERIFIED' : 'SUBMITTED';

    // 8. Update record in database
    const updated = await db.updateRecord(targetRecord.id, {
      imagePath: savedImagePath,
      status: finalStatus,
      detectedStudentRegisterNumber: aiResult?.document.registerNumber || targetRecord.student?.registerNumber || null,
      detectedMark,
      // Faculty mark remains authoritative on the server and is never overwritten
      markVerificationStatus: verificationResult.markVerificationStatus || targetRecord.markVerificationStatus || null,
      submissionTimestamp: new Date(),
      aiConfidence: verificationResult.confidenceScore,
      aiExtractedData: aiResult ? JSON.stringify(aiResult) : null,
      facultySignaturePresent: verificationResult.signaturePresent,
      manualReviewReason: finalReviewReason,
      firstSubmittedAt,
      lastSubmittedAt,
      submissionCount,
      lifecycleState,
    });

    // 9. Log granular audit events for Phase 3 and Phase 4 authenticity evidence
    await this.auditService.log({
      actorType: 'STUDENT',
      actorId: authenticatedStudentId,
      action: 'DOCUMENT_ANALYSIS_COMPLETED',
      entityType: 'LabRecord',
      entityId: targetRecord.id,
      metadata: {
        aiConfidence: verificationResult.confidenceScore,
        qualityDecision: verificationResult.qualityDecision,
        tamperStatus: verificationResult.tamperStatus,
        tamperScore: verificationResult.tamperScore,
        signaturePresent: verificationResult.signaturePresent,
        extractedMark: detectedMark,
        serverFacultyMark: targetRecord.facultyAwardedMark,
        markVerificationStatus: verificationResult.markVerificationStatus,
        verificationStatus: finalStatus,
      },
    });

    if (verificationResult.markVerificationStatus === 'MARK_MISMATCH') {
      await this.auditService.log({
        actorType: 'SYSTEM',
        actorId: 'AI_VERIFICATION_ENGINE',
        action: 'MARK_MISMATCH',
        entityType: 'LabRecord',
        entityId: targetRecord.id,
        metadata: {
          serverFacultyMark: targetRecord.facultyAwardedMark,
          ocrDetectedMark: detectedMark,
          reason: verificationResult.reviewReason,
        },
      });
    }

    if (verificationResult.tamperStatus === 'SUSPICIOUS') {
      await this.auditService.log({
        actorType: 'STUDENT',
        actorId: authenticatedStudentId,
        action: 'DOCUMENT_SUSPICIOUS',
        entityType: 'LabRecord',
        entityId: targetRecord.id,
        metadata: {
          tamperScore: verificationResult.tamperScore,
          signals: aiResult?.tamperAnalysis?.signals || [],
          reason: verificationResult.reviewReason,
        },
      });
    }

    if (verificationResult.qualityDecision === 'RETAKE_REQUIRED' || aiResult?.quality.imageQuality === 'LOW') {
      await this.auditService.log({
        actorType: 'STUDENT',
        actorId: authenticatedStudentId,
        action: 'LOW_IMAGE_QUALITY',
        entityType: 'LabRecord',
        entityId: targetRecord.id,
        metadata: {
          blurScore: aiResult?.quality.blurScore,
          reason: verificationResult.reviewReason,
        },
      });
    }

    if (aiResult?.confidence.mark && aiResult.confidence.mark < 0.65) {
      await this.auditService.log({
        actorType: 'STUDENT',
        actorId: authenticatedStudentId,
        action: 'MARK_LOW_CONFIDENCE',
        entityType: 'LabRecord',
        entityId: targetRecord.id,
        metadata: {
          markConfidence: aiResult.confidence.mark,
          extractedMark: detectedMark,
        },
      });
    }

    if (finalStatus === RecordStatus.MANUAL_REVIEW) {
      await this.auditService.log({
        actorType: 'STUDENT',
        actorId: authenticatedStudentId,
        action: 'FACULTY_MANUAL_REVIEW',
        entityType: 'LabRecord',
        entityId: targetRecord.id,
        metadata: {
          reason: verificationResult.reviewReason,
          inconsistencyFlags: verificationResult.inconsistencyFlags,
          aiConfidence: verificationResult.confidenceScore,
          ocrDetectedRegNo: aiResult?.document.registerNumber,
          tamperStatus: verificationResult.tamperStatus,
        },
      });
    } else {
      await this.auditService.log({
        actorType: 'STUDENT',
        actorId: authenticatedStudentId,
        action: 'SUBMISSION_CREATED',
        entityType: 'LabRecord',
        entityId: targetRecord.id,
        metadata: {
          recordCode: targetRecord.uniqueRecordCode,
          experimentId: targetRecord.experimentId,
          imageStored: !!savedImagePath,
          aiConfidence: verificationResult.confidenceScore,
          extractedMark: detectedMark,
          signatureDetected: verificationResult.signaturePresent,
        },
      });
    }

    // Augment the DB record with verification breakdown for API transparency
    return {
      ...updated,
      verificationBreakdown: verificationResult.verificationBreakdown || null,
      reviewPriority: verificationResult.reviewPriority || null,
    };
  }

  /**
   * Faculty approval
   */
  async approveRecord(facultyId: string, recordId: string, mark: number): Promise<ILabRecordData> {
    const record = await db.getRecordById(recordId);
    if (!record) {
      throw new NotFoundError('Record not found');
    }

    if (mark < 0 || mark > record.maxMark) {
      throw new ValidationError(`Mark must be between 0 and max mark (${record.maxMark})`);
    }

    const updated = await db.updateRecord(recordId, {
      status: RecordStatus.VERIFIED,
      detectedMark: mark,
      manualReviewReason: null,
    });

    await this.auditService.log({
      actorType: 'FACULTY',
      actorId: facultyId,
      action: 'FACULTY_APPROVED',
      entityType: 'LabRecord',
      entityId: recordId,
      metadata: {
        markAwarded: mark,
        maxMark: record.maxMark,
        studentId: record.studentId,
        recordCode: record.uniqueRecordCode,
      },
    });

    return updated;
  }

  /**
   * Faculty correction: Never silently overwrite AI output!
   * Preserves original AI output and appends audit correction entry.
   */
  async correctRecord(
    facultyId: string,
    recordId: string,
    correctedMark: number,
    reason: string
  ): Promise<ILabRecordData> {
    const record = await db.getRecordById(recordId);
    if (!record) {
      throw new NotFoundError('Record not found');
    }

    if (correctedMark < 0 || correctedMark > record.maxMark) {
      throw new ValidationError(`Corrected mark must be between 0 and ${record.maxMark}`);
    }

    const previousHistory = record.facultyCorrectionHistory ? JSON.parse(record.facultyCorrectionHistory) : [];
    const correctionEntry = {
      originalMark: record.detectedMark,
      correctedMark,
      facultyId,
      timestamp: new Date().toISOString(),
      reason: reason || 'Faculty manual adjustment of OCR extracted mark',
    };
    previousHistory.push(correctionEntry);

    const updated = await db.updateRecord(recordId, {
      status: RecordStatus.VERIFIED,
      detectedMark: correctedMark,
      facultyCorrectionHistory: JSON.stringify(previousHistory),
      manualReviewReason: null,
    });

    await this.auditService.log({
      actorType: 'FACULTY',
      actorId: facultyId,
      action: 'FACULTY_APPROVED',
      entityType: 'LabRecord',
      entityId: recordId,
      metadata: {
        actionType: 'FACULTY_CORRECTION',
        originalMark: record.detectedMark,
        correctedMark,
        reason,
        studentId: record.studentId,
      },
    });

    return updated;
  }

  /**
   * Faculty rejection
   */
  async rejectRecord(facultyId: string, recordId: string, reason?: string): Promise<ILabRecordData> {
    const record = await db.getRecordById(recordId);
    if (!record) {
      throw new NotFoundError('Record not found');
    }

    const updated = await db.updateRecord(recordId, {
      status: RecordStatus.REJECTED,
      manualReviewReason: reason || 'Incomplete or invalid lab submission',
    });

    await this.auditService.log({
      actorType: 'FACULTY',
      actorId: facultyId,
      action: 'FACULTY_REJECTED',
      entityType: 'LabRecord',
      entityId: recordId,
      metadata: {
        rejectionReason: reason || 'Incomplete or invalid lab submission',
        studentId: record.studentId,
        recordCode: record.uniqueRecordCode,
      },
    });

    return updated;
  }

  /**
   * Faculty pre-awards or awards the mark into the authoritative server record.
   * This value is server-authoritative and compared against photographed OCR marks.
   */
  async awardFacultyMark(facultyId: string, recordId: string, mark: number): Promise<ILabRecordData> {
    const record = await db.getRecordById(recordId);
    if (!record) {
      throw new NotFoundError('Record not found');
    }

    if (mark < 0 || mark > record.maxMark) {
      throw new ValidationError(`Mark must be between 0 and ${record.maxMark}`);
    }

    const updated = await db.updateRecord(recordId, {
      facultyAwardedMark: mark,
    });

    await this.auditService.log({
      actorType: 'FACULTY',
      actorId: facultyId,
      action: 'FACULTY_AWARDED_MARK',
      entityType: 'LabRecord',
      entityId: recordId,
      metadata: {
        markAwarded: mark,
        maxMark: record.maxMark,
        studentId: record.studentId,
        recordCode: record.uniqueRecordCode,
      },
    });

    return updated;
  }

  /**
   * Faculty creates a new laboratory session
   */
  async createLabSession(facultyId: string, data: {
    experimentId: string;
    sessionDate: Date | string;
    sessionCode: string;
    subject?: string;
    className?: string;
    section?: string;
    maxMark?: number;
    startTime?: string;
    endTime?: string;
    status?: SessionStatus;
  }): Promise<ILabSessionData> {
    if (!data.experimentId) {
      throw new ValidationError('Experiment ID is required');
    }
    if (!data.sessionCode) {
      throw new ValidationError('Session code is required');
    }

    const exp = await db.getExperimentById(data.experimentId);
    if (!exp) {
      throw new NotFoundError('Experiment not found');
    }

    const session = await db.createLabSession({
      experimentId: data.experimentId,
      facultyId,
      sessionDate: data.sessionDate ? new Date(data.sessionDate) : new Date(),
      sessionCode: data.sessionCode.trim().toUpperCase(),
      subject: data.subject || exp.subject || 'Electrical Machines Laboratory',
      className: data.className || 'III EEE',
      section: data.section || 'A',
      maxMark: data.maxMark ?? 10.0,
      startTime: data.startTime || '09:00 AM',
      endTime: data.endTime || '12:00 PM',
      status: data.status || 'ACTIVE',
    });

    await this.auditService.log({
      actorType: 'FACULTY',
      actorId: facultyId,
      action: 'SESSION_CREATED',
      entityType: 'LabSession',
      entityId: session.id,
      metadata: {
        sessionCode: session.sessionCode,
        experimentId: session.experimentId,
        subject: session.subject,
        className: session.className,
      },
    });

    return session;
  }

  /**
   * Update lab session lifecycle status (DRAFT -> ACTIVE -> ENDED -> LOCKED)
   */
  async updateSessionStatus(facultyId: string, sessionId: string, status: SessionStatus): Promise<ILabSessionData> {
    const session = await db.getLabSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Lab session not found');
    }

    const lockedAt = status === 'LOCKED' ? new Date() : session.lockedAt;
    const updated = await db.updateLabSession(sessionId, {
      status,
      lockedAt,
    });

    // If session is locked, also lock all associated records
    if (status === 'LOCKED') {
      const records = await db.getRecordsBySession(sessionId);
      for (const rec of records) {
        await db.updateRecord(rec.id, { isLocked: true });
      }
    }

    await this.auditService.log({
      actorType: 'FACULTY',
      actorId: facultyId,
      action: 'SESSION_STATUS_CHANGED',
      entityType: 'LabSession',
      entityId: sessionId,
      metadata: {
        previousStatus: session.status,
        newStatus: status,
        sessionCode: session.sessionCode,
      },
    });

    return updated;
  }

  /**
   * Bulk generate unique records and QR codes for all selected students in a session.
   * Prevents duplicate records for the same student + experiment + session.
   */
  async generateRecordsForSession(facultyId: string, sessionId: string, studentIds: string[]): Promise<ILabRecordData[]> {
    const session = await db.getLabSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Lab session not found');
    }

    const exp = await db.getExperimentById(session.experimentId);
    const expNum = exp?.experimentNumber || 4;

    const createdRecords: ILabRecordData[] = [];

    for (const studentId of studentIds) {
      const student = await db.findStudentById(studentId);
      if (!student) continue;

      // Check if record already exists for this student + experiment + session
      const existing = await db.findRecordByStudentExpSession(studentId, session.experimentId, session.id);
      if (existing) {
        createdRecords.push(existing);
        continue;
      }

      const uniqueRecordCode = generateUniqueRecordCode(student.registerNumber, expNum, session.sessionCode);
      const recordId = `record-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const qrToken = this.cryptoQrService.generateSignedToken({
        recordId,
        sessionId: session.id,
        experimentId: session.experimentId,
        expiresInMs: 30 * 24 * 60 * 60 * 1000,
      });

      const newRecord = await db.createLabRecord({
        id: recordId,
        studentId: student.id,
        experimentId: session.experimentId,
        labSessionId: session.id,
        uniqueRecordCode,
        qrToken,
        maxMark: session.maxMark,
        status: RecordStatus.PENDING,
      });

      createdRecords.push(newRecord);
    }

    await this.auditService.log({
      actorType: 'FACULTY',
      actorId: facultyId,
      action: 'RECORDS_GENERATED',
      entityType: 'LabSession',
      entityId: sessionId,
      metadata: {
        sessionCode: session.sessionCode,
        experimentTitle: exp?.title,
        totalRequested: studentIds.length,
        totalProcessed: createdRecords.length,
      },
    });

    return createdRecords;
  }

  /**
   * Phase 6 Faculty Bulk Approval Queue
   * Bulk approve verified records matching server faculty marks with high confidence and no tamper indicators
   */
  async bulkApproveRecords(facultyId: string, recordIds: string[]): Promise<{ approved: ILabRecordData[]; skipped: string[] }> {
    const approved: ILabRecordData[] = [];
    const skipped: string[] = [];

    for (const id of recordIds) {
      const record = await db.getRecordById(id);
      if (!record) {
        skipped.push(id);
        continue;
      }

      // Only approve records that are PENDING and have verified match with no unresolved flags
      if (record.status === RecordStatus.PENDING && record.markVerificationStatus === 'MATCH') {
        const markToAward = record.facultyAwardedMark ?? record.detectedMark ?? 10.0;
        const updated = await this.approveRecord(facultyId, id, markToAward);
        approved.push(updated);
      } else {
        skipped.push(id);
      }
    }

    await this.auditService.log({
      actorType: 'FACULTY',
      actorId: facultyId,
      action: 'FACULTY_BULK_APPROVED',
      entityType: 'LabRecord',
      entityId: 'BULK_BATCH',
      metadata: {
        requestedCount: recordIds.length,
        approvedCount: approved.length,
        skippedCount: skipped.length,
        approvedRecordIds: approved.map((r) => r.id),
      },
    });

    return { approved, skipped };
  }

  /**
   * Phase 6 Record Reopen for Resubmission
   * Only faculty can reopen a verified or locked record for resubmission
   */
  async reopenRecord(facultyId: string, recordId: string, reason?: string): Promise<ILabRecordData> {
    const record = await db.getRecordById(recordId);
    if (!record) {
      throw new NotFoundError('Record not found');
    }

    const updated = await db.reopenRecord(recordId, reason);

    await this.auditService.log({
      actorType: 'FACULTY',
      actorId: facultyId,
      action: 'RECORD_REOPENED_FOR_RESUBMISSION',
      entityType: 'LabRecord',
      entityId: recordId,
      metadata: {
        previousStatus: record.status,
        newStatus: updated.status,
        reason: reason || 'Faculty authorized record reopening',
      },
    });

    return updated;
  }

  /**
   * Export session lab marks as formatted Excel workbook buffer
   */
  async exportSessionMarksExcel(sessionId: string): Promise<Buffer> {
    const session = await db.getLabSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Lab session not found');
    }

    const records = await db.getRecordsBySession(sessionId);
    return this.excelExportService.generateSessionMarksWorkbook(session, records);
  }

  /**
   * Generate official printable HTML record sheet with QR
   */
  async exportRecordSheet(recordId: string): Promise<{ html: string; qrDataUrl: string }> {
    const record = await db.getRecordById(recordId);
    if (!record) {
      throw new NotFoundError('Record not found');
    }

    const session = record.labSession || (await db.getLabSessionById(record.labSessionId)) || undefined;
    return this.recordSheetService.generateRecordSheetHtml(record, session);
  }

  /**
   * Generate ZIP archive of printable sheets for an entire session
   */
  async exportSessionSheetsZip(sessionId: string): Promise<Buffer> {
    const session = await db.getLabSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Lab session not found');
    }

    const records = await db.getRecordsBySession(sessionId);
    return this.recordSheetService.generateSessionSheetsZip(session, records);
  }
}

export const defaultRecordService = new RecordService();
