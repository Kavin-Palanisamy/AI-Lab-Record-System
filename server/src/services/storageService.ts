import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface IStorageService {
  saveFile(fileBuffer: Buffer, originalFilename: string, mimeType: string): Promise<{ storedFilename: string; relativePath: string }>;
  getFile(relativePath: string): Promise<Buffer>;
  deleteFile(relativePath: string): Promise<void>;
  getPublicUrl(relativePath: string): string;
}

export class LocalStorageService implements IStorageService {
  private uploadDir: string;

  constructor(customUploadDir?: string) {
    this.uploadDir = customUploadDir || path.resolve(process.cwd(), '../storage/uploads');
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async saveFile(fileBuffer: Buffer, originalFilename: string, _mimeType: string): Promise<{ storedFilename: string; relativePath: string }> {
    this.ensureDirectoryExists();
    const ext = path.extname(originalFilename) || '.png';
    const randomHex = crypto.randomBytes(8).toString('hex');
    const storedFilename = `record_${Date.now()}_${randomHex}${ext}`;
    const destination = path.join(this.uploadDir, storedFilename);

    await fs.promises.writeFile(destination, fileBuffer);

    return {
      storedFilename,
      relativePath: `/uploads/${storedFilename}`,
    };
  }

  async getFile(relativePath: string): Promise<Buffer> {
    const filename = path.basename(relativePath);
    const filePath = path.join(this.uploadDir, filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${relativePath}`);
    }
    return fs.promises.readFile(filePath);
  }

  async deleteFile(relativePath: string): Promise<void> {
    const filename = path.basename(relativePath);
    const filePath = path.join(this.uploadDir, filename);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  getPublicUrl(relativePath: string): string {
    return relativePath;
  }
}

export const defaultStorageService = new LocalStorageService();
