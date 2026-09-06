import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException, BadGatewayException, GatewayTimeoutException } from '@nestjs/common';
import { AmaanService } from './amaan.service';

describe('AmaanService', () => {
  let service: AmaanService;
  let configService: ConfigService;
  let originalFetch: typeof fetch;

  const mockApiKey = 'test-api-key';
  const mockVideoUid = 'test-video-uid';
  const mockWid = 'test-wid';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AmaanService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'AMAAN_API_KEY') return mockApiKey;
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AmaanService>(AmaanService);
    configService = module.get<ConfigService>(ConfigService);
    
    // Save original fetch
    originalFetch = global.fetch;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateOtp', () => {
    it('should return otp and playbackInfo on successful response', async () => {
      const mockResponse = {
        otp: 'test-otp',
        playbackInfo: 'test-playback-info',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await service.generateOtp(mockVideoUid, mockWid);

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      
      const fetchCallArgs = (global.fetch as jest.Mock).mock.calls[0];
      const url = fetchCallArgs[0];
      const options = fetchCallArgs[1];

      expect(url).toBe(`https://api.amaaan.net/api/video/generate-otp/${mockVideoUid}/`);
      expect(options.method).toBe('POST');
      expect(options.headers['Authorization']).toBe(`api-key ${mockApiKey}`);
      expect(options.body).toBe(JSON.stringify({ wid: mockWid }));
      expect(options.cache).toBe('no-store');
    });

    it('should throw InternalServerErrorException if AMAAN_API_KEY is missing', async () => {
      jest.spyOn(configService, 'get').mockReturnValueOnce(undefined);

      await expect(service.generateOtp(mockVideoUid)).rejects.toThrow(InternalServerErrorException);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException if videoUid is empty', async () => {
      await expect(service.generateOtp('')).rejects.toThrow(InternalServerErrorException);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should throw BadGatewayException on Amaan 401 or 403 response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(service.generateOtp(mockVideoUid)).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException on Amaan 400 response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      await expect(service.generateOtp(mockVideoUid)).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException on Amaan 5xx response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(service.generateOtp(mockVideoUid)).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException if response missing otp', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ playbackInfo: 'test-playback-info' }),
      });

      await expect(service.generateOtp(mockVideoUid)).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException if response missing playbackInfo', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ otp: 'test-otp' }),
      });

      await expect(service.generateOtp(mockVideoUid)).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException on malformed response field types', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ otp: 123, playbackInfo: {} }), // wrong types
      });

      await expect(service.generateOtp(mockVideoUid)).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException on network failure', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      await expect(service.generateOtp(mockVideoUid)).rejects.toThrow(BadGatewayException);
      
      // Verify no blind retries (fetch called exactly once)
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should throw GatewayTimeoutException on request timeout', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      (global.fetch as jest.Mock).mockRejectedValueOnce(abortError);

      await expect(service.generateOtp(mockVideoUid)).rejects.toThrow(GatewayTimeoutException);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
