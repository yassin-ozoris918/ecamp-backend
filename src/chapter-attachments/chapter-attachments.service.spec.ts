import { Test, TestingModule } from '@nestjs/testing';
import { ChapterAttachmentsService } from './chapter-attachments.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';

// ---------------------------------------------------------------------------
// Minimal mocks — only the Prisma model methods actually used by this service
// ---------------------------------------------------------------------------

const mockPrisma = {
  chapterAttachment: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  chapter: {
    findFirst: jest.fn(),
  },
  courseInstructor: {
    findFirst: jest.fn(),
  },
};

const mockStorage = {
  uploadFile: jest.fn(),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('ChapterAttachmentsService', () => {
  let service: ChapterAttachmentsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChapterAttachmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<ChapterAttachmentsService>(ChapterAttachmentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // create()
  // -------------------------------------------------------------------------

  describe('create()', () => {
    const mockFile = {
      originalname: 'lecture-notes.pdf',
      buffer: Buffer.from(''),
      mimetype: 'application/pdf',
    } as Express.Multer.File;

    const dto = { chapterId: 'chapter-1', title: 'Lecture Notes' };
    const instructorId = 'instructor-1';

    it('should upload file and create attachment record for ADMIN (no ownership check)', async () => {
      mockStorage.uploadFile.mockResolvedValue('/uploads/courses/file.pdf');
      mockPrisma.chapterAttachment.create.mockResolvedValue({
        id: 'att-1',
        title: 'Lecture Notes',
        chapterId: 'chapter-1',
        fileUrl: '/uploads/courses/file.pdf',
      });

      const result = await service.create(mockFile, dto, instructorId, Role.ADMIN);

      expect(mockStorage.uploadFile).toHaveBeenCalledWith(mockFile, 'courses');
      expect(mockPrisma.chapterAttachment.create).toHaveBeenCalledWith({
        data: {
          title: 'Lecture Notes',
          chapterId: 'chapter-1',
          fileUrl: '/uploads/courses/file.pdf',
        },
      });
      expect(result.fileUrl).toBe('/uploads/courses/file.pdf');
    });

    it('should use file.originalname as title when dto.title is not provided', async () => {
      mockStorage.uploadFile.mockResolvedValue('/uploads/courses/file.pdf');
      mockPrisma.chapterAttachment.create.mockResolvedValue({
        id: 'att-2',
        title: 'lecture-notes.pdf',
        chapterId: 'chapter-1',
        fileUrl: '/uploads/courses/file.pdf',
      });

      await service.create(mockFile, { chapterId: 'chapter-1', title: '' }, instructorId, Role.ADMIN);

      expect(mockPrisma.chapterAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ title: 'lecture-notes.pdf' }) }),
      );
    });

    it('should throw ForbiddenException when instructor does not own the chapter', async () => {
      mockPrisma.chapter.findFirst.mockResolvedValue({ courseId: 'course-1' });
      mockPrisma.courseInstructor.findFirst.mockResolvedValue(null); // no mapping

      await expect(
        service.create(mockFile, dto, 'other-instructor', Role.INSTRUCTOR),
      ).rejects.toThrow(ForbiddenException);

      expect(mockStorage.uploadFile).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when chapter does not exist', async () => {
      mockPrisma.chapter.findFirst.mockResolvedValue(null);

      await expect(
        service.create(mockFile, dto, instructorId, Role.INSTRUCTOR),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // -------------------------------------------------------------------------
  // findAllByChapter()
  // -------------------------------------------------------------------------

  describe('findAllByChapter()', () => {
    it('should return all attachments for a chapter ordered by createdAt asc', async () => {
      const attachments = [
        { id: 'att-1', title: 'Notes', chapterId: 'chapter-1', fileUrl: '/url' },
      ];
      mockPrisma.chapterAttachment.findMany.mockResolvedValue(attachments);

      const result = await service.findAllByChapter('chapter-1');

      expect(mockPrisma.chapterAttachment.findMany).toHaveBeenCalledWith({
        where: { chapterId: 'chapter-1' },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual(attachments);
    });
  });

  // -------------------------------------------------------------------------
  // delete()
  // -------------------------------------------------------------------------

  describe('delete()', () => {
    it('should delete the attachment when the instructor owns the course', async () => {
      mockPrisma.chapterAttachment.findUnique.mockResolvedValue({
        id: 'att-1',
        chapter: { courseId: 'course-1' },
      });
      mockPrisma.courseInstructor.findFirst.mockResolvedValue({ id: 'mapping-1' });
      mockPrisma.chapterAttachment.delete.mockResolvedValue({ id: 'att-1' });

      const result = await service.delete('att-1', 'instructor-1', Role.INSTRUCTOR);

      expect(mockPrisma.chapterAttachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
      expect(result).toEqual({ id: 'att-1' });
    });

    it('should throw NotFoundException when attachment does not exist', async () => {
      mockPrisma.chapterAttachment.findUnique.mockResolvedValue(null);

      await expect(
        service.delete('nonexistent-id', 'instructor-1', Role.INSTRUCTOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when instructor does not own the course', async () => {
      mockPrisma.chapterAttachment.findUnique.mockResolvedValue({
        id: 'att-1',
        chapter: { courseId: 'course-1' },
      });
      mockPrisma.courseInstructor.findFirst.mockResolvedValue(null); // no mapping

      await expect(
        service.delete('att-1', 'other-instructor', Role.INSTRUCTOR),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.chapterAttachment.delete).not.toHaveBeenCalled();
    });

    it('should allow ADMIN to delete any attachment without ownership check', async () => {
      mockPrisma.chapterAttachment.findUnique.mockResolvedValue({
        id: 'att-1',
        chapter: { courseId: 'course-1' },
      });
      mockPrisma.chapterAttachment.delete.mockResolvedValue({ id: 'att-1' });

      await service.delete('att-1', 'any-user', Role.ADMIN);

      // ADMIN bypasses ownership; courseInstructor.findFirst should NOT be queried
      expect(mockPrisma.courseInstructor.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.chapterAttachment.delete).toHaveBeenCalled();
    });
  });
});
