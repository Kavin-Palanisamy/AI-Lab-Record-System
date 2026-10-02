import QRCode from 'qrcode';
import jsQR from 'jsqr';
import Jimp from 'jimp';
import { formatQrPayload, parseQrPayload } from '../utils/idGenerator.js';

export class QrService {
  /**
   * Generate a base64 PNG data URL for a record token
   */
  async generateRecordQrDataUrl(token: string): Promise<string> {
    const payload = formatQrPayload(token);
    return QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'H',
      width: 300,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
  }

  /**
   * Generate a PNG buffer for a record token
   */
  async generateRecordQrBuffer(token: string): Promise<Buffer> {
    const payload = formatQrPayload(token);
    return QRCode.toBuffer(payload, {
      errorCorrectionLevel: 'H',
      width: 300,
      margin: 2,
    });
  }

  /**
   * Decode QR code from an image buffer using Jimp and jsQR
   */
  async decodeQrFromBuffer(buffer: Buffer): Promise<{ rawPayload: string | null; token: string | null }> {
    try {
      const image = await Jimp.read(buffer);
      const width = image.bitmap.width;
      const height = image.bitmap.height;
      const data = new Uint8ClampedArray(image.bitmap.data);

      const code = jsQR(data, width, height, {
        inversionAttempts: 'attemptBoth',
      });

      if (!code || !code.data) {
        return { rawPayload: null, token: null };
      }

      const rawPayload = code.data;
      const token = parseQrPayload(rawPayload) || rawPayload;

      return { rawPayload, token };
    } catch (error) {
      console.error('Error decoding QR code from image buffer:', error);
      return { rawPayload: null, token: null };
    }
  }
}

export const defaultQrService = new QrService();
