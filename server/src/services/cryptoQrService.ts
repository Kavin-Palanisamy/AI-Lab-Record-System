import crypto from 'crypto';
import { InvalidRecordSignatureError, RecordTokenExpiredError } from '../utils/errors.js';

export interface SignedQrPayload {
  recordId: string;
  sessionId: string;
  experimentId: string;
  issuedAt: number; // Unix timestamp in milliseconds
  expiresAt: number; // Unix timestamp in milliseconds
  version: number;
}

export class CryptoQrService {
  private secret: string;

  constructor(secret?: string) {
    this.secret = secret || process.env.RECORD_SIGNING_SECRET || 'secure-lab-hmac-sha256-production-secret-2026';
  }

  /**
   * Check if a token string adheres to the signed token format: v1.<payload_b64>.<sig_b64>
   */
  isSignedToken(token: string): boolean {
    if (!token || typeof token !== 'string') return false;
    const parts = token.split('.');
    return parts.length === 3 && parts[0] === 'v1';
  }

  /**
   * Create a cryptographically signed record token using HMAC-SHA256
   */
  generateSignedToken(params: {
    recordId: string;
    sessionId: string;
    experimentId: string;
    expiresInMs?: number;
  }): string {
    const issuedAt = Date.now();
    const expiresInMs = params.expiresInMs ?? (7 * 24 * 60 * 60 * 1000); // 7 days default
    const expiresAt = issuedAt + expiresInMs;

    const payload: SignedQrPayload = {
      recordId: params.recordId,
      sessionId: params.sessionId,
      experimentId: params.experimentId,
      issuedAt,
      expiresAt,
      version: 1,
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', this.secret).update(payloadB64).digest('base64url');

    return `v1.${payloadB64}.${signature}`;
  }

  /**
   * Verify and decode a signed token.
   * Throws InvalidRecordSignatureError (HTTP 403) if signature is tampered.
   * Throws RecordTokenExpiredError (HTTP 422) if token is expired.
   */
  verifySignedToken(token: string): { isValid: boolean; payload?: SignedQrPayload; isLegacy?: boolean } {
    if (!token || typeof token !== 'string') {
      throw new InvalidRecordSignatureError('Missing or malformed record token');
    }

    // Check if it's in the signed token format
    if (!this.isSignedToken(token)) {
      // Legacy token or plain hex
      return { isValid: true, isLegacy: true };
    }

    const parts = token.split('.');
    const version = parts[0];
    const payloadB64 = parts[1];
    const signature = parts[2];

    if (version !== 'v1' || !payloadB64 || !signature) {
      throw new InvalidRecordSignatureError('Malformed signed QR token format');
    }

    // Recalculate signature
    const expectedSig = crypto.createHmac('sha256', this.secret).update(payloadB64).digest('base64url');

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSig);

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw new InvalidRecordSignatureError('Cryptographic QR signature mismatch: Token has been forged or modified.');
    }

    // Decode and validate payload
    let payload: SignedQrPayload;
    try {
      const jsonStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
      payload = JSON.parse(jsonStr);
    } catch {
      throw new InvalidRecordSignatureError('Invalid payload encoding in signed QR token');
    }

    if (!payload.recordId || !payload.sessionId || !payload.experimentId) {
      throw new InvalidRecordSignatureError('Signed QR token is missing mandatory metadata fields');
    }

    // Check expiration
    if (Date.now() > payload.expiresAt) {
      throw new RecordTokenExpiredError(`Signed record token expired on ${new Date(payload.expiresAt).toISOString()}`);
    }

    return { isValid: true, payload, isLegacy: false };
  }

  /**
   * Utility for testing attack scenarios: modify payload while keeping original signature
   */
  tamperPayload(validToken: string, modifier: (p: SignedQrPayload) => void): string {
    const parts = validToken.split('.');
    const jsonStr = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload: SignedQrPayload = JSON.parse(jsonStr);
    modifier(payload);
    const newPayloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `v1.${newPayloadB64}.${parts[2]}`;
  }

  /**
   * Utility for testing attack scenarios: modify signature
   */
  tamperSignature(validToken: string): string {
    const parts = validToken.split('.');
    const corruptedSig = parts[2].substring(0, parts[2].length - 4) + 'XXXX';
    return `v1.${parts[1]}.${corruptedSig}`;
  }

  /**
   * Utility for testing attack scenarios: create expired signed token
   */
  generateExpiredToken(params: { recordId: string; sessionId: string; experimentId: string }): string {
    const issuedAt = Date.now() - (24 * 60 * 60 * 1000); // 1 day ago
    const expiresAt = Date.now() - (60 * 60 * 1000); // Expired 1 hour ago
    const payload: SignedQrPayload = {
      recordId: params.recordId,
      sessionId: params.sessionId,
      experimentId: params.experimentId,
      issuedAt,
      expiresAt,
      version: 1,
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', this.secret).update(payloadB64).digest('base64url');
    return `v1.${payloadB64}.${signature}`;
  }
}

export const defaultCryptoQrService = new CryptoQrService();
