import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChapterAttachmentsController } from './chapter-attachments.controller';
import { ChapterAttachmentsService } from './chapter-attachments.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '@prisma/client';

// ---------------------------------------------------------------------------
// Minimal mock — only the service methods called by the controller
// ---------------------------------------------------------------------------

const mockChapterAttachmentsService = {
  create: jest.fn(),
  findAllByChapter: jest.fn(),
  delete: jest.fn(),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('ChapterAttachmentsController', () => {
  let controller: ChapterAttachmentsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChapterAttachmentsController],
      providers: [
        { provide: ChapterAttachmentsService, useValue: mockChapterAttachmentsService },
      ],
    })
      // Override guards so they don't require a real JWT/Passport setup in unit tests
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ChapterAttachmentsController>(ChapterAttachmentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // getByChapter()
  // -------------------------------------------------------------------------

  describe('getByChapter()', () => {
    it('should return attachments for the given chapter', async () => {
      const attachments = [{ id: 'att-1', title: 'Notes', chapterId: 'ch-1', fileUrl: '/url' }];
      mockChapterAttachmentsService.findAllByChapter.mockResolvedValue(attachments);

      const result = await controller.getByChapter('ch-1');

      expect(mockChapterAttachmentsService.findAllByChapter).toHaveBeenCalledWith('ch-1');
      expect(result).toEqual(attachments);
    });
  });

  // -------------------------------------------------------------------------
  // uploadAttachment()
  // -------------------------------------------------------------------------

  describe('uploadAttachment()', () => {
    const mockFile = {
      originalname: 'notes.pdf',
      buffer: Buffer.from(''),
      mimetype: 'application/pdf',
    } as Express.Multer.File;

    const mockReq = { user: { sub: 'instructor-1', role: Role.INSTRUCTOR } } as any;

    it('should call service.create and return the result', async () => {
      const created = { id: 'att-1', title: 'Notes', chapterId: 'ch-1', fileUrl: '/url' };
      mockChapterAttachmentsService.create.mockResolvedValue(created);

      const dto = { chapterId: 'ch-1', title: 'Notes' };
      const result = await controller.uploadAttachment(mockFile, dto, mockReq);

      expect(mockChapterAttachmentsService.create).toHaveBeenCalledWith(
        mockFile,
        dto,
        'instructor-1',
        Role.INSTRUCTOR,
      );
      expect(result).toEqual(created);
    });

    it('should throw InternalServerErrorException when file is missing', async () => {
      await expect(
        controller.uploadAttachment(undefined as any, { chapterId: 'ch-1', title: '' }, mockReq),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // -------------------------------------------------------------------------
  // deleteAttachment()
  // -------------------------------------------------------------------------

  describe('deleteAttachment()', () => {
    it('should call service.delete and return the result', async () => {
      mockChapterAttachmentsService.delete.mockResolvedValue({ id: 'att-1' });
      const mockReq = { user: { sub: 'instructor-1', role: Role.INSTRUCTOR } } as any;

      const result = await controller.deleteAttachment('att-1', mockReq);

      expect(mockChapterAttachmentsService.delete).toHaveBeenCalledWith(
        'att-1',
        'instructor-1',
        Role.INSTRUCTOR,
      );
      expect(result).toEqual({ id: 'att-1' });
    });
  });
});
