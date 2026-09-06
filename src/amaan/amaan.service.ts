import { Injectable, Logger, InternalServerErrorException, BadGatewayException, GatewayTimeoutException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AmaanOtpResponse {
  otp: string;
  playbackInfo: string;
}

@Injectable()
export class AmaanService {
  private readonly logger = new Logger(AmaanService.name);
  private readonly apiUrl = 'https://api.amaaan.net/api/video/generate-otp';

  constructor(private readonly configService: ConfigService) {}

  async generateOtp(videoUid: string, wid?: string): Promise<AmaanOtpResponse> {
    if (!videoUid) {
      throw new InternalServerErrorException('Video UID is required for Amaan OTP generation');
    }

    const apiKey = this.configService.get<string>('AMAAN_API_KEY');
    if (!apiKey) {
      this.logger.error('AMAAN_API_KEY is not configured');
      throw new InternalServerErrorException('Video provider configuration is missing');
    }

    const url = `${this.apiUrl}/${videoUid}/`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const requestBody = wid ? JSON.stringify({ wid }) : undefined;

    const startTime = Date.now();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `api-key ${apiKey}`,
          ...(wid ? { 'Content-Type': 'application/json' } : {}),
        },
        body: requestBody,
        signal: controller.signal,
        cache: 'no-store', // Ensure no caching
      });

      const duration = Date.now() - startTime;
      this.logger.log(`Amaan OTP request completed in ${duration}ms with status ${response.status}`);

      if (!response.ok) {
        this.logger.error(`Amaan API returned error status ${response.status}`);
        throw new BadGatewayException('Failed to communicate with video provider');
      }

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        this.logger.error('Failed to parse Amaan API response as JSON');
        throw new BadGatewayException('Invalid response from video provider');
      }

      if (!data || typeof data.otp !== 'string' || typeof data.playbackInfo !== 'string') {
        this.logger.error('Amaan API returned invalid response format missing required fields');
        throw new BadGatewayException('Invalid response from video provider');
      }

      return {
        otp: data.otp,
        playbackInfo: data.playbackInfo,
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        this.logger.error('Amaan API request timed out');
        throw new GatewayTimeoutException('Video provider timeout');
      }
      
      if (error instanceof BadGatewayException) {
        throw error;
      }

      this.logger.error(`Amaan API network request failed: ${error.message}`);
      throw new BadGatewayException('Failed to communicate with video provider');
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
