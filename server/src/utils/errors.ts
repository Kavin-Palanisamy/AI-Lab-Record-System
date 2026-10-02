export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', details?: any) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', code = 'AUTHENTICATION_REQUIRED') {
    super(message, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions to perform this action', code = 'INSUFFICIENT_PERMISSIONS') {
    super(message, 403, code);
  }
}

export class OwnershipMismatchError extends AppError {
  constructor(message = 'This laboratory record does not belong to the authenticated student.') {
    super(message, 403, 'RECORD_OWNERSHIP_MISMATCH');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Requested resource was not found', code = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource state conflict or duplicate submission', code = 'CONFLICT') {
    super(message, 409, code);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request payload', code = 'VALIDATION_ERROR', details?: any) {
    super(message, 422, code, details);
  }
}

export class InvalidRecordSignatureError extends AppError {
  constructor(message = 'Cryptographic QR signature verification failed. Document token is invalid or tampered.') {
    super(message, 403, 'INVALID_RECORD_SIGNATURE');
  }
}

export class RecordTokenExpiredError extends AppError {
  constructor(message = 'Cryptographically signed record token has expired. Please obtain an updated record sheet from faculty.') {
    super(message, 422, 'RECORD_TOKEN_EXPIRED');
  }
}

export class RecordAlreadyVerifiedError extends AppError {
  constructor(message = 'This laboratory record has already been verified and finalized. Resubmission is forbidden.') {
    super(message, 409, 'RECORD_ALREADY_VERIFIED');
  }
}

export class CaptureChallengeExpiredError extends AppError {
  constructor(message = 'Camera capture challenge nonce has expired. Please request a fresh challenge before capturing.') {
    super(message, 422, 'CHALLENGE_EXPIRED');
  }
}

