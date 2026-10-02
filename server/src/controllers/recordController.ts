import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { defaultRecordService } from '../services/recordService.js';
import { parseQrPayload } from '../utils/idGenerator.js';
import { ValidationError, UnauthorizedError } from '../utils/errors.js';

export async function verifyQr(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const { qrToken, qrPayload } = req.body;
    let token = qrToken;

    if (!token && qrPayload) {
      token = parseQrPayload(qrPayload) || qrPayload;
    }

    if (!token) {
      throw new ValidationError('A valid qrToken or qrPayload is required');
    }

    const result = await defaultRecordService.verifyQr(req.user.id, token);

    res.json({
      success: true,
      message: 'QR code verified successfully and ownership confirmed',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
