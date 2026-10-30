import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class CloudflareService {
  private readonly logger = new Logger(CloudflareService.name);

  constructor(private configService: ConfigService) {}

  /**
   * Returns true when Cloudflare Stream API credentials are configured for uploads.
   */
  isConfigured(): boolean {
    const accountId = this.configService.get<string>('CLOUDFLARE_ACCOUNT_ID');
    const apiToken =
      this.configService.get<string>('CLOUDFLARE_STREAM_TOKEN') ||
      this.configService.get<string>('CLOUDFLARE_API_TOKEN');
    return Boolean(accountId && apiToken);
  }

  private getApiToken(): string {
    return (
      this.configService.get<string>('CLOUDFLARE_STREAM_TOKEN') ||
      this.configService.get<string>('CLOUDFLARE_API_TOKEN') ||
      ''
    );
  }

  private getCustomerSubdomain(): string {
    return (
      this.configService.get<string>('CLOUDFLARE_STREAM_CUSTOMER_CODE') ||
      this.configService.get<string>('CLOUDFLARE_ACCOUNT_ID') ||
      'mock'
    );
  }

  private hasSigningKeys(): boolean {
    const keyId = this.configService.get<string>('CLOUDFLARE_STREAM_KEY_ID');
    const pemKey = this.configService.get<string>('CLOUDFLARE_STREAM_PEM_KEY');
    return Boolean(keyId && pemKey);
  }

  /**
   * Extracts a 32-character hex Cloudflare Stream UID from a UID or URL.
   */
  extractVideoUid(input: string): string | null {
    if (!input) return null;
    const trimmed = input.trim();
    if (/^[a-f0-9]{32}$/i.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    if (
      trimmed.includes('cloudflarestream.com') ||
      trimmed.includes('videodelivery.net')
    ) {
      const match = trimmed.match(/\/([a-f0-9]{32})(?:\/|\?|$)/i);
      if (match) return match[1].toLowerCase();
    }
    return null;
  }

  getEmbedUrl(videoUid: string): string {
    const subdomain = this.getCustomerSubdomain();
    return `https://customer-${subdomain}.cloudflarestream.com/${videoUid}/iframe`;
  }

  /**
   * Creates a one-time Direct Creator Upload URL in Cloudflare Stream.
   * The frontend uploads the video directly via POST multipart/form-data (`file`).
   */
  async createDirectUploadUrl(options?: {
    filename?: string;
    maxDurationSeconds?: number;
  }): Promise<{ uploadUrl: string; objectKey: string; assetUrl: string }> {
    const accountId = this.configService.get<string>('CLOUDFLARE_ACCOUNT_ID');
    const apiToken = this.getApiToken();

    if (!accountId || !apiToken) {
      throw new InternalServerErrorException(
        'Cloudflare Stream credentials are not configured.',
      );
    }

    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            maxDurationSeconds: options?.maxDurationSeconds ?? 14400, // 4 hours default max
            requireSignedURLs: this.hasSigningKeys(),
            ...(options?.filename ? { meta: { name: options.filename } } : {}),
          }),
        },
      );

      const data = (await response.json()) as {
        success?: boolean;
        result?: { uploadURL: string; uid: string };
        errors?: Array<{ message: string }>;
      };

      if (!response.ok || !data?.success || !data.result?.uploadURL || !data.result?.uid) {
        const errMsg = data?.errors?.map((e) => e.message).join(', ') || response.statusText;
        this.logger.error(`Cloudflare Stream direct_upload failed: ${errMsg}`);
        throw new InternalServerErrorException(
          'Failed to initialize Cloudflare Stream upload.',
        );
      }

      const videoUid = data.result.uid;
      return {
        uploadUrl: data.result.uploadURL,
        objectKey: videoUid,
        assetUrl: this.getEmbedUrl(videoUid),
      };
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      this.logger.error('Cloudflare Stream direct_upload error', error);
      throw new InternalServerErrorException(
        'Failed to communicate with Cloudflare Stream.',
      );
    }
  }

  /**
   * Fallback upload of a video buffer from the backend directly to Cloudflare Stream.
   */
  async uploadVideoBuffer(
    buffer: Buffer,
    filename: string,
    mimetype: string,
  ): Promise<string> {
    const accountId = this.configService.get<string>('CLOUDFLARE_ACCOUNT_ID');
    const apiToken = this.getApiToken();

    if (!accountId || !apiToken) {
      throw new InternalServerErrorException(
        'Cloudflare Stream credentials are not configured.',
      );
    }

    try {
      const formData = new FormData();
      const uint8 = new Uint8Array(buffer);
      const blob = new Blob([uint8], { type: mimetype || 'video/mp4' });
      formData.append('file', blob, filename || 'video.mp4');
      if (this.hasSigningKeys()) {
        formData.append('requireSignedURLs', 'true');
      }

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
          },
          body: formData,
        },
      );

      const data = (await response.json()) as {
        success?: boolean;
        result?: { uid: string };
        errors?: Array<{ message: string }>;
      };

      if (!response.ok || !data?.success || !data.result?.uid) {
        const errMsg = data?.errors?.map((e) => e.message).join(', ') || response.statusText;
        this.logger.error(`Cloudflare Stream buffer upload failed: ${errMsg}`);
        throw new InternalServerErrorException(
          'Cloudflare Stream video upload failed.',
        );
      }

      return this.getEmbedUrl(data.result.uid);
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      this.logger.error('Cloudflare Stream buffer upload error', error);
      throw new InternalServerErrorException(
        'Cloudflare Stream video upload failed.',
      );
    }
  }

  /**
   * Verifies that a video exists in Cloudflare Stream after direct upload.
   */
  async verifyVideoExists(videoIdOrUrl: string): Promise<boolean> {
    const accountId = this.configService.get<string>('CLOUDFLARE_ACCOUNT_ID');
    const apiToken = this.getApiToken();
    const uid = this.extractVideoUid(videoIdOrUrl);

    if (!accountId || !apiToken || !uid) {
      return false;
    }

    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiToken}`,
          },
        },
      );

      if (!response.ok) return false;
      const data = (await response.json()) as { success?: boolean; result?: { uid: string } };
      return Boolean(data?.success && data.result?.uid);
    } catch (error) {
      this.logger.error(`Cloudflare Stream verification failed for ${uid}`, error);
      return false;
    }
  }

  /**
   * Deletes a video from Cloudflare Stream.
   */
  async deleteVideo(videoIdOrUrl: string): Promise<void> {
    const accountId = this.configService.get<string>('CLOUDFLARE_ACCOUNT_ID');
    const apiToken = this.getApiToken();
    const uid = this.extractVideoUid(videoIdOrUrl);

    if (!accountId || !apiToken || !uid) return;

    try {
      await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${apiToken}`,
          },
        },
      );
    } catch (error) {
      this.logger.error(`Failed to delete video ${uid} from Cloudflare Stream`, error);
    }
  }

  /**
   * Generates a signed (or unsigned) embed URL for a Cloudflare Stream video.
   * @param videoId The Cloudflare Stream Video ID or URL
   * @param expiresIn Validity duration in seconds (default: 3600s = 1 hour)
   */
  generateSignedUrl(videoId: string, expiresIn: number = 3600): string {
    const uid = this.extractVideoUid(videoId) || videoId;
    const keyId = this.configService.get<string>('CLOUDFLARE_STREAM_KEY_ID');
    const pemKey = this.configService.get<string>('CLOUDFLARE_STREAM_PEM_KEY');
    const accountId = this.configService.get<string>('CLOUDFLARE_ACCOUNT_ID');
    const subdomain = this.getCustomerSubdomain();

    if (!keyId || !pemKey) {
      if (accountId || this.configService.get<string>('CLOUDFLARE_STREAM_CUSTOMER_CODE')) {
        return `https://customer-${subdomain}.cloudflarestream.com/${uid}/iframe`;
      }
      // In development, if keys are missing, return a dummy mock URL
      return `https://customer-mock.cloudflarestream.com/${uid}/iframe?token=mock_token_${Date.now()}`;
    }

    try {
      const exp = Math.floor(Date.now() / 1000) + expiresIn;
      const payload = {
        sub: uid,
        kid: keyId,
        exp,
        accessRules: [
          {
            type: 'any',
            action: 'allow',
          },
        ],
      };

      // Handle escaped newlines in PEM keys stored in .env
      const normalizedPem = pemKey.includes('\\n')
        ? pemKey.replace(/\\n/g, '\n')
        : pemKey;

      const token = jwt.sign(payload, normalizedPem, { algorithm: 'RS256' });
      return `https://customer-${subdomain}.cloudflarestream.com/${uid}/iframe?token=${token}`;
    } catch (error) {
      throw new InternalServerErrorException('Failed to generate video token');
    }
  }
}
