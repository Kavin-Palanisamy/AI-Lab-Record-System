import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { db } from '../prisma/db.js';
import { defaultRecordService } from '../services/recordService.js';
import { defaultQrService } from '../services/qrService.js';
import { NotFoundError, OwnershipMismatchError, UnauthorizedError } from '../utils/errors.js';

export async function getStudentProfile(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'STUDENT') {
      throw new UnauthorizedError('Student authentication required');
    }

    const student = await db.findStudentById(req.user.id);
    if (!student) {
      throw new NotFoundError('Student profile not found');
    }

    const { passwordHash, ...profile } = student;
    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    next(error);
  }
}

export async function getExperiments(
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

export async function getStudentRecords(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    // Always use authenticated user's ID
    const records = await db.getStudentRecords(req.user.id);
    res.json({
      success: true,
      data: records,
    });
  } catch (error) {
    next(error);
  }
}

export async function getRecordQrDetails(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const { recordId } = req.params;
    const record = await db.getRecordById(recordId);
    if (!record) {
      throw new NotFoundError('Record not found');
    }

    // Security check: Only the record owner or faculty can view QR sheet
    if (record.studentId !== req.user.id && req.user.role !== 'FACULTY') {
      throw new OwnershipMismatchError('Cannot access QR details of another student');
    }

    const qrDataUrl = await defaultQrService.generateRecordQrDataUrl(record.qrToken);

    res.json({
      success: true,
      data: {
        record,
        qrPayload: `LAB_RECORD:${record.qrToken}`,
        qrDataUrl,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function submitStudentRecord(
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

    // Optional direct qrToken or challengeId passed in request body or headers
    const bodyQrToken = req.body?.qrToken;
    const challengeId = req.body?.challengeId || (req.headers['x-capture-challenge'] as string) || undefined;
    const file = req.file;

    const result = await defaultRecordService.submitLabRecord({
      authenticatedStudentId,
      recordId,
      qrToken: bodyQrToken,
      challengeId,
      imageBuffer: file?.buffer,
      originalFilename: file?.originalname,
      mimeType: file?.mimetype,
    });

    res.json({
      success: true,
      message: 'Lab record submitted successfully and queued for verification',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function createCaptureChallenge(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'STUDENT') {
      throw new UnauthorizedError('Student authentication required');
    }

    const { recordId } = req.params;
    const record = await db.getRecordById(recordId);
    if (!record) {
      throw new NotFoundError('Record not found');
    }

    if (record.studentId !== req.user.id) {
      throw new OwnershipMismatchError('Cannot request challenge for a record belonging to another student');
    }

    const challenge = db.createCaptureChallenge(recordId, req.user.id, 300);

    res.json({
      success: true,
      data: {
        challengeId: challenge.challengeId,
        recordId: challenge.recordId,
        nonce: challenge.nonce,
        expiresAt: challenge.expiresAt,
        expiresInSeconds: 300,
      },
    });
  } catch (error) {
    next(error);
  }
}

