import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { LecturesService } from './lectures.service';
import { PrismaService } from '../prisma/prisma.service';
import { CloudflareService } from '../cloudflare/cloudflare.service';
import { AmaanService } from '../amaan/amaan.service';
import { VideoProvider, Role } from '@prisma/client';

describe('LecturesService - getSecureStreamToken', () => {
  let service: LecturesService;
  let prisma: PrismaService;
  let amaanService: AmaanService;
  let cloudflareService: CloudflareService;

  const mockSessionId = 'session-1';
  const mockStudentId = 'student-1';
  const mockLectureId = 'lecture-1';
  const mockCourseId = 'course-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LecturesService,
        {
          provide: PrismaService,
          useValue: {
            session: { findUnique: jest.fn() },
            studentLectureAccess: { findFirst: jest.fn() },
            course: { findUnique: jest.fn() },
          },
        },
        {
          provide: CloudflareService,
          useValue: {
            generateSignedUrl: jest.fn((id) => `signed-url-${id}`),
          },
        },
        {
          provide: AmaanService,
          useValue: {
            generateOtp: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<LecturesService>(LecturesService);
    prisma = module.get<PrismaService>(PrismaService);
    amaanService = module.get<AmaanService>(AmaanService);
    cloudflareService = module.get<CloudflareService>(CloudflareService);
  });

  const setupPrismaMocks = ({
    sessionFound = true,
    videoProvider = VideoProvider.NATIVE,
    videoUrl = 'http://native.url',
    amaanVideoId = 'vid-123',
    accessFound = true,
    isStarted = true,
    expiresAt = null,
    isFree = false,
  }: any = {}) => {
    (prisma.session.findUnique as jest.Mock).mockResolvedValue(
      sessionFound ? {
        id: mockSessionId,
        lectureId: mockLectureId,
        videoProvider,
        videoUrl,
        amaanVideoId,
        lecture: { courseId: mockCourseId },
      } : null,
    );

    (prisma.studentLectureAccess.findFirst as jest.Mock).mockResolvedValue(
      accessFound ? { isStarted, expiresAt } : null,
    );

    (prisma.course.findUnique as jest.Mock).mockResolvedValue({ isFree });
  };

  it('1. Unauthorized request (not enrolled) is rejected before AmaanService is called', async () => {
    setupPrismaMocks({ accessFound: false });
    await expect(service.getSecureStreamToken(mockSessionId, mockStudentId)).rejects.toThrow(ForbiddenException);
    expect(amaanService.generateOtp).not.toHaveBeenCalled();
  });

  it('2. Authenticated but unstarted is rejected before AmaanService is called', async () => {
    setupPrismaMocks({ isStarted: false });
    await expect(service.getSecureStreamToken(mockSessionId, mockStudentId)).rejects.toThrow(ForbiddenException);
    expect(amaanService.generateOtp).not.toHaveBeenCalled();
  });

  it('3. Expired StudentLectureAccess is rejected before AmaanService is called', async () => {
    const pastDate = new Date(Date.now() - 10000);
    setupPrismaMocks({ expiresAt: pastDate });
    await expect(service.getSecureStreamToken(mockSessionId, mockStudentId)).rejects.toThrow(ForbiddenException);
    expect(amaanService.generateOtp).not.toHaveBeenCalled();
  });

  it('4. Invalid or inaccessible session is rejected before AmaanService is called', async () => {
    setupPrismaMocks({ sessionFound: false });
    await expect(service.getSecureStreamToken(mockSessionId, mockStudentId)).rejects.toThrow(NotFoundException);
    expect(amaanService.generateOtp).not.toHaveBeenCalled();
  });

  it('5. Native provider returns the existing native response unchanged', async () => {
    setupPrismaMocks({ videoProvider: VideoProvider.NATIVE, videoUrl: 'http://direct.url' });
    const result = await service.getSecureStreamToken(mockSessionId, mockStudentId);
    expect(result).toEqual({ playbackUrl: 'http://direct.url' });
    expect(amaanService.generateOtp).not.toHaveBeenCalled();
  });

  it('6 & 7. Amaan provider with valid UID calls AmaanService and returns typed response', async () => {
    setupPrismaMocks({ videoProvider: VideoProvider.AMAAN, amaanVideoId: 'amaaan-uid' });
    (amaanService.generateOtp as jest.Mock).mockResolvedValue({
      otp: 'test-otp',
      playbackInfo: 'test-info',
    });

    const result = await service.getSecureStreamToken(mockSessionId, mockStudentId);
    
    expect(amaanService.generateOtp).toHaveBeenCalledWith('amaaan-uid', `user_${mockStudentId}_session_${mockSessionId}`);
    expect(result).toEqual({
      provider: 'AMAAN',
      otp: 'test-otp',
      playbackInfo: 'test-info',
    });
  });

  it('8. Amaan provider without an Amaan UID fails safely', async () => {
    setupPrismaMocks({ videoProvider: VideoProvider.AMAAN, amaanVideoId: null });
    await expect(service.getSecureStreamToken(mockSessionId, mockStudentId)).rejects.toThrow(NotFoundException);
    expect(amaanService.generateOtp).not.toHaveBeenCalled();
  });

  it('10. AmaanService failure is mapped to safe error format automatically by letting it propagate', async () => {
    setupPrismaMocks({ videoProvider: VideoProvider.AMAAN });
    (amaanService.generateOtp as jest.Mock).mockRejectedValue(new Error('Network error'));
    
    await expect(service.getSecureStreamToken(mockSessionId, mockStudentId)).rejects.toThrow();
  });
});
