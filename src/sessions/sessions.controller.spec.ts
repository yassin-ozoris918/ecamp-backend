import { Test, TestingModule } from '@nestjs/testing';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { StorageService } from '../storage/storage.service';
import { CloudflareService } from '../cloudflare/cloudflare.service';
import { BadRequestException } from '@nestjs/common';

describe('SessionsController', () => {
  let controller: SessionsController;
  let mockSessionsService: any;
  let mockStorageService: any;
  let mockCloudflareService: any;

  beforeEach(async () => {
    mockSessionsService = {
      verifySessionOwnershipById: jest.fn(),
      updateVideoUrl: jest.fn(),
    };

    mockStorageService = {
      generatePresignedUrl: jest.fn(),
      verifyR2Object: jest.fn(),
    };

    mockCloudflareService = {
      isConfigured: jest.fn().mockReturnValue(false),
      createDirectUploadUrl: jest.fn(),
      verifyVideoExists: jest.fn(),
      extractVideoUid: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionsController],
      providers: [
        { provide: SessionsService, useValue: mockSessionsService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: CloudflareService, useValue: mockCloudflareService },
      ],
    }).compile();

    controller = module.get<SessionsController>(SessionsController);
  });

  describe('initUpload', () => {
    it('should generate a Cloudflare Stream direct upload URL when Cloudflare Stream is configured', async () => {
      const mockReq = { user: { sub: 'inst-1', role: 'INSTRUCTOR' } };
      mockCloudflareService.isConfigured.mockReturnValue(true);
      mockCloudflareService.createDirectUploadUrl.mockResolvedValue({
        uploadUrl: 'https://upload.videodelivery.net/direct-upload-token',
        objectKey: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
        assetUrl: 'https://customer-123.cloudflarestream.com/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4/iframe',
      });

      const res = await controller.initUpload(
        'session-1',
        { filename: 'lecture.mp4', mimetype: 'video/mp4', fileSize: 1024 },
        mockReq as any,
      );

      expect(mockSessionsService.verifySessionOwnershipById).toHaveBeenCalledWith('session-1', 'inst-1', 'INSTRUCTOR');
      expect(mockCloudflareService.createDirectUploadUrl).toHaveBeenCalledWith({ filename: 'lecture.mp4' });
      expect(res.provider).toBe('CLOUDFLARE_STREAM');
      expect(res.uploadUrl).toBe('https://upload.videodelivery.net/direct-upload-token');
      expect(res.objectKey).toBe('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4');
    });

    it('should generate a presigned R2 URL when Cloudflare Stream is not configured', async () => {
      const mockReq = { user: { sub: 'inst-1', role: 'INSTRUCTOR' } };
      mockStorageService.generatePresignedUrl.mockResolvedValue({
        uploadUrl: 'http://r2/presigned',
        objectKey: 'videos/123.mp4',
        assetUrl: 'http://r2-public/videos/123.mp4',
      });

      const res = await controller.initUpload('session-1', { filename: 'test.mp4', mimetype: 'video/mp4', fileSize: 1024 }, mockReq as any);
      
      expect(mockSessionsService.verifySessionOwnershipById).toHaveBeenCalledWith('session-1', 'inst-1', 'INSTRUCTOR');
      expect(mockStorageService.generatePresignedUrl).toHaveBeenCalledWith('videos', 'test.mp4', 'video/mp4', 1024);
      expect(res.uploadUrl).toBe('http://r2/presigned');
      expect(res.objectKey).toBe('videos/123.mp4');
    });

    it('should reject if filename, mimetype, or fileSize is missing', async () => {
      const mockReq = { user: { sub: 'inst-1', role: 'INSTRUCTOR' } };
      await expect(controller.initUpload('session-1', { filename: '', mimetype: 'video/mp4', fileSize: 1024 }, mockReq as any))
        .rejects.toThrow(BadRequestException);
      await expect(controller.initUpload('session-1', { filename: 'test.mp4', mimetype: 'video/mp4', fileSize: undefined as any }, mockReq as any))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('completeUpload', () => {
    it('should finalize if Cloudflare Stream video exists', async () => {
      const mockReq = { user: { sub: 'inst-1', role: 'INSTRUCTOR' } };
      const uid = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
      const embedUrl = `https://customer-123.cloudflarestream.com/${uid}/iframe`;
      mockCloudflareService.isConfigured.mockReturnValue(true);
      mockCloudflareService.extractVideoUid.mockReturnValue(uid);
      mockCloudflareService.verifyVideoExists.mockResolvedValue(true);
      mockSessionsService.updateVideoUrl.mockResolvedValue({ id: 'session-1', videoUrl: embedUrl });

      const res = await controller.completeUpload(
        'session-1',
        { objectKey: uid, assetUrl: embedUrl },
        mockReq as any,
      );

      expect(mockCloudflareService.verifyVideoExists).toHaveBeenCalledWith(uid);
      expect(mockSessionsService.updateVideoUrl).toHaveBeenCalledWith('session-1', embedUrl, 'inst-1', 'INSTRUCTOR');
      expect(res.session.videoUrl).toBe(embedUrl);
    });

    it('should finalize if R2 object exists', async () => {
      const mockReq = { user: { sub: 'inst-1', role: 'INSTRUCTOR' } };
      mockStorageService.verifyR2Object.mockResolvedValue(true);
      mockSessionsService.updateVideoUrl.mockResolvedValue({ id: 'session-1', videoUrl: 'http://r2-public/videos/123.mp4' });

      const res = await controller.completeUpload('session-1', { objectKey: 'videos/123.mp4', assetUrl: 'http://r2-public/videos/123.mp4' }, mockReq as any);

      expect(mockStorageService.verifyR2Object).toHaveBeenCalledWith('videos/123.mp4');
      expect(mockSessionsService.updateVideoUrl).toHaveBeenCalledWith('session-1', 'http://r2-public/videos/123.mp4', 'inst-1', 'INSTRUCTOR');
      expect(res.session.videoUrl).toBe('http://r2-public/videos/123.mp4');
    });

    it('should reject if R2 object does not exist', async () => {
      const mockReq = { user: { sub: 'inst-1', role: 'INSTRUCTOR' } };
      mockStorageService.verifyR2Object.mockResolvedValue(false);

      await expect(controller.completeUpload('session-1', { objectKey: 'videos/123.mp4', assetUrl: 'http://r2-public/videos/123.mp4' }, mockReq as any))
        .rejects.toThrow(BadRequestException);
      
      expect(mockSessionsService.updateVideoUrl).not.toHaveBeenCalled();
    });
  });
});
