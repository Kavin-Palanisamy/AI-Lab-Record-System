import crypto from 'crypto';

/**
 * Generate a unique, cryptographically secure record code.
 * Example: LAB-048-EXP03-SESSION12-A8F3C92B
 */
export function generateUniqueRecordCode(registerNumber: string, experimentNumber: number, sessionCode: string): string {
  const cleanReg = registerNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const expPadded = `EXP${String(experimentNumber).padStart(2, '0')}`;
  const cleanSession = sessionCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const secureRandom = crypto.randomBytes(4).toString('hex').toUpperCase();

  return `LAB-${cleanReg}-${expPadded}-${cleanSession}-${secureRandom}`;
}

/**
 * Generate a cryptographically secure token for the QR code payload.
 * High entropy 256-bit random string.
 */
export function generateSecureQrToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Format the standard QR payload
 */
export function formatQrPayload(token: string): string {
  return `LAB_RECORD:${token}`;
}

/**
 * Parse QR payload string and extract the secure token
 */
export function parseQrPayload(rawQr: string): string | null {
  if (!rawQr || typeof rawQr !== 'string') return null;
  const trimmed = rawQr.trim();
  if (trimmed.startsWith('LAB_RECORD:')) {
    return trimmed.substring('LAB_RECORD:'.length).trim();
  }
  return null;
}
