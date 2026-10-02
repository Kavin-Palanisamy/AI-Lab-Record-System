import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { ZodError } from 'zod';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Handle custom AppError instances
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const formatted = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    res.status(422).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'Request payload validation failed',
      details: formatted,
    });
    return;
  }

  // Handle Multer upload errors and file filter errors
  if (err.name === 'MulterError' || err.message?.includes('Only image files')) {
    res.status(422).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: err.message || 'File upload error',
    });
    return;
  }

  // Handle JSON Web Token errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Invalid or expired authentication token',
    });
    return;
  }

  // Default internal server error (hide details in production)
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected internal server error occurred',
  });
}
