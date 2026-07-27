import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class CloudflareService {
  constructor(private configService: ConfigService) {}

  /**
   * Generates a signed URL for a Cloudflare Stream video.
   * @param videoId The Cloudflare Stream Video ID
   * @param expiresIn Validity duration in seconds (default: 3600s = 1 hour)
   */
  generateSignedUrl(videoId: string, expiresIn: number = 3600): string {
    const keyId = this.configService.get<string>('CLOUDFLARE_STREAM_KEY_ID');
    const pemKey = this.configService.get<string>('CLOUDFLARE_STREAM_PEM_KEY');
    const accountId = this.configService.get<string>('CLOUDFLARE_ACCOUNT_ID');

    if (!keyId || !pemKey || !accountId) {
      // In development, if keys are missing, return a dummy mock URL
      return `https://customer-mock.cloudflarestream.com/${videoId}/iframe?token=mock_token_${Date.now()}`;
    }

    try {
      const exp = Math.floor(Date.now() / 1000) + expiresIn;
      const payload = {
        sub: videoId,
        kid: keyId,
        exp,
        accessRules: [
          {
            type: 'any',
            action: 'allow',
          },
        ],
      };

      const token = jwt.sign(payload, pemKey, { algorithm: 'RS256' });
      return `https://customer-${accountId}.cloudflarestream.com/${videoId}/iframe?token=${token}`;
    } catch (error) {
      throw new InternalServerErrorException('Failed to generate video token');
    }
  }
}
