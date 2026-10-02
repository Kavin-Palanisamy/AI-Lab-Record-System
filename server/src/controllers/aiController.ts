import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { defaultRecordService } from '../services/recordService.js';
import { ValidationError, UnauthorizedError } from '../utils/errors.js';

export async function analyzeRecord(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const file = req.file;
    if (!file) {
      throw new ValidationError('An image file is required for AI document analysis');
    }

    const result = await defaultRecordService.analyzeRecordImage(
      file.buffer,
      file.originalname,
      file.mimetype
    );

    res.json({
      success: true,
      message: 'Document analyzed successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
