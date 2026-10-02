import { Request } from 'express';

export type UserRole = 'STUDENT' | 'FACULTY';

export interface AuthUser {
  id: string;
  role: UserRole;
  email: string;
  name: string;
  registerNumber?: string;
  department?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  code?: string;
  data?: T;
  error?: string;
}

export type RecordStatusType = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'MANUAL_REVIEW';

export interface DecodedQR {
  raw: string;
  token: string;
  isValid: boolean;
}
