import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  NoSuchBucket,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import {
  ALL_MIME_TYPES,
  BLOCKED_EXTENSIONS,
} from '../common/config/upload.config';

@Injectable()
export class StorageService {
  private s3Client: S3Client | null = null;
  private readonly logger = new Logger(StorageService.name);
  private readonly localUploadDir: string;
  private readonly bucketName: string;
  private readonly publicUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.localUploadDir = path.join(process.cwd(), 'uploads');
    this.bucketName = this.configService.get<string>('R2_BUCKET_NAME') ?? '';
    this.publicUrl = this.configService.get<string>('R2_PUBLIC_URL') ?? '';

    const endpoint = this.configService.get<string>('R2_ENDPOINT');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('R2_SECRET_ACCESS_KEY');

    if (endpoint && accessKeyId && secretAccessKey && this.bucketName) {
      this.s3Client = new S3Client({
        region: 'auto',
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
      });
      this.logger.log('Storage mode: Cloudflare R2');
    } else {
      this.logger.log(`Storage mode: Local filesystem (${this.localUploadDir})`);
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: 'videos' | 'attachments' | 'exams' | 'avatars' | 'courses' | 'lectures',
  ): Promise<string> {
    // Layer 1 — Magic-byte verification
    const fileType = await import('file-type');
    const typeInfo = await fileType.default.fromBuffer(file.buffer);

    let secureExtension = '';
    let secureMime = file.mimetype;

    if (typeInfo) {
      secureExtension = `.${typeInfo.ext}`;
      secureMime = typeInfo.mime;

      if (!(ALL_MIME_TYPES as readonly string[]).includes(secureMime)) {
        throw new BadRequestException(
          `Invalid magic bytes: detected type "${secureMime}" is not in the allowed list.`,
        );
      }
    } else if (file.mimetype === 'text/plain') {
      if (!this.isAsciiOrUtf8(file.buffer)) {
        throw new BadRequestException('Disguised binary file detected (text/plain with non-text content).');
      }
      secureExtension = '.txt';
      secureMime = 'text/plain';
    } else {
      throw new BadRequestException(
        'Unknown or unsafe file signature detected — upload rejected.',
      );
    }

    // Layer 2 — Block dangerous extensions in the original filename
    const originalExt = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(originalExt)) {
      throw new BadRequestException(
        `Blocked file extension "${originalExt}" in original filename.`,
      );
    }

    // Layer 3 — Double-extension attack detection (e.g. file.php.jpg)
    const nameParts = file.originalname.toLowerCase().split('.');
    for (const part of nameParts) {
      if (BLOCKED_EXTENSIONS.includes(`.${part}`)) {
        throw new BadRequestException(
          'Hidden executable extension detected (double-extension attack).',
        );
      }
    }

    const key = `${folder}/${randomUUID()}${secureExtension}`;

    if (this.s3Client) {
      return this.uploadToR2(key, file.buffer, secureMime);
    }
    return this.uploadToLocal(key, file.buffer);
  }

  private async uploadToR2(key: string, buffer: Buffer, contentType: string): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });
      await this.s3Client!.send(command);
      return `${this.publicUrl}/${key}`;
    } catch (error: unknown) {
      this.logger.error('R2 upload failed', error);
      if (error instanceof NoSuchBucket) {
        throw new InternalServerErrorException('Storage bucket not found. Contact administrator.');
      }
      if (error instanceof Error) {
        const msg = error.message ?? '';
        if (msg.includes('credentials') || msg.includes('Credential')) {
          throw new InternalServerErrorException('Cloud storage credentials are invalid or missing.');
        }
        if (msg.includes('Network') || msg.includes('timeout') || msg.includes('ECONNREFUSED')) {
          throw new InternalServerErrorException('Cloud storage unavailable — network error.');
        }
      }
      throw new InternalServerErrorException('Cloud storage upload failed. Please try again.');
    }
  }

  private async uploadToLocal(key: string, buffer: Buffer): Promise<string> {
    const filePath = path.join(this.localUploadDir, key);
    const dir = path.dirname(filePath);

    try {
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(filePath, buffer);
      this.logger.debug(`Saved locally: ${filePath} (${buffer.length} bytes)`);
      return `/uploads/${key}`;
    } catch (error: unknown) {
      this.logger.error('Local storage write failed', error);
      if (error instanceof Error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EACCES' || code === 'EPERM') {
          throw new InternalServerErrorException('Local storage permission denied.');
        }
        if (code === 'ENOSPC') {
          throw new InternalServerErrorException('Local storage is full. Free up disk space and try again.');
        }
      }
      throw new InternalServerErrorException('Failed to save file to local storage.');
    }
  }

  private isAsciiOrUtf8(buffer: Buffer): boolean {
    for (let i = 0; i < Math.min(buffer.length, 4096); i++) {
      if (buffer[i] === 0x00) return false;
    }
    return true;
  }

  async generatePresignedUrl(
    folder: string,
    filename: string,
    mimetype: string,
    fileSize?: number,
  ): Promise<{ uploadUrl: string; objectKey: string; assetUrl: string }> {
    if (!this.s3Client) {
      throw new InternalServerErrorException('Direct upload is only supported with Cloudflare R2.');
    }

    const secureExtension = path.extname(filename).toLowerCase();
    
    if (BLOCKED_EXTENSIONS.includes(secureExtension)) {
      throw new BadRequestException(`Blocked file extension "${secureExtension}".`);
    }

    const nameParts = filename.toLowerCase().split('.');
    for (const part of nameParts) {
      if (BLOCKED_EXTENSIONS.includes(`.${part}`)) {
        throw new BadRequestException('Hidden executable extension detected.');
      }
    }

    const key = `${folder}/${randomUUID()}${secureExtension}`;
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: mimetype,
      ...(fileSize ? { ContentLength: fileSize } : {}),
    });

    try {
      const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
      return {
        uploadUrl,
        objectKey: key,
        assetUrl: `${this.publicUrl}/${key}`,
      };
    } catch (error) {
      this.logger.error('Failed to generate presigned URL', error);
      throw new InternalServerErrorException('Failed to generate upload URL.');
    }
  }

  async generatePresignedGetUrl(fileUrl: string, expiresIn: number = 300): Promise<string> {
    if (!this.s3Client) {
      return fileUrl; // Fallback for local storage
    }

    let key = fileUrl;
    if (this.publicUrl && fileUrl.startsWith(this.publicUrl)) {
      key = fileUrl.substring(this.publicUrl.length + 1);
    } else if (fileUrl.startsWith('https://')) {
      // Try to parse the URL to extract the path (key)
      try {
        const urlObj = new URL(fileUrl);
        key = urlObj.pathname.substring(1); // Remove leading slash
      } catch (e) {
        // Fallback
      }
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error) {
      this.logger.error('Failed to generate presigned GET URL', error);
      throw new InternalServerErrorException('Failed to generate secure URL.');
    }
  }

  async verifyR2Object(key: string): Promise<boolean> {
    if (!this.s3Client) return false;
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await this.s3Client.send(command);
      return true;
    } catch (error) {
      this.logger.error(`Object verification failed for ${key}`, error);
      return false;
    }
  }
}
